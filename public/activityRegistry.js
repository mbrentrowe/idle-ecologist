// activityRegistry.js
// ─────────────────────────────────────────────────────────────────────────────
// Descriptors for zone-based work activities (artisan, and future ones).
//
// HOW TO ADD A NEW ACTIVITY
// ──────────────────────────
//  1. Add an entry to WORK_ACTIVITIES below.
//  2. Add the Tiled object layer to the map (name must match mapLayerName).
//  3. Add the activity key + label to ACTIVITIES in schedulePanel.js.
//  4. Build UI panels as needed (copy artisan sections in manageFarmPanel,
//     realEstatePanel, marketPanel, statsPanel for reference).
//
// The core game-loop functions in js-tiled-loader.js
// (zone loading, travel, production tick, GPS, save/load, offline sim)
// all iterate WORK_ACTIVITIES automatically — no edits needed there.
// ─────────────────────────────────────────────────────────────────────────────

export const WORK_ACTIVITIES = [
  {
    /** Unique key — must match the key used in schedulePanel's schedule object. */
    key: 'artisan',

    /** Tiled object-layer name (compared case-insensitively). */
    mapLayerName: 'artisanzones',

    /** Auto-name prefix applied to every zone. */
    zonePrefix: 'ArtisanZone',

    /** Human-readable name shown in the offline-progress modal. */
    displayName: 'Artisan goods',

    /** Colour accent used in the offline-progress modal section header. */
    color: '#c47a3a',

    /**
     * When true the activity runs continuously (not gated by the schedule).
     * Production ticks, GPS, and offline simulation all honour this flag.
     * The player does NOT walk to these zones on a separate schedule —
     * they are background facilities that produce passively.
     */
    alwaysActive: true,

    /**
     * Returns the purchase cost for a zone at the given rank (0-based).
     * Tiled 'cost' property always overrides this.
     * Artisan workshops scale ~×3 per rank, anchored to the mid-game gold curve:
     *   Rank 0: 75,000  (carrot tier, ~100k lifetime gold)
     *   Rank 1: 225,000 (blueberry tier, ~250k)
     *   Rank 2: 675,000 (parsnip tier, ~600k)
     *   Rank 3: 2,025,000 (lettuce tier, ~1.5M)
     *   Rank 4: 6,075,000 (cauliflower tier, ~4M)
     */
    computeZoneCost(rank) {
      return Math.round(75000 * Math.pow(3, rank));
    },

    /** Fallback flat cost used only if no Tiled property AND computeZoneCost is not defined. */
    defaultZoneCost: 75000,

    /** How often (real seconds at 1× speed) each zone runs one production batch. */
    productionIntervalSecs: 5,

    /**
     * travelIntervalSecs is intentionally omitted — alwaysActive activities
     * do not move the player.  The player stays on the farming/social schedule.
     */

    /**
     * Convert raw Tiled objects into zone descriptor objects.
     * Override the naming convention here if needed for new activities.
     */
    loadZones(objects) {
      return objects.map((obj, i) => ({
        ...obj,
        name: `${this.zonePrefix}${String(i + 1).padStart(2, '0')}`,
      }));
    },

    /**
     * Initialise the per-product stats Map.
     * Called once at startup, before any save data is applied.
     * @param {Object} CROPS
     * @returns {Map<string, {crafted:number, sold:number, lifetimeSales:number}>}
     */
    initProductStats(CROPS) {
      const m = new Map();
      Object.values(CROPS).forEach(ct => {
        if (ct.artisanProduct) {
          m.set(`${ct.id}_artisan`, { crafted: 0, sold: 0, lifetimeSales: 0 });
        }
      });
      return m;
    },

    /**
     * Run one production batch for a zone.
     * @returns {string|null}  productKey if something was produced, else null.
     */
    produce(zone, { zoneProductMap, cropInventory, cropStats, productStats,
                    productInventory, autoSellSet, gold, CROPS }) {
      const cropId   = zoneProductMap.get(zone.name);
      if (!cropId) return null;
      const cropType = CROPS[cropId];
      if (!cropType?.artisanProduct) return null;
      const ap = cropType.artisanProduct;
      if ((cropStats.get(cropId)?.sold ?? 0) < ap.unlockCropSold) return null;
      const have = cropInventory.get(cropId) || 0;
      if (have < ap.cropInputCount) return null;

      cropInventory.set(cropId, have - ap.cropInputCount);
      const productKey = `${cropId}_artisan`;
      const stat = productStats.get(productKey);
      if (stat) stat.crafted += 1;
      if (autoSellSet.has(productKey)) {
        gold.add(ap.goldValue);
        if (stat) { stat.sold += 1; stat.lifetimeSales += ap.goldValue; }
      } else {
        productInventory.set(productKey, (productInventory.get(productKey) || 0) + 1);
      }
      return productKey;
    },

    /** Returns true if this zone has at least one batch ready to produce now. */
    hasWork(zone, { zoneProductMap, cropInventory, cropStats, CROPS }) {
      const cropId = zoneProductMap.get(zone.name);
      if (!cropId) return false;
      const ct = CROPS[cropId];
      if (!ct?.artisanProduct) return false;
      const ap = ct.artisanProduct;
      return (cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold
          && (cropInventory.get(cropId) || 0) >= ap.cropInputCount;
    },

    /**
     * Returns gold earned per real second from this zone at the given gameSpeed.
     * Used by the live gold/sec counter.
     */
    getGPS(zone, { zoneProductMap, cropStats, autoSellSet, gameSpeed, CROPS,
                   productionIntervalSecs }) {
      const cropId = zoneProductMap.get(zone.name);
      if (!cropId) return 0;
      const ct = CROPS[cropId];
      if (!ct?.artisanProduct) return 0;
      const ap = ct.artisanProduct;
      if ((cropStats.get(cropId)?.sold ?? 0) < ap.unlockCropSold) return 0;
      if (!autoSellSet.has(`${cropId}_artisan`)) return 0;
      return ap.goldValue * gameSpeed / productionIntervalSecs;
    },

    /**
     * Human-readable label for a product key (used in the offline modal).
     * @param {string} productKey e.g. 'strawberry_artisan'
     * @param {Object} CROPS
     * @returns {string}
     */
    getProductLabel(productKey, CROPS) {
      const cropId = productKey.replace('_artisan', '');
      return CROPS[cropId]?.artisanProduct?.name ?? productKey;
    },
  },
];
