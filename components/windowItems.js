const { getSlotCustomName } = require('./helpers');

const TRACKER_KEY = Symbol.for('eternity.windowItemTracker');

function parseWindowTitle(windowTitle) {
    const unwrap = (node) => {
        if (node == null) return '';
        if (typeof node === 'string') return node;
        if (typeof node !== 'object') return String(node);
        if (node.extra && Array.isArray(node.extra)) {
            return node.extra.map((e) => unwrap(e)).join('');
        }
        if (node.text != null && typeof node.text === 'string') return node.text;
        if (typeof node.translate === 'string') return node.translate;
        if (node.translate != null && typeof node.translate === 'object') {
            return unwrap(node.translate);
        }
        if (node.type === 'string' && node.value != null) return String(node.value);
        if (node.type === 'compound' && node.value != null) return unwrap(node.value);
        if (node.value != null && typeof node.value === 'object') return unwrap(node.value);
        return '';
    };

    try {
        if (typeof windowTitle === 'string') {
            try {
                const parsed = JSON.parse(windowTitle);
                const inner = unwrap(parsed);
                return inner || windowTitle;
            } catch {
                return windowTitle;
            }
        }
        if (typeof windowTitle === 'object') {
            const inner = unwrap(windowTitle);
            return inner || JSON.stringify(windowTitle);
        }
        return String(windowTitle);
    } catch {
        return String(windowTitle);
    }
}

function stripColors(text) {
    return String(text ?? '').replace(/§[0-9a-fk-or]/gi, '');
}

function getItemFactory(bot) {
    const registry = bot?.flayer?.registry;
    if (!registry) return null;
    return require('prismarine-item')(registry);
}

function normalizeSlot(bot, item) {
    if (!item || item.present === false) return null;
    if (item.name || item.componentMap || item.nbt) return item;

    try {
        const Item = getItemFactory(bot);
        return Item ? Item.fromNotch(item) : item;
    } catch {
        return item;
    }
}

function windowIdMatches(packetWid, expected) {
    if (packetWid === undefined || packetWid === null) return true;
    return Number(packetWid) === Number(expected);
}

function packetWindowId(data) {
    return data?.windowId ?? data?.containerId;
}

function packetSlots(data) {
    return data?.items ?? data?.slots ?? data?.itemStacks;
}

function scanSlots(bot, slots, predicate, maxSlots = 54) {
    if (!Array.isArray(slots)) return null;
    for (let i = 0; i < Math.min(slots.length, maxSlots); i++) {
        const slot = normalizeSlot(bot, slots[i]);
        if (!slot) continue;
        if (predicate(slot, i)) return { slotIndex: i, slot };
    }
    return null;
}

function scanCurrentWindow(bot, windowId, predicate, maxSlots) {
    const currentWindow = bot?.flayer?.currentWindow;
    if (!currentWindow) return null;
    if (currentWindow.id != null && !windowIdMatches(currentWindow.id, windowId)) return null;
    const match = scanSlots(bot, currentWindow.slots, predicate, maxSlots);
    return match ? { ...match, source: 'currentWindow' } : null;
}

function updatePacketSlots(bot, rawSlots, data, meta, windowId) {
    const name = meta?.name;
    if (name !== 'set_slot' && name !== 'set_container_slot' && name !== 'window_items' && name !== 'set_container_content') {
        return;
    }

    const wid = packetWindowId(data);
    if (!windowIdMatches(wid, windowId)) return;

    if (name === 'set_slot' || name === 'set_container_slot') {
        if (data.slot == null) return;
        rawSlots[Number(data.slot)] = normalizeSlot(bot, data.item);
        return;
    }

    const slots = packetSlots(data);
    if (!Array.isArray(slots)) return;
    for (let i = 0; i < slots.length; i++) {
        rawSlots[i] = normalizeSlot(bot, slots[i]);
    }
}

function ensureCachedWindow(cache, windowId, title = null) {
    const id = Number(windowId);
    if (!cache.windows.has(id)) {
        cache.windows.set(id, { slots: [], title, updatedAt: Date.now() });
    }
    const entry = cache.windows.get(id);
    if (title != null) entry.title = title;
    entry.updatedAt = Date.now();
    cache.lastWindowId = id;
    return entry;
}

