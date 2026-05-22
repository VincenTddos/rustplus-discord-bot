'use strict';

require('dotenv').config();

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function asInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function required(name, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
    prefix: process.env.COMMAND_PREFIX || '!',
  },
  rust: {
    ip: required('RUST_IP', process.env.RUST_IP),
    port: asInt(process.env.RUST_PORT, 28082),
    playerId: required('RUST_PLAYER_ID', process.env.RUST_PLAYER_ID),
    playerToken: required('RUST_PLAYER_TOKEN', process.env.RUST_PLAYER_TOKEN),
  },
  autoStats: {
    enabled: asBool(process.env.AUTO_STATS_ENABLED, false),
    intervalMinutes: Math.max(1, asInt(process.env.AUTO_STATS_INTERVAL_MINUTES, 10)),
    sendToDiscord: asBool(process.env.AUTO_STATS_SEND_TO_DISCORD, true),
    sendToGame: asBool(process.env.AUTO_STATS_SEND_TO_GAME, true),
  },
  bot: {
    name: process.env.BOT_NAME || 'RustPlusBot',
  },
};

module.exports = config;
