# 🦀 Rust+ Discord 機器人

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord" alt="Discord.js" />
  <img src="https://img.shields.io/badge/Rust%2B-API-orange" alt="Rust+" />
  <img src="https://img.shields.io/badge/授權-MIT-blue" alt="License" />
</p>

一個基於官方 **Rust+ Companion App API** 的 Discord 機器人，使用 Node.js 自架。  
將伺服器事件通知、智能設備控制、販賣機搜尋、遊戲內團隊聊天指令、砲塔計算、死亡追蹤、自動統計等功能整合到你的 Discord 伺服器中。

> **⚠️ 安全聲明**  
> 本機器人嚴格只使用 **Rust+ Companion App API**（與官方 Rust+ 手機 App 同協定）及 **Discord API**。  
> ❌ 不讀取遊戲記憶體　❌ 不攔截封包　❌ 不提供 ESP／雷達／自瞄　❌ 不繞過 EAC

---

## ✨ 功能總覽

### 🔧 基本指令

| 指令 | 說明 |
|------|------|
| `!help` | 顯示所有可用指令 |
| `!ping` | 確認機器人是否在線 |
| `!status` | 查看目前連線狀態 |
| `!connect` | 手動連接 Rust+ |
| `!disconnect` | 手動斷開連線 |
| `!reconnect` | 重新連接 |

- ✅ 自動重連（指數退避，最長 60 秒間隔）
- ✅ 頻道隔離——只在設定的 `DISCORD_CHANNEL_ID` 頻道監聽指令

---

### 🌍 伺服器 / 時間

| 指令 | 說明 |
|------|------|
| `!info` | 伺服器名稱、地圖、大小、玩家數、seed、wipe 時間 |
| `!pop` | 目前 / 最大人數（含排隊人數） |
| `!time` | 遊戲內目前時間 |
| `!day` | 距離下次日出還有幾分鐘（真實時間） |
| `!night` | 距離下次日落還有幾分鐘（真實時間） |

---

### 👥 隊伍管理

| 指令 | 說明 |
|------|------|
| `!team` | 列出所有隊員（在線 / 存活 / 座標） |
| `!stats` | 推送統計到 Discord 和遊戲內聊天 |
| `!stats dc` | 只推送到 Discord |
| `!stats game` | 只推送到遊戲內聊天 |
| `!autostats on\|off\|status` | 開啟 / 關閉定期自動廣播統計 |
| `!say <訊息>` | 從機器人發送訊息到遊戲內團隊聊天 |
| `!promote <名字\|SteamID>` | 轉移隊長身份 |
| `!deaths` | 查看最近隊員死亡紀錄 |

---

### 🚁 伺服器事件（自動偵測）

每 30 秒輪詢一次地圖標記，自動偵測以下事件的**出現與消失**：

| 事件 | 說明 |
|------|------|
| 🚁 巡邏直升機 | Patrol Helicopter 出現 / 被擊落 |
| 🚢 貨輪 | Cargo Ship 進港 / 離開 |
| 🚂 支奴干 CH47 | Chinook 直升機移動 |
| 📦 上鎖板條箱 | Locked Crate 出現 / 解鎖 |
| 💥 爆炸 | 地圖上的爆炸事件 |

事件同時通知 Discord 頻道和遊戲內團隊聊天。

| 指令 | 說明 |
|------|------|
| `!events` | 查看目前正在進行的事件 |
| `!eventtracker on\|off\|status` | 切換事件偵測開關 |

---

### 🔌 智能設備控制

先用 `!pair` 給設備取名，之後就能用名字操作。

| 指令 | 說明 |
|------|------|
| `!pair <entityId> <名字> [switch\|alarm\|storage]` | 配對並命名一個設備 |
| `!unpair <名字>` | 取消配對 |
| `!devices` | 列出所有已配對設備 |
| `!on <名字>` | 開啟 Smart Switch |
| `!off <名字>` | 關閉 Smart Switch |
| `!device <名字>` | 查看設備目前狀態 |
| `!upkeep <名字>` | 查看工具櫃維護剩餘時間和物品 |

---

### 🛒 販賣機搜尋

