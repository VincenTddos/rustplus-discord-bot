'use strict';

const { formatGameTime } = require('./utils/formatters');

/**
 * Aggregates data from Rust+ into a single stats object,
 * and provides formatters for Discord and the in-game team chat.
 */

async function getStats(rustplusClient) {
  if (!rustplusClient || !rustplusClient.isConnected()) {
    return {
      connected: false,
      time: null,
      members: [],
      total: 0,
      online: 0,
      offline: 0,
      alive: 0,
      dead: 0,
    };
  }

  const [time, teamInfo] = await Promise.all([
    rustplusClient.getTime().catch(() => null),
    rustplusClient.getTeamInfo().catch(() => null),
  ]);

  const members = (teamInfo && Array.isArray(teamInfo.members)) ? teamInfo.members : [];

  let online = 0;
  let alive = 0;
  for (const m of members) {
    if (m.isOnline) online += 1;
    if (m.isAlive) alive += 1;
  }
  const total = members.length;

  return {
    connected: true,
    time,
    members,
    total,
    online,
    offline: total - online,
    alive,
    dead: total - alive,
  };
}

function formatStatsForDiscord(stats, botName = 'RustPlusBot') {
  const timeStr = formatGameTime(stats.time);
  const status = stats.connected ? '🟢 已連線' : '🔴 未連線';

  return [
    `📊 **Rust 隊伍統計** (${botName})`,
    `時間: \`${timeStr}\``,
    `隊員人數: \`${stats.total}\``,
    `在線: \`${stats.online}\``,
    `離線: \`${stats.offline}\``,
    `存活: \`${stats.alive}\``,
    `死亡: \`${stats.dead}\``,
    `Rust+: ${status}`,
  ].join('\n');
}

function formatStatsForGameChat(stats) {
  const timeStr = formatGameTime(stats.time);
  return `[統計] 時間 ${timeStr} | 在線 ${stats.online}/${stats.total} | 存活 ${stats.alive} | 死亡 ${stats.dead}`;
}

module.exports = {
  getStats,
  formatStatsForDiscord,
  formatStatsForGameChat,
};
