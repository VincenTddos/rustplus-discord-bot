'use strict';

/**
 * Rust+ getTime returns a `time` payload that includes:
 *   { time, sunrise, sunset, dayLengthMinutes }
 * `time` and the rise/set values are 0..24 floats.
 *
 * One in-game hour = (dayLengthMinutes * 60) / 24 real seconds. We use that
 * to convert a delta-in-game-hours into real minutes for "time until X".
 */

function _normalize(h) {
  return ((h % 24) + 24) % 24;
}

/**
 * Given the Rust+ time response object (or a flat number), figure out
 * how many in-game hours until the next event at `targetHour`.
 */
function inGameHoursUntil(currentTime, targetHour) {
  if (typeof currentTime !== 'number') return null;
  if (typeof targetHour !== 'number') return null;
  let delta = _normalize(targetHour) - _normalize(currentTime);
  if (delta <= 0) delta += 24;
  return delta;
}

/**
 * Convert in-game hours into real-world minutes given dayLengthMinutes.
 * dayLengthMinutes is the time for one full 24h game cycle.
 */
function inGameHoursToRealMinutes(hours, dayLengthMinutes) {
  if (typeof hours !== 'number' || typeof dayLengthMinutes !== 'number') return null;
  if (dayLengthMinutes <= 0) return null;
  return (hours / 24) * dayLengthMinutes;
}

function formatRealDuration(minutes) {
  if (typeof minutes !== 'number' || minutes < 0) return '?';
  const total = Math.round(minutes * 60); // seconds
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Is the current in-game time considered daytime?
 */
function isDaytime(timeResponse) {
  if (!timeResponse) return null;
  const t = _normalize(timeResponse.time);
  const sr = _normalize(timeResponse.sunrise);
  const ss = _normalize(timeResponse.sunset);
  if (sr < ss) return t >= sr && t < ss;
  // Wraps midnight (rare for sunrise/sunset but be safe)
  return t >= sr || t < ss;
}

module.exports = {
  inGameHoursUntil,
  inGameHoursToRealMinutes,
  formatRealDuration,
  isDaytime,
};