function installWindowItemTracker(bot) {
    if (bot[TRACKER_KEY]) return bot[TRACKER_KEY];

    const cache = { windows: new Map(), lastWindowId: null };
    bot[TRACKER_KEY] = cache;

    bot.flayer._client.on('open_window', (packet) => {
        const windowId = packet.windowId ?? packet.containerId;
        if (windowId == null) return;
        const id = Number(windowId);
        cache.windows.set(id, {
            slots: [],
            title: packet.windowTitle ?? packet.title ?? null,
            updatedAt: Date.now()
        });
        cache.lastWindowId = id;
    });

    bot.flayer._client.on('close_window', (packet) => {
        const windowId = packet.windowId ?? packet.containerId;
        if (windowId == null) return;
        cache.windows.delete(Number(windowId));
        if (cache.lastWindowId === Number(windowId)) cache.lastWindowId = null;
    });

    bot.flayer._client.on('packet', (data, meta) => {
        const name = meta?.name;
        if (name !== 'set_slot' && name !== 'set_container_slot' && name !== 'window_items' && name !== 'set_container_content') {
            return;
        }

        const windowId = packetWindowId(data) ?? cache.lastWindowId;
        if (windowId == null) return;
        const entry = ensureCachedWindow(cache, windowId);
        updatePacketSlots(bot, entry.slots, data, meta, windowId);
    });

    return cache;
}

function scanCachedWindow(bot, windowId, predicate, maxSlots) {
    const cache = bot?.[TRACKER_KEY];
    if (!cache) return null;
    const id = windowId ?? cache.lastWindowId;
    if (id == null) return null;
    const entry = cache.windows.get(Number(id));
    if (!entry) return null;
    const match = scanSlots(bot, entry.slots, predicate, maxSlots);
    return match ? { ...match, source: 'packetCache' } : null;
}

async function waitForWindowItem(bot, windowId, predicate, options = {}) {
    installWindowItemTracker(bot);

    const maxMs = options.maxMs ?? 8000;
    const maxSlots = options.maxSlots ?? 54;
    const rawSlots = [];
    const startedAt = Date.now();

    const scanRaw = () => {
        const match = scanSlots(bot, rawSlots, predicate, maxSlots);
        return match ? { ...match, source: 'packet' } : null;
    };

    const immediate = scanCurrentWindow(bot, windowId, predicate, maxSlots)
        || scanCachedWindow(bot, windowId, predicate, maxSlots)
        || scanRaw();
    if (immediate) return immediate;

    return new Promise((resolve) => {
        let settled = false;
        let poller;
        let timer;

        const cleanup = () => {
            clearInterval(poller);
            clearTimeout(timer);
            bot.flayer._client.removeListener('packet', onPacket);
        };

        const finish = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const tryScan = () => {
            const result = scanCurrentWindow(bot, windowId, predicate, maxSlots)
                || scanCachedWindow(bot, windowId, predicate, maxSlots)
                || scanRaw();
            if (result) {
                result.elapsedMs = Date.now() - startedAt;
                finish(result);
                return true;
            }
            return false;
        };

        const onPacket = (data, meta) => {
            updatePacketSlots(bot, rawSlots, data, meta, windowId);
            tryScan();
        };

        bot.flayer._client.on('packet', onPacket);
        poller = setInterval(tryScan, options.pollMs ?? 50);
        timer = setTimeout(() => finish(null), maxMs);
        tryScan();
    });
}

async function waitForWindowSlotName(bot, windowId, slotIndex, maxMs = 400) {
    const result = await waitForWindowItem(
        bot,
        windowId,
        (_slot, index) => index === slotIndex,
        { maxMs, maxSlots: slotIndex + 1, pollMs: 10 }
    );
    if (!result?.slot?.name) {
        throw new Error(`Timeout waiting for slot ${slotIndex} to load`);
    }
    return result?.slot?.name ?? null;
}

function isCreateAuctionButton(slot) {
    if (slot?.name !== 'golden_horse_armor') return false;
    const customName = stripColors(getSlotCustomName(slot)).toLowerCase();
    return customName.includes('create auction');
}

module.exports = {
    isCreateAuctionButton,
    installWindowItemTracker,
    normalizeSlot,
    parseWindowTitle,
    stripColors,
    waitForWindowItem,
    waitForWindowSlotName
};
