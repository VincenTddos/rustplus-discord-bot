'use strict';

const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const config = require('./config');
const logger = require('./logger');
const RustPlusClient = require('./rustplusClient');
const AutoStatsService = require('./autoStatsService');
const commands = require('./commands');

const JsonStore = require('./storage');
const DeviceService = require('./services/deviceService');
const TurretService = require('./services/turretService');
const VendingService = require('./services/vendingService');
const DeathTrackerService = require('./services/deathTrackerService');
const EventTrackerService = require('./services/eventTrackerService');
const TeamChatService = require('./services/teamChatService');

// ---------- Discord ----------
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ---------- Rust+ ----------
const rustplusClient = new RustPlusClient({
  ip: config.rust.ip,
  port: config.rust.port,
  playerId: config.rust.playerId,
  playerToken: config.rust.playerToken,
});

rustplusClient.onConnected(() => {
  logger.info(`[Bot] Rust+ connected to ${config.rust.ip}:${config.rust.port}`);
});

rustplusClient.onDisconnected(() => {
  logger.warn('[Bot] Rust+ connection lost');
});

// Optional: log incoming team chat / pairing events without acting on them.
rustplusClient.onMessage((message) => {
  try {
    const broadcast = message && message.broadcast;
    if (broadcast && broadcast.teamMessage && broadcast.teamMessage.message) {
      const m = broadcast.teamMessage.message;
      logger.debug(`[Rust+ team chat] ${m.name || '?'}: ${m.message || ''}`);
    }
  } catch (_) {
    /* noop */
  }
});

// ---------- Persistent storage ----------
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const store = new JsonStore(path.join(dataDir, 'state.json'), {
  devices: [],
  turrets: [],
  deaths: [],
});

// ---------- Services ----------
const deviceService = new DeviceService({ store, rustplusClient });
const turretService = new TurretService({ store });
const vendingService = new VendingService({ rustplusClient });
const deathTracker = new DeathTrackerService({ rustplusClient, discordClient, config, store });
const eventTracker = new EventTrackerService({ rustplusClient, discordClient, config });

const autoStatsService = new AutoStatsService({
  rustplusClient,
  discordClient,
  config,
});

const teamChatService = new TeamChatService({
  rustplusClient,
  config,
  deviceService,
  turretService,
  vendingService,
  deathTracker,
  eventTracker,
});

// ---------- Boot ----------
function startServices() {
  rustplusClient.connect();
  if (config.autoStats.enabled) {
    autoStatsService.start();
  }
  // Always start the event tracker — toggle via !eventtracker off if not wanted.
  eventTracker.start();
}

if (config.discord.token) {
  // ---------- Discord mode ----------
  discordClient.once('ready', () => {
    logger.info(`[Discord] Bot ready as ${discordClient.user.tag} (${config.bot.name})`);
    startServices();
  });

  discordClient.on('error', (err) => {
    logger.error('[Discord] client error:', err && err.message ? err.message : err);
  });

  discordClient.on('messageCreate', (message) => {
    commands.handleMessage(message, {
      config,
      rustplusClient,
      discordClient,
      autoStatsService,
      deviceService,
      turretService,
      vendingService,
      deathTracker,
      eventTracker,
      teamChatService,
    }).catch((err) => {
      logger.error('[Bot] Unhandled command error:', err.message);
    });
  });

  discordClient.login(config.discord.token).catch((err) => {
    logger.error('[Discord] login failed:', err.message);
    process.exit(1);
  });
} else {
  // ---------- Rust+-only mode（無 Discord） ----------
  logger.info(`[Bot] Discord 未設定，以純 Rust+ 模式啟動（${config.bot.name}）`);
  startServices();
}

// ---------- Graceful shutdown ----------
function shutdown(signal) {
  logger.info(`[Bot] Received ${signal}, shutting down...`);
  try { autoStatsService.stop(); } catch (_) { /* noop */ }
  try { eventTracker.stop(); } catch (_) { /* noop */ }
  try { rustplusClient.disconnect(); } catch (_) { /* noop */ }
  try { discordClient.destroy(); } catch (_) { /* noop */ }
  try { store.flush(); } catch (_) { /* noop */ }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('[Bot] Unhandled rejection:', reason && reason.message ? reason.message : reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[Bot] Uncaught exception:', err && err.message ? err.message : err);
});
