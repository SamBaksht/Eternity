const { sleep } = require('../utils');

const SCOREBOARD_TRACKER_KEY = Symbol.for('eternity.scoreboardTracker');

function scoreboardText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);

    if (typeof value.getText === 'function') {
        try {
            const text = value.getText(null);
            if (text) return text;
        } catch {
            // Fall through to component parsing below.
        }
    }

    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        const text = value.toString();
        if (text && text !== '[object Object]') return text;
    }

    if (Array.isArray(value)) return value.map(scoreboardText).join('');
    if (typeof value !== 'object') return '';

    if (typeof value.text === 'string') return value.text + scoreboardText(value.extra);
    if (typeof value.translate === 'string') return value.translate + scoreboardText(value.with);
    if (value.type === 'string' && value.value != null) return String(value.value);
    if (value.type === 'compound' && value.value != null) return scoreboardText(value.value);
    if (value.value != null) return scoreboardText(value.value);

    return scoreboardText(value.extra ?? value.with ?? '');
}

function parsePurseLine(line) {
    const cleaned = line.replace(/§[0-9a-fk-or]/gi, '');
    const match = cleaned.match(/\b(?:Purse|Piggy):\s*([0-9][0-9,.]*)([kmb])?/i);
    if (!match) return null;
    const unit = match[2]?.toLowerCase();
    const multiplier = unit === 'b' ? 1_000_000_000 : unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1;
    const value = Math.floor(Number.parseFloat(match[1].replace(/,/g, '')) * multiplier);
    return Number.isFinite(value) ? value : null;
}

function lineCandidates(bot, item) {
    const display = scoreboardText(item?.displayName ?? item);
    const entry = scoreboardText(item?.name);
    const team = entry ? bot.flayer?.teamMap?.[entry] : null;
    const prefix = scoreboardText(team?.prefix);
    const suffix = scoreboardText(team?.suffix);
    const candidates = [];

    if (prefix || suffix) {
        candidates.push(`${prefix}${suffix}`);
        candidates.push(`${prefix}${entry}${suffix}`);
    }

    candidates.push(display);

    if (entry && display.includes(entry)) {
        candidates.push(display.replace(entry, ''));
    }

    return [...new Set(candidates.filter(Boolean))];
}

function installScoreboardTracker(bot) {
    if (bot[SCOREBOARD_TRACKER_KEY]) return bot[SCOREBOARD_TRACKER_KEY];

    const cache = {
        objectives: new Map(),
        teams: new Map(),
        sidebarObjective: null
    };
    bot[SCOREBOARD_TRACKER_KEY] = cache;

    const ensureObjective = (name) => {
        if (!name) return null;
        if (!cache.objectives.has(name)) {
            cache.objectives.set(name, { name, items: new Map(), title: '' });
        }
        return cache.objectives.get(name);
    };

    bot.flayer._client.on('packet', (packet, meta) => {
        const packetName = meta?.name ?? '';
        const lowerName = packetName.toLowerCase();
        if (!lowerName.includes('score') && !lowerName.includes('team') && !lowerName.includes('objective')) return;

        if (packetName === 'scoreboard_objective') {
            if (packet.action === 1 || packet.mode === 1) {
                cache.objectives.delete(packet.name);
                if (cache.sidebarObjective === packet.name) cache.sidebarObjective = null;
                return;
            }
            const objective = ensureObjective(packet.name);
            if (objective) objective.title = scoreboardText(packet.displayText ?? packet.value ?? packet.title);
            return;
        }

        if (packetName === 'scoreboard_display_objective' || packetName === 'display_objective') {
            const position = packet.position ?? packet.slot;
            const name = packet.name ?? packet.scoreName ?? packet.objectiveName;
            if (Number(position) === 1 || position === 'sidebar') {
                cache.sidebarObjective = name;
                ensureObjective(name);
            }
            return;
        }

        if (packetName === 'scoreboard_score' || packetName === 'update_score') {
            const objectiveName = packet.scoreName ?? packet.objectiveName ?? packet.objective;
            const itemName = packet.itemName ?? packet.entityName ?? packet.name;
            const objective = ensureObjective(objectiveName);
            if (!objective || !itemName) return;

            if (packet.action === 1 || packet.action === 'remove') {
                objective.items.delete(itemName);
                return;
            }

            objective.items.set(itemName, {
                name: itemName,
                value: packet.value ?? packet.score ?? 0
            });
            return;
        }

        if (packetName === 'scoreboard_team' || packetName === 'teams') {
            const teamName = packet.team ?? packet.name;
            if (!teamName) return;
            if (packet.mode === 1) {
                cache.teams.delete(teamName);
                return;
            }

            const existing = cache.teams.get(teamName) ?? { members: new Set(), prefix: '', suffix: '' };
            existing.prefix = scoreboardText(packet.prefix ?? existing.prefix);
            existing.suffix = scoreboardText(packet.suffix ?? existing.suffix);

            const players = packet.players ?? packet.entities ?? [];
            for (const player of players) {
                existing.members.add(player);
            }
            cache.teams.set(teamName, existing);
        }
    });

    return cache;
}

function trackedScoreboardItems(bot) {
    const cache = bot[SCOREBOARD_TRACKER_KEY];
    if (!cache) return [];

    const objectives = cache.sidebarObjective && cache.objectives.has(cache.sidebarObjective)
        ? [cache.objectives.get(cache.sidebarObjective)]
        : [...cache.objectives.values()];

    const teamForEntry = (entry) => {
        for (const team of cache.teams.values()) {
            if (team.members.has(entry)) return team;
        }
        return null;
    };

    return objectives.flatMap(objective => {
        return [...objective.items.values()]
            .sort((a, b) => b.value - a.value)
            .map(item => {
                const team = teamForEntry(item.name);
                return {
                    ...item,
                    displayName: `${team?.prefix ?? ''}${item.name}${team?.suffix ?? ''}`
                };
            });
    });
}

function scoreboardItems(bot) {
    const sidebarItems = bot.flayer?.scoreboard?.sidebar?.items ?? [];
    if (sidebarItems.length > 0) return sidebarItems;

    const trackedItems = trackedScoreboardItems(bot);
    if (trackedItems.length > 0) return trackedItems;

    const allScoreboards = Object.values(bot.flayer?.scoreboards ?? {});
    return allScoreboards.flatMap(scoreboard => scoreboard?.items ?? []);
}

async function waitForScoreboardItems(bot, maxMs = 5000) {
    const start = Date.now();
    let items = scoreboardItems(bot);

    while (items.length === 0 && Date.now() - start < maxMs) {
        await sleep(100);
        items = scoreboardItems(bot);
    }

    return items;
}

async function extractPurse(bot, type = null, boughtPrice = null) {
    installScoreboardTracker(bot);

    const items = await waitForScoreboardItems(bot);
    let purse = null;

    for (const item of items) {
        const candidates = lineCandidates(bot, item);
        for (const line of candidates) {
            const parsed = parsePurseLine(line);
            if (parsed === null) continue;
            purse = parsed;
            if (purse > 0 || line.toLowerCase().includes('piggy:')) break;
        }
        if (purse !== null && purse > 0) break;
    }

    const price = Number(boughtPrice);
    if (
        purse === bot.stats.purse
        && (type === "boughtItem" || type === "claimItem")
        && Number.isFinite(price)
    ) {
        purse -= price;
    }

    if (purse !== null) {
        bot.stats.purse = purse;
    }

    return bot.stats.purse;
}

module.exports = { extractPurse, installScoreboardTracker };