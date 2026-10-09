const { log, sleep } = require('../utils');
const { getSlotItemTag, getSlotLore } = require('../helpers');
const { parseWindowTitle, waitForWindowSlotName } = require('../windowItems');

// Store the listener function so it can be removed later
let openWindowListener = null;

/**
 * Check if window title matches expected title
 */
function matchesTitle(windowTitle, expectedTitle) {
    const parsed = parseWindowTitle(windowTitle);
    return parsed.includes(expectedTitle);
}

function windowStats(bot, windowObj, type, winOpen, latestItem, latestPrice) {
    try {
        const itemTag = getSlotItemTag(windowObj?.slots?.[13]);
        if (!itemTag) {
            log(`[Buy] windowStats: Missing item tag data in slot 13`, "warn");
            return;
        }

        const lore = getSlotLore(windowObj?.slots?.[31]);
        if (!lore) {
            log(`[Buy] windowStats: Missing lore data in slot 31`, "warn");
            return;
        }

        const priceLine = lore.find(line => line.includes("Price:"));

        if (!priceLine) {
            log(`[Buy] windowStats: Could not find Price: in lore`, "warn");
            return;
        }

        const noColors = priceLine.replace(/§./g, "");
        const price = parseInt(noColors.replace(/[^0-9]/g, ""), 10);

        log(`[Buy] Price ${price}, Tag ${itemTag}`, "debug", true);

        if (!bot.holding[price]?.[itemTag]?.[0]) {
            log(`[Buy] windowStats: Missing holding data for price ${price}, tag ${itemTag}`, "warn");
            return;
        }

        bot.holding[price][itemTag][0]["type"] = type;
        bot.holding[price][itemTag][0]["tpmTime"] = winOpen;
        handleMessageEvent(bot, price, itemTag, latestItem, latestPrice);
    } catch (error) {
        log(`[Buy] windowStats error: ${error.message}`, "warn");
        console.error('[Buy] windowStats full error:', error);
    }
}

function handleMessageEvent(bot, price, tag, latestItem, latestPrice) {
    let checked = false;
    let purchased = false;

    const messageListener = (message, position) => {
        try {
            if (position === "game_info") return;
            const listenerMessage = message.toAnsi();

            if (listenerMessage.includes("Putting coins in escrow...") && !checked) {
                log(`[Buy] First window time: ${bot.holding[price]?.[tag]?.[0]?.["tpmTime"]}`, "debug", true);
                if (bot.holding[price]?.[tag]?.[0]?.["tpmTime"] > 10000) {
                    bot.holding[price][tag][0]["tpmTime"] = Date.now() - bot.holding[price][tag][0]["tpmTime"];
                }
                checked = true;
            }

            if (listenerMessage.includes("You purchased")) {
                purchased = true;
                clearTimeout(timeout);
                if (!checked && bot.holding[price]?.[tag]?.[0]?.["tpmTime"] > 10000) {
                    bot.holding[price][tag][0]["tpmTime"] = Date.now() - bot.holding[price][tag][0]["tpmTime"];
                }
                bot.flayer.removeListener('message', messageListener);
            }

            if (listenerMessage.includes("There was an error") && !purchased) {
                clearTimeout(timeout);
                log(`[Buy] Purchase error detected, cleaning up holding data`, "warn");
                if (bot.holding[latestItem]?.[latestPrice]) {
                    bot.holding[latestItem][latestPrice].shift();
                }
                if (bot.holding[price]?.[tag]) {
                    bot.holding[price][tag].shift();
                }
                bot.flayer.removeListener('message', messageListener);
            }
        } catch (error) {
            log(`[Buy] handleMessageEvent listener error: ${error.message}`, "warn");
        }
    };

    bot.flayer.on('message', messageListener);
    const timeout = setTimeout(() => bot.flayer.removeListener('message', messageListener), 5000);
}

