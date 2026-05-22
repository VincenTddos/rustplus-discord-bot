'use strict';

/**
 * Rust+ map marker type codes (from the official protobuf schema).
 * These are stable across game versions.
 */
const MARKER_TYPE = {
  Undefined: 0,
  Player: 1,
  Explosion: 2,                 // C4, rocket, satchel
  VendingMachine: 3,
  CH47: 4,                      // Chinook
  CargoShip: 5,
  Crate: 6,                     // Locked crate
  GenericRadius: 7,
  PatrolHelicopter: 8,
};

const MARKER_NAME = {
  [MARKER_TYPE.Undefined]: 'Unknown',
  [MARKER_TYPE.Player]: 'Player',
  [MARKER_TYPE.Explosion]: 'Explosion',
  [MARKER_TYPE.VendingMachine]: 'Vending Machine',
  [MARKER_TYPE.CH47]: 'Chinook (CH47)',
  [MARKER_TYPE.CargoShip]: 'Cargo Ship',
  [MARKER_TYPE.Crate]: 'Locked Crate',
  [MARKER_TYPE.GenericRadius]: 'Generic Radius',
  [MARKER_TYPE.PatrolHelicopter]: 'Patrol Helicopter',
};

/**
 * Convert a Rust+ world coordinate to a grid label (e.g. "G14").
 * Rust grids are 146.25 units wide; columns A..Z then AA..ZZ; rows are 0-indexed
 * counting from the top of the map.
 */
function coordsToGrid(x, y, mapSize) {
  if (
    typeof x !== 'number' || typeof y !== 'number' || typeof mapSize !== 'number' ||
    !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(mapSize) || mapSize <= 0
  ) {
    return null;
  }
  const GRID = 146.25;
  const col = Math.floor(x / GRID);
  // Rows are counted from the top, so we invert y.
  const totalRows = Math.ceil(mapSize / GRID);
  const rowFromTop = (totalRows - 1) - Math.floor(y / GRID);

  if (col < 0 || rowFromTop < 0) return null;

  // A..Z, then AA..ZZ for very large maps
  let label = '';
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${label}${rowFromTop}`;
}

module.exports = {
  MARKER_TYPE,
  MARKER_NAME,
  coordsToGrid,
};
