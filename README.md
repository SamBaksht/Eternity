# Eternity

Eternity is an automated auction-trading client I built for Hypixel SkyBlock using Node.js. It handles purchasing items, creating listings, collecting sales, and relisting expired auctions.

The main challenge was keeping it running without constant supervision. Market updates, game packets, chat messages, and timers all arrive independently, so the client has to track its current task while handling new information and recovering when something goes wrong.

This project is no longer operated or maintained. The source is available to document my work, and isn’t intended for use against a multiplayer service without permission.

## How it works

The client connects to Minecraft through Mineflayer and checks existing auctions through the Hypixel API. A WebSocket feed supplies potential purchases, which the client acts on through game commands and auction menus.

The API, inventory packets, and chat messages each provide different information. The client combines them to track purchases and sales, update its internal state, and schedule the next action.

## Engineering

### Coordinating asynchronous tasks

Buying, listing, and claiming auctions all use the same game interface. Running them at the same time could interrupt a purchase or send a click to the wrong menu.

I built an event-driven action queue to coordinate these tasks. It tracks the current operation and holds incoming work until the queue can handle it. Purchase requests can take priority, and additional opportunities can extend an active buying session.

### Working with the Minecraft protocol

An open menu doesn’t necessarily have all its item data yet. Acting too early could leave the client working with incomplete information.

The window tracker reads both Mineflayer’s cached inventory state and raw container packets. It waits for the relevant slot or item before continuing. The client also parses formatted item names and menu titles, and constructs window-click packets using the container’s state.

### Recovering from failures

The client includes checks for inactivity, disconnects, and unresponsive sessions. Restart handling closes connections, clears timers, and attempts to reconnect. The WebSocket connection has its own retry logic and checks to avoid opening duplicate connections.

### Monitoring the client

Discord webhooks report purchases, sales, errors, and restarts. A live stats panel tracks profit, latency, and runtime, alongside a scrolling log. This made it easier to investigate failures during longer sessions.

## Code structure

- `components/bot.js` — Minecraft connection and session setup
- `components/state.js` — action queue and state management
- `components/clientPackets.js` — outgoing clicks and chat
- `components/windowItems.js` — container tracking and item loading
- `components/auction/` — buying, listing, claiming, and fee calculations
- `components/socket.js` — real-time auction feed
- `components/events/` — game events and recovery
- `components/notiHook.js` — live Discord statistics and logs

## Stack

JavaScript / Node.js, Mineflayer, EventEmitter, WebSockets, REST APIs, Axios, and discord.js.

## License

[MIT](LICENSE)
