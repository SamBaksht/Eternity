# Eternity - Hypixel SkyBlock Auction Flipper

An automated auction house bot for Hypixel SkyBlock that finds profitable flips using Coflnet's flip finder and automatically buys, lists, and manages your auctions.

> ⚠️ **Still in development - use at your own risk!**

## Features

- 🤖 Automated flip buying and listing
- 📊 Real-time Discord webhook notifications
- 💰 Automatic tax calculations and profit tracking
- 🔄 Auto-relist expired auctions
- 📈 Detailed statistics (profit, slots, timings)
- 🔗 Coflnet integration for flip finding

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Minecraft Java Edition** with a Microsoft account
- **Hypixel API Key** - Get one by running `/api new` on Hypixel
- **Discord Webhook URL** (optional but recommended) - [How to create webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)

## Installation

1. **Clone or download this repository**

```bash
git clone https://github.com/SamBaksht/Eternity.git
cd Eternity
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure the bot** (see Configuration section below)

## Configuration

Edit `config.json` and fill in the following **required** fields:

```json
{
  "webhook": "YOUR_DISCORD_WEBHOOK_URL",
  "username": "YOUR_MINECRAFT_USERNAME",
  "apiKey": "YOUR_HYPIXEL_API_KEY",
  "customization": {
    "listTime": 24
  }
}
```

### Required Fields:

- **`username`** - Your Minecraft username (must match your Microsoft account)
- **`apiKey`** - Your Hypixel API key (get with `/api new` on Hypixel)
- **`webhook`** - Discord webhook URL for notifications (optional but recommended)

### Optional Fields:

- **`modSocketID`** - Coflnet mod socket ID for advanced features
- **`notificationHook`** - Secondary webhook for output log
- **`listTime`** - How many hours to list items (1-48)

> ⚠️ **Ignore all fragbot and autoEvents config options** - they are not yet implemented.

## Usage

### Starting the Bot

```bash
npm start
```

### First Time Setup

1. Run `npm start`
2. You'll be prompted to authenticate with Microsoft
3. Follow the link and enter the code provided
4. The bot will log into Hypixel and connect to Coflnet

### What the Bot Does

1. **Connects to Coflnet** - Receives flip suggestions based on your settings
2. **Buys Items** - Automatically attempts to purchase profitable flips
3. **Lists Items** - Claims bought items and lists them on the auction house
4. **Tracks Profits** - Monitors sales and calculates profit after tax
5. **Relists Items** - Automatically relists expired unsold items
6. **Sends Notifications** - Updates you via Discord webhooks

### Stopping the Bot

- Press `Ctrl + C` in the terminal
- The bot will safely shut down and close all connections

## Commands (in console)

While the bot is running, you can type commands in the console:

- `stop` - Safely stops the bot
- `status` - Shows current bot status
- `stats` - Displays profit and auction statistics

## Development Mode

For developers or testing with environment variables:

1. Create a `.env` file with:

```env
username=YOUR_USERNAME
apiKey=YOUR_API_KEY
webhook=YOUR_WEBHOOK_URL
modSocketID=YOUR_SOCKET_ID
listTime=24
```

2. Run in dev mode:

```bash
npm run dev
```

## Troubleshooting

### Bot won't connect to Minecraft

- Make sure you're using the correct Microsoft account
- Check that your Minecraft account has access to Hypixel
- Verify you're not already connected from another location


### Webhook not working

- Verify your webhook URL is correct
- Check Discord channel permissions
- Look for error messages in the console

### Bot missing flips

- This is normal - flips are competitive
- Adjust your Coflnet settings for better targeting
- Check your internet connection speed

## Logs

All bot activity is logged to the `log/` directory with timestamps. Check these files for detailed debugging information.

## Project Structure

```
EternityClient/
├── components/        # Bot modules
│   ├── auction/      # Auction buying/listing logic
│   ├── events/       # Event handlers
│   └── info/         # Player/island info
├── log/              # Log files
├── config.json       # Configuration file
├── start.js          # Entry point
└── package.json      # Dependencies
```

## Safety & Disclaimer

- This bot is **not affiliated with Hypixel or Mojang**
- Using bots may violate Hypixel's Terms of Service
- **Use at your own risk** - account bans are possible
- The developers are not responsible for any consequences

## License

MIT License - See LICENSE file for details

## Credits

- **Author**: SamBaksht
- **Flip Finder**: [Coflnet](https://sky.coflnet.com/)
- **Minecraft Bot Library**: [Mineflayer](https://github.com/PrismarineJS/mineflayer)

---

**Need help?** Check the logs in the `log/` directory or review error messages in the console.