| 指令 | 說明 |
|------|------|
| `!vend <關鍵字>` | 搜尋全地圖販賣機，回傳格線位置、售價、庫存 |

---

### 🔫 砲塔干擾計算

| 指令 | 說明 |
|------|------|
| `!turret add <名字> <x> <y>` | 記錄一個砲塔位置 |
| `!turret list` | 列出所有已記錄的砲塔 |
| `!turret check <x> <y>` | 計算附近砲塔數量並估算命中率（30m 內每多一座降 10%） |
| `!turret remove <名字>` | 移除指定砲塔 |
| `!turret clear` | 清除所有砲塔記錄 |

---

### 💬 遊戲內團隊聊天指令

**隊友在遊戲內也能直接用 `!` 指令控制機器人！**

支援的遊戲內指令：

```
!help  !pop  !time  !day  !night  !events  !stats  !deaths
!devices  !on <名字>  !off <名字>  !status <名字>
!vend <關鍵字>  !turret list  !turret check <x> <y>
```

> 回覆會自動截斷以符合 Rust 團隊聊天的字數限制（約 128 字）。  
> 機器人**永遠不會回應自己發的訊息**（透過 `playerId` 防止無限迴圈）。

---

## 🚀 快速開始

### 環境需求

- **Node.js 18 或以上**
- Discord 機器人 Token
- 已開啟 Rust+（`+app.port 28082`）的 Rust 伺服器
- Rust+ 配對憑證

### 安裝步驟

```bash
git clone https://github.com/VincenTddos/rustplus-discord-bot.git
cd rustplus-discord-bot
npm install
cp .env.example .env
# 用文字編輯器打開 .env 填入設定
npm start
```

---

## ⚙️ 環境變數設定（`.env`）

```env
# ===== Discord =====
DISCORD_TOKEN=你的_Discord_Bot_Token
DISCORD_CHANNEL_ID=你的_頻道_ID
COMMAND_PREFIX=!

# ===== Rust+ 伺服器 =====
RUST_IP=伺服器IP
RUST_PORT=28082
RUST_PLAYER_ID=你的_Steam_ID
RUST_PLAYER_TOKEN=你的_Rust+_Token

# ===== 自動統計 =====
AUTO_STATS_ENABLED=false
AUTO_STATS_INTERVAL_MINUTES=10
AUTO_STATS_SEND_TO_DISCORD=true
AUTO_STATS_SEND_TO_GAME=true

# ===== 機器人 =====
BOT_NAME=RustPlusBot
```

---

## 🤖 Discord Bot 設定教學

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
   → **New Application** → **Bot** → **Add Bot** → **Reset Token**
   → 複製 Token 貼到 `.env` 的 `DISCORD_TOKEN`

2. Bot 頁籤 → 開啟 **MESSAGE CONTENT INTENT**
   （沒開的話 `!` 指令完全收不到）

3. **OAuth2** → **URL Generator**
   → Scopes 勾選 `bot`
   → Permissions 勾選：`Send Messages`、`Read Messages/View Channels`、`Read Message History`
   → 複製產生的網址，在瀏覽器開啟，把機器人加入你的伺服器

4. Discord 設定 → 進階 → 開啟**開發者模式**
   → 對目標頻道按右鍵 → **複製頻道 ID** → 貼到 `.env` 的 `DISCORD_CHANNEL_ID`

---

## 🔑 Rust+ 配對教學

伺服器管理員需要在啟動指令加上 `+app.port 28082`（對外開放此 port）。

**取得 `playerId`、`playerToken`、`ip`、`port`：**

```bash
npm install -g @liamcottle/rustplus.js
rustplus fcm-register    # 開啟瀏覽器連結完成授權
rustplus fcm-listen      # 然後在遊戲內按「配對」按鈕
```

Listener 會印出這四個值，複製貼到 `.env`。

**配對智能設備（`!on` / `!off` 用）：**

從 FCM listener 找到 `entityId`，然後在 Discord 輸入：

```
!pair 100001 前門 switch
!pair 100002 警報器 alarm
!pair 100003 主工具櫃 storage
```

