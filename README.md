# 🦀 Rust+ Discord Bot

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord" alt="Discord.js" />
  <img src="https://img.shields.io/badge/Rust%2B-API-orange?logo=rust" alt="Rust+" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License" />
</p>

> 🇹🇼 **繁體中文版** | A fully-featured Rust+ Discord bot for your game server, written in Node.js.

A Discord bot powered by the official **Rust+ Companion App API** — bringing server events, smart device control, vending machine search, in-game team chat commands, turret calculations, death tracking, and auto stats directly to your Discord server.

> **⚠️ Security Notice**  
> This bot strictly uses the **official Rust+ Companion App API** (same protocol as the Rust+ mobile app) and the **Discord API** only.  
> ❌ No memory reading · ❌ No packet interception · ❌ No ESP/radar/aimbot · ❌ No EAC bypass.

---

## ✨ Features

### 🔧 Basic
| Command | Description |
|---------|-------------|
| `!help` `!ping` `!status` | Health check |
| `!connect` `!disconnect` `!reconnect` | Manage Rust+ connection |

- ✅ Auto-reconnect with exponential backoff (max 60s)
- ✅ Channel isolation — only listens in your configured `DISCORD_CHANNEL_ID`

### 🌍 Server / Time
| Command | Description |
|---------|-------------|
| `!info` | Server name, map, size, players, seed, wipe time |
| `!pop` | Current/max players (with queue) |
| `!time` | In-game time |
| `!day` / `!night` | Minutes until next sunrise/sunset (real time) |

### 👥 Team
| Command | Description |
|---------|-------------|
| `!team` | List team members (online/alive/coordinates) |
| `!stats` / `!stats dc` / `!stats game` | Push stats to Discord and/or in-game chat |
| `!autostats on\|off\|status` | Periodic auto-broadcast of stats |
| `!say <message>` | Send message to in-game team chat |
| `!promote <name\|steamId>` | Transfer team leadership |
| `!deaths` | Recent teammate deaths (auto-tracked) |

### 🚁 Server Events (Auto-Tracked)
- Polls `getMapMarkers` every 30 seconds
- Detects **spawn/despawn** of: Patrol Helicopter · Cargo Ship · Chinook CH47 · Locked Crates · Explosions
- Notifies both Discord and in-game team chat
- `!events` — snapshot of current active events
- `!eventtracker on|off|status` — toggle polling

### 🔌 Smart Devices (Paired by Name)
| Command | Description |
|---------|-------------|
| `!pair <entityId> <name> [switch\|alarm\|storage]` | Register a device |
| `!unpair <name>` | Remove a device |
| `!devices` | List all paired devices |
| `!on <name>` / `!off <name>` | Toggle Smart Switch |
| `!device <name>` | Current status (switch/alarm/storage) |
| `!upkeep <name>` | Tool cupboard remaining time + items |

### 🛒 Vending Machine Search
| Command | Description |
|---------|-------------|
| `!vend <keyword>` | Search all vending machines on the map; returns grid, price, and stock |

### 🔫 Turret Interference Calculator
| Command | Description |
|---------|-------------|
| `!turret add <name> <x> <y>` | Register a turret position |
| `!turret list` | List all turrets |
| `!turret check <x> <y>` | Calculate nearby turrets and estimate hit rate (−10% per turret within 30m) |
| `!turret remove <name>` / `!turret clear` | Remove turret(s) |

### 💬 In-Game Team Chat Dispatch
Teammates can use `!` commands **directly in-game** to interact with the bot.

Supported commands in-game: `!help` `!pop` `!time` `!day` `!night` `!events` `!stats` `!deaths` `!devices` `!on <name>` `!off <name>` `!status <name>` `!vend <keyword>` `!turret list|check`

> Responses are truncated to fit the Rust team chat character limit. The bot **never responds to its own messages** (loop protection via `playerId`).

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- A Discord bot token
- A Rust server with Rust+ enabled (`+app.port 28082`)
- Your Rust+ pairing credentials

### Installation

```bash
git clone https://github.com/VincenTddos/rustplus-discord-bot.git
cd rustplus-discord-bot
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

---

## ⚙️ Configuration

Edit `.env` with the following variables:

```env
# ===== Discord =====
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id
COMMAND_PREFIX=!

# ===== Rust+ Server =====
RUST_IP=your.server.ip
RUST_PORT=28082
RUST_PLAYER_ID=your_steam_id
RUST_PLAYER_TOKEN=your_rust_plus_token

# ===== Auto Stats =====
AUTO_STATS_ENABLED=false
AUTO_STATS_INTERVAL_MINUTES=10
AUTO_STATS_SEND_TO_DISCORD=true
AUTO_STATS_SEND_TO_GAME=true