async function buy(bot) {
    log(`[Buy] Initializing buy listener`, "sys", true);

    if (openWindowListener && bot.flayer?._client) {
        bot.flayer._client.removeListener('open_window', openWindowListener);
    }

    // Create the listener function
    openWindowListener = async (window) => {
        try {
            // if (bot.buyWindowBusy) {
            //     log("[Buy] Ignoring open_window while previous buy window is still processing", "debug", true);
            //     return;
            // }
            // bot.buyWindowBusy = true;

            log(`[Buy] Window event received: ${JSON.stringify(window.windowTitle || 'unknown')}`, "debug", true);
            bot.lastAction = Date.now();

            // In 1.17+, confirmClick is a no-op but we call it for logging
            bot.packets.confirmClick(window.windowId);

            const titleParsed = parseWindowTitle(window.windowTitle);
            log(`[Buy] Parsed window title: "${titleParsed}"`, "debug", true);

            if (matchesTitle(window.windowTitle, "BIN Auction View")) {
                const beforeLoad = Date.now();
                log(`[Buy] BIN window opened | elapsed: ${beforeLoad - bot.recieveTime}ms`, "debug");

                // Try to read slot 31 with a short timeout.
                // If window_items was dropped by the deserializer, slots won't populate.
                // In that case, click slot 31 directly — it's the buy button.
                let slot;
                try {
                    slot = await waitForWindowSlotName(bot, window.windowId, 31);
                } catch (loadErr) {
                    log(`[Buy] Slot 31 not readable (${loadErr.message}), blind-click`, "debug");
                }

                bot.lastWindow = Date.now();

                if (slot === 'gold_nugget') {
                    log("[Buy] Gold nugget detected", "debug");
                    windowStats(bot, bot.flayer.currentWindow, "Nugget", beforeLoad, bot.latestItem, bot.latestPrice)
                    bot.packets.click(31, window.windowId)
                    bot.state.emit("nextFlip");

                } else if (slot === 'bed' || slot === 'red_bed' || slot === 'white_bed') {
                    log("[Buy] Flip is bed, initiating bed spam...", "sys");
                    windowStats(bot, bot.flayer.currentWindow, "Bed", beforeLoad, bot.latestItem, bot.latestPrice);
                    await spam(bot, window);

                } else {
                    if (slot === 'potato' || slot === 'feather') {
                        log("[Buy] Missed nugget :(", "sys");
                    } else if (slot === 'poisonous_potato') {
                        log("[Buy] Can't afford auction!", "sys");
                    }

                    if (!slot) {
                        // Slots didn't load — click buy directly
                        // bot.packets.click(31, window.windowId);
                        // log(`[Buy] Blind-clicked slot 31 at ${Date.now() - beforeLoad}ms`, "debug");
                    } else {
                        if (bot.holding[bot.latestItem]?.[bot.latestPrice]) {
                            bot.holding[bot.latestItem][bot.latestPrice].shift();
                        }
                        bot.packets.closeWindow(window.windowId);
                    }
                    bot.state.emit("nextFlip");
                }

            } else if (matchesTitle(window.windowTitle, "Confirm Purchase")) {
                const confirmWindow = Date.now();
                const wid = window.windowId;
                log(`[Buy] Confirm window opened | elapsed: ${confirmWindow - bot.recieveTime}ms`, "debug");

                await sleep(50);
                bot.packets.click(11, wid);

                log(`[Buy] Clicked confirm (wid=${wid}) at ${Date.now() - confirmWindow}ms`, "debug");
                bot.state.emit("nextFlip");

            } else {
                log(`[Buy] Unknown window type: "${titleParsed}"`, "debug");
                if (window) {
                    bot.packets.closeWindow(window.windowId);
                    bot.state.emit("nextFlip");
                } else {
                    console.error("[Buy] Attempted to close an undefined window.");
                }
            }

        } catch (error) {
            console.error('[Buy] Window handler error:', error);
            log(`[Buy] CRITICAL: Window handler error: ${error.message}`, "warn");
            bot.state.emit("nextFlip");
        } finally {
            bot.buyWindowBusy = false;
        }
    };

    // Register only this module's protocol listener; Mineflayer's own window listener must stay attached.
    try {
        bot.flayer._client.on('open_window', openWindowListener);
        log(`[Buy] Registered open_window listener on _client`, "debug", true);
    } catch (error) {
        log(`[Buy] Error registering open_window listener: ${error.message}`, "warn");
        console.error('[Buy] Listener registration error:', error);
    }
}