之後就能用 `!on 前門`、`!device 主工具櫃` 等指令操作。

---

## 📁 專案結構

```
rustplus-discord-bot/
├── src/
│   ├── index.js                    # 入口點，串接所有服務
│   ├── config.js                   # .env 載入與驗證
│   ├── logger.js                   # 帶時間戳的輕量 logger
│   ├── storage.js                  # Debounce + Atomic 的 JSON 儲存
│   ├── rustplusClient.js           # Rust+ Promise 封裝 + 自動重連
│   ├── commands.js                 # 所有 Discord ! 指令處理
│   ├── statsService.js             # 統計取得與格式化
│   ├── autoStatsService.js         # 定期自動統計廣播
│   ├── services/
│   │   ├── deviceService.js        # 智能設備 CRUD + 控制
│   │   ├── turretService.js        # 砲塔干擾計算器
│   │   ├── vendingService.js       # 販賣機地圖標記搜尋
│   │   ├── deathTrackerService.js  # 死亡偵測與公告
│   │   ├── eventTrackerService.js  # 地圖事件偵測（出現／消失）
│   │   └── teamChatService.js      # 遊戲內指令派遣
│   └── utils/
│       ├── formatters.js           # 遊戲時間、隊員、訊息截斷
│       ├── gameTime.js             # 日夜倒數計算
│       └── mapMarkers.js           # 標記類型常數 + 座標轉格線
├── data/                           # 執行時自動建立，存放 state.json
├── .env.example                    # 環境變數範本
├── verify.js                       # 核心功能測試
├── verify-autostats.js             # 自動統計測試
└── verify-features.js              # 完整功能測試套件
```

---

## 🧪 測試

三個**離線測試腳本**，不需要連接 Discord 或 Rust+ 伺服器：

```bash
node verify.js              # 11 項核心統計 + 指令 + 格式化測試
node verify-autostats.js    # 5 項自動統計生命週期測試
node verify-features.js     # ~50 條斷言：設備、砲塔、販賣機、死亡、事件、團隊聊天
```

---

## ❓ 常見問題

| 症狀 | 解決方法 |
|------|----------|
| Bot 上線但 `!` 指令完全沒反應 | 在 Discord Developer Portal 開啟 **MESSAGE CONTENT INTENT** |
| `sendTeamMessage error: not_in_team` | 你的 Steam ID 必須**現在**在伺服器上的某個隊伍中 |
| `Rust+ ... timed out` | 確認伺服器的 `app.port` 有對外開放 |
| `getEntityInfo error: not_found` | 配對的 `entityId` 在這個伺服器不存在（wipe 後需重新配對） |
| 事件追蹤器剛啟動時很安靜 | 第一次 poll 會把現有標記設為基準線，不會發出通知——這是設計如此 |
| 遊戲聊天回覆被截斷 | Rust+ 團隊聊天上限約 128 字元，太長會自動截斷並加上 `…` |
| `!autostats on` 後沒有立即發送 | 正常情況下啟用時會**立即**觸發一次，請確認 Rust+ 有連上 |

---

## 🚫 刻意未實作的功能

這些功能需要額外的外部服務或 API 金鑰，超出本專案範圍：

| 功能 | 未實作原因 |
|------|-----------|
| **AI 助手**（`!ai`） | 需要 OpenAI / Anthropic API 金鑰 |
| **CCTV 攝影機串流** | 另一個 Rust+ 子協定，需解碼器與網頁前端 |
| **BattleMetrics 玩家追蹤** | 需要 BattleMetrics API 金鑰 |
| **網頁互動地圖** | 需要額外的 Web Server + 前端 |
| **Discord 語音 / TTS** | 需要 ffmpeg + `@discordjs/voice` |
| **FCM 自動配對** | 需要持久化 Firebase Cloud Messaging listener |
| **Rust Labs 整合** | 需要龐大的物品資料庫，每次遊戲更新都要維護 |

> 架構為模組化設計，這些功能未來都可以新增（每個都是 `src/services/` 下的獨立服務）。

---

## 📄 授權

[MIT](LICENSE) © [VincenTddos](https://github.com/VincenTddos)
