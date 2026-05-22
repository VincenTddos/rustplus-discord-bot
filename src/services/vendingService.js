'use strict';

const { MARKER_TYPE, coordsToGrid } = require('../utils/mapMarkers');

/**
 * Searches all vending machine markers on the map for a given item name.
 *
 * Each VendingMachine marker carries `sellOrders`:
 *   { itemId, quantity, currencyId, costPerItem, amountInStock, itemIsBlueprint, currencyIsBlueprint }
 *
 * Without a full Rust item database this service can only do "contains"
 * matching against the itemId number. To search by *name*, callers can
 * supply an optional `itemNameMap: { [itemId]: 'Scrap' }` table — the bot
 * does NOT ship one because it would be huge and quickly outdated.
 */
class VendingService {
  constructor({ rustplusClient }) {
    this.rustplusClient = rustplusClient;
    this.itemNameMap = {};
    this.mapSize = null;
  }

  setItemNameMap(map) {
    this.itemNameMap = map || {};
  }

  setMapSize(size) {
    this.mapSize = size;
  }

  _itemName(id) {
    return this.itemNameMap[id] || `item:${id}`;
  }

  async search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    const markers = await this.rustplusClient.getMapMarkers();
    const results = [];

    for (const m of markers) {
      if (m.type !== MARKER_TYPE.VendingMachine) continue;
      const orders = (m.sellOrders) || [];
      for (const o of orders) {
        const itemName = this._itemName(o.itemId).toLowerCase();
        const currencyName = this._itemName(o.currencyId).toLowerCase();
        const idStr = String(o.itemId);
        if (
          itemName.includes(q) ||
          currencyName.includes(q) ||
          idStr === q
        ) {
          results.push({
            grid: coordsToGrid(m.x, m.y, this.mapSize),
            x: m.x,
            y: m.y,
            shopName: m.name || '(unnamed)',
            sellItem: this._itemName(o.itemId),
            sellQty: o.quantity,
            costItem: this._itemName(o.currencyId),
            costQty: o.costPerItem,
            stock: o.amountInStock,
            itemIsBlueprint: !!o.itemIsBlueprint,
          });
        }
      }
    }
    return results;
  }
}

module.exports = VendingService;