async function spam(bot, window) {
    try {
        log("[Buy] Spam function called", "sys", true);

        const isoString = bot.auctionStart;
        const ms = new Date(isoString).getTime();
        log(`[Buy] ${(ms - Date.now()).toFixed(2)}ms left in bed`, "sys");

        let pingms;
        if (bot.stats.ping.values?.length > 0) {
            pingms = bot.stats.ping.values[bot.stats.ping.values.length - 1];
        } else {
            pingms = 20;
        }

        let lastTick = 0;
        let checkItem;

        // const tickListener = async () => {
        //     log("Tick Listener Event Activated", "debug")
        //     try {
        //         if (!bot.flayer.currentWindow || lastTick > 80) {
        //             bot.flayer.removeAllListeners('physicsTick');
        //             clearInterval(checkItem);
        //             log("[Buy] Bed spam cancelled (no window or tick limit)", "sys");
        //             return;
        //         }

        //         if (lastTick % 2 === 0) {
        //             bot.packets.click(31, window.windowId, -1);
        //             bot.betterClick(31, 0, 0);
        //         }
        //         lastTick++;
        //     } catch (tickError) {
        //         log(`[Buy] Tick listener error: ${tickError.message}`, "warn");
        //     }
        // };
        if ((ms - Date.now()) > 400) {
            await sleep(Math.abs(ms - Date.now() - 400));
        }

        let newWindowOpened = false;

        const confirmWindowCheck = async () => {
            newWindowOpened = true;
            bot.flayer._client.removeListener('open_window', confirmWindowCheck);
        }

        bot.flayer._client.on('open_window', confirmWindowCheck);

        log(`Starting bedspam at ${ms - Date.now()}ms left in bed`, "debug")
        let passes = 0;
        while(bot.flayer.currentWindow && passes < 15 && !newWindowOpened) {
        log(`Clicked at delta ${ms - Date.now()}`, "debug")
        bot.packets.click(31, window.windowId);
        passes++;
        await sleep(50);
        }
        //bot.flayer.on('physicsTick', tickListener);

    } catch (error) {
        console.error("[Buy] Error during spam:", error);
        log(`[Buy] CRITICAL: Spam error: ${error.message}`, "warn");
    }
}

/** @deprecated use waitForWindowSlotName(bot, windowId, slot) */
async function load(bot, slot, windowId) {
    if (windowId == null) {
        return waitForWindowSlotName(bot, bot.flayer.currentWindow?.id ?? 0, slot, 400);
    }
    return waitForWindowSlotName(bot, windowId, slot, 400);
}

async function enableOpenWindowListener(bot) {
    try {
        if (bot.flayer._client) {
            if (!openWindowListener) {
                log('[Buy] Cannot enable listener: listener not initialized', 'warn');
                return;
            }
            if (openWindowListener) {
                bot.flayer._client.removeListener('open_window', openWindowListener);
            }
            bot.flayer._client.on('open_window', openWindowListener);
            log('[Buy] Open window listener enabled', 'sys', true);
        } else {
            log('[Buy] Cannot enable listener: _client not available', 'warn');
        }
    } catch (error) {
        log(`[Buy] Error enabling listener: ${error.message}`, 'warn');
    }
}

async function disableOpenWindowListener(bot) {
    try {
        if (openWindowListener && bot.flayer?._client) {
            bot.flayer._client.removeListener('open_window', openWindowListener);
            openWindowListener = null;
            bot.buyWindowBusy = false;
            log('[Buy] Open window listener disabled', 'sys', true);
        }
    } catch (error) {
        log(`[Buy] Error disabling listener: ${error.message}`, 'warn');
    }
}

module.exports = { buy, load, enableOpenWindowListener, disableOpenWindowListener };
