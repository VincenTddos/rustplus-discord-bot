'use strict';

/**
 * Convert Rust+ in-game time (float, e.g. 14.5) into "HH:MM" format.
 * Falls back to "??:??" for invalid input.
 */
function formatGameTime(time) {
  if (typeof time !== 'number' || Number.isNaN(time)) {
    return '??:??';
  }
  const normalized = ((time % 24) + 24) % 24;
  const hours = Math.floor(normalized);
  const minutes = Math.floor((normalized - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Map a boolean to friendly text.
 */
function formatBooleanStatus(value, trueText = 'Yes', falseText = 'No') {
  return value ? trueText : falseText;
}

/**
 * Truncate a string to a max length, adding ellipsis if cut.
 * Returns null if input is empty or non-string.
 */
function truncateMessage(message, maxLength = 128) {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, Math.max(0, maxLength - 1)) + '…';
}

/**
 * Safely stringify any object. Never throws.
 */
function safeJson(obj, space = 0) {
  try {
    return JSON.stringify(obj, null, space);
  } catch (err) {
    return `[Unserializable: ${err.message}]`;
  }
}

/**
 * Format a Rust+ team member object into a one-line summary.
 * Coordinates are only included when the API actually provides them.
 */
function formatTeamMember(member) {
  if (!member || typeof member !== 'object') return '(invalid member)';

  const name = member.name || 'Unknown';
  const onlineText = member.isOnline ? '🟢 Online' : '⚪ Offline';
  const aliveText = member.isAlive ? '❤️ Alive' : '💀 Dead';

  const parts = [`**${name}**`, onlineText, aliveText];

  // Only show coordinates if both x and y are real numbers and the player is online.
  // Rust+ can return 0,0 for offline members; we don't pretend that's a real position.
  if (
    member.isOnline &&
    typeof member.x === 'number' &&
    typeof member.y === 'number' &&
    Number.isFinite(member.x) &&
    Number.isFinite(member.y) &&
    !(member.x === 0 && member.y === 0)
  ) {
    parts.push(`位置 (${Math.round(member.x)}, ${Math.round(member.y)})`);
  }

  return parts.join(' | ');
}

module.exports = {
  formatGameTime,
  formatBooleanStatus,
  truncateMessage,
  safeJson,
  formatTeamMember,
};
