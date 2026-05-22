'use strict';

/**
 * Auto Turret interference calculator.
 *
 * In Rust, an Auto Turret loses 10% accuracy per other turret within ~30m
 * (line of sight aside). This service tracks turret world positions and
 * answers questions like "how many turrets are within X of (x,y)?".
 *
 * Pure math; no Rust+ calls needed.
 */
const DEFAULT_RADIUS = 30;

class TurretService {
  constructor({ store }) {
    this.store = store;
    if (!Array.isArray(this.store.get('turrets'))) this.store.set('turrets', []);
  }

  list() {
    return [...(this.store.get('turrets') || [])];
  }

  add({ name, x, y }) {
    if (!name) throw new Error('name required');
    if (typeof x !== 'number' || typeof y !== 'number') throw new Error('x and y required');
    const turrets = this.list();
    if (turrets.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Turret "${name}" already exists`);
    }
    turrets.push({ name, x, y, addedAt: new Date().toISOString() });
    this.store.set('turrets', turrets);
    return turrets[turrets.length - 1];
  }

  remove(name) {
    const turrets = this.list();
    const idx = turrets.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) return false;
    turrets.splice(idx, 1);
    this.store.set('turrets', turrets);
    return true;
  }

  clear() {
    this.store.set('turrets', []);
  }

  /**
   * Returns turrets within `radius` of (x,y).
   */
  within(x, y, radius = DEFAULT_RADIUS) {
    return this.list().filter((t) => Math.hypot(t.x - x, t.y - y) <= radius);
  }

  /**
   * For a candidate position, return:
   *   { count, accuracyMultiplier (0..1), nearby: [{name, distance}] }
   */
  check(x, y, radius = DEFAULT_RADIUS) {
    const nearby = this.list()
      .map((t) => ({ name: t.name, distance: Math.hypot(t.x - x, t.y - y) }))
      .filter((t) => t.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
    const count = nearby.length;
    const accuracy = Math.max(0, 1 - 0.1 * count); // 10% per interfering turret
    return { count, accuracyMultiplier: accuracy, radius, nearby };
  }
}

TurretService.DEFAULT_RADIUS = DEFAULT_RADIUS;
module.exports = TurretService;