# ===== Bot =====
BOT_NAME=RustPlusBot
```

---

## 🤖 Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → **Bot** → **Add Bot** → **Reset Token** → copy token to `.env`
2. Bot tab → Enable **MESSAGE CONTENT INTENT**
3. OAuth2 → URL Generator → scopes: `bot`; permissions: `Send Messages`, `Read Messages/View Channels`, `Read Message History` → add to your server
4. Discord Settings → Advanced → Enable **Developer Mode** → right-click your channel → **Copy Channel ID** → paste to `DISCORD_CHANNEL_ID`

---

## 🔑 Rust+ Pairing

```bash
npm install -g @liamcottle/rustplus.js
rustplus fcm-register     # Complete in browser
rustplus fcm-listen       # Then pair in-game (server or Smart Switch)
```

The listener will print your `playerId`, `playerToken`, `ip`, and `port`. Paste these into `.env`.

To pair smart devices for `!on`/`!off`, note the `entityId` from the FCM listener, then in Discord:

```
!pair 100001 FrontDoor switch
!pair 100002 Alarm alarm
!pair 100003 MainTC storage
```

---

## 📁 Project Structure

```
rustplus-discord-bot/
├── src/
│   ├── index.js               # Entry point — wires all services
│   ├── config.js              # .env loading + validation
│   ├── logger.js              # Timestamped logger
│   ├── storage.js             # Debounced atomic JSON storage
│   ├── rustplusClient.js      # Promise wrapper + auto-reconnect
│   ├── commands.js            # All Discord ! commands
│   ├── statsService.js        # Stats fetching + formatting
│   ├── autoStatsService.js    # Periodic stats broadcast
│   ├── services/
│   │   ├── deviceService.js        # Smart device CRUD + control
│   │   ├── turretService.js        # Turret interference calculator
│   │   ├── vendingService.js       # Vending machine marker search
│   │   ├── deathTrackerService.js  # Death capture + announcement
│   │   ├── eventTrackerService.js  # Map marker event detection
│   │   └── teamChatService.js      # In-game team chat dispatch
│   └── utils/
│       ├── formatters.js      # Game time, team, message truncation
│       ├── gameTime.js        # Day/night countdown calculation
│       └── mapMarkers.js      # Marker type constants + grid coords
├── data/                      # Auto-created at runtime; stores state.json
├── .env.example               # Environment variable template
├── verify.js                  # Core stats + command tests
├── verify-autostats.js        # Auto stats lifecycle tests
└── verify-features.js         # Full feature test suite (~50 assertions)
```

---

## 🧪 Testing

Three offline test scripts (no Discord or Rust+ connection required):

```bash
node verify.js              # 11 checks: core stats + commands + formatting
node verify-autostats.js    # 5 checks: auto stats lifecycle + instant trigger
node verify-features.js     # ~50 assertions: devices, turrets, vending, deaths, events, team chat
```

---

## ❓ FAQ

| Symptom | Solution |
|---------|----------|
| Bot logged in but `!` commands don't respond | Enable **MESSAGE CONTENT INTENT** in Discord Developer Portal |
| `Rust+ sendTeamMessage error: not_in_team` | Your Steam ID must **currently** be a member of a team on the server |
| `Rust+ ... timed out` | The server's `app.port` is not open externally |
| `getEntityInfo error: not_found` | Paired `entityId` doesn't exist on this server (re-pair after wipe) |
| Event tracker is quiet on startup | First poll sets existing markers as baseline without announcing — by design |
| In-game chat replies truncated | Rust+ team chat limit is ~128 chars; too long gets truncated with `…` |

---

## 🚫 Intentionally Not Implemented

These features from commercial bots require external dependencies beyond the Rust+ API:

| Feature | Reason |
|---------|--------|
| **AI Assistant** (`!ai`) | Requires OpenAI/Anthropic API key |
| **CCTV / Drone Streaming** | Separate Rust+ sub-protocol; needs decoder + web frontend |
| **BattleMetrics Tracking** (`!track`, `!whois`) | Requires BattleMetrics API + rate limit handling |
| **Web/Interactive Map** | Requires a separate web server + frontend |
| **Discord Voice / TTS** | Requires ffmpeg + `@discordjs/voice` + TTS provider |
| **FCM Auto-Pairing** | Requires persistent Firebase Cloud Messaging listener |
| **Rust Labs Integration** | Requires large item/recipe database, updated each patch |

All of these **can be added** — the architecture is modular (each is a service under `src/services/`).

---

## 📄 License

[MIT](LICENSE) © VincenTddos
