// js-tiled-loader.js - Loads Tiled map and tileset for vanilla JS
import { loadMap } from './map.js';
import { renderTileLayer } from './tilemapRenderer.js';
import { renderMenuBar } from './menuBarRenderer.js';
import { Calendar } from './calendar.js';
import { Gold } from './gold.js';
import { CROPS, CropInstance } from './crops.js';
import { initMarketPanel } from './marketPanel.js';
import { initRealEstatePanel } from './realEstatePanel.js';
import { initStatsPanel } from './statsPanel.js';
import { initManageFarmPanel } from './manageFarmPanel.js';
import { saveGame, loadGame, clearSave } from './saveSystem.js';
import { initSettingsPanel } from './settingsPanel.js';
import { initEventsPanel } from './eventsPanel.js';
import { initSchedulePanel } from './schedulePanel.js';
import { WORK_ACTIVITIES } from './activityRegistry.js';
import { allEvents } from './src/eventTemplates.js';
import { BOTTOM_BAR_HEIGHT } from './constants.js';
import { createPlayerAnimator, ACTIONS, DIRS } from './playerAnimator.js';
import { buildNavGrid, findPath } from './pathfinder.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Activity time-tracking (module scope so window getters can read them)
let totalFarmingHours     = 0;
let totalSocializingHours = 0;
let totalSleepingHours    = 0;
let totalArtisanHours     = 0;

const DAY_REAL_SECS = 240; // 4 real minutes = 1 in-game day
const SOCIAL_REAL_SECS_PER_HOUR = DAY_REAL_SECS / 24;


function shortNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'k';
  return n.toString();
}

async function main() {
      // Manual zone cost overrides
      window.FARMZONE_COST_OVERRIDES = window.FARMZONE_COST_OVERRIDES || {};
    // Player movement between unlocked farm zones
    let zoneTravelIndex = 0;
    let zoneTravelTimer = 0;
    // Social travel state
    let socialTravelIndex = 0;
    let socialTravelTimer = 0;
    let _wasSocializing = false;
    let _lastSocialPathIndex = -1; // track last zone we pathed to (avoids re-pathing every tick)
    let nav = null; // pathfinding nav grid — set after map loads
    function getUnlockedZoneList() {
      return cropZones.filter(z => unlockedZones.has(z.name));
    }
    function setPlayerPath(destX, destY) {
      let waypoints = nav ? findPath(nav, player.x, player.y, destX, destY) : null;
      if (waypoints && waypoints.length > 0) {
        // First point is immediate target; remainder queued
        player.waypoints = waypoints.slice(1);
        player.targetX   = waypoints[0].x;
        player.targetY   = waypoints[0].y;
      } else {
        // Fallback: direct movement (no nav grid yet, or destination unreachable)
        player.waypoints = [];
        player.targetX   = destX;
        player.targetY   = destY;
      }
    }

    function movePlayerToZone(zone) {
      setPlayerPath(zone.x + zone.width / 2, zone.y + zone.height / 2);
    }
    function updatePlayerZoneTravel(dt) {
      const unlockedList = getUnlockedZoneList();
      if (unlockedList.length === 0) return;
      zoneTravelTimer += dt;
      if (zoneTravelTimer >= 10) {
        zoneTravelTimer = 0;
        zoneTravelIndex = (zoneTravelIndex + 1) % unlockedList.length;
        movePlayerToZone(unlockedList[zoneTravelIndex]);
      }
    }

    function updatePlayerSocialTravel(dt) {
      if (socialZones.length === 0) return;
      socialTravelTimer += dt;
      if (socialTravelTimer >= SOCIAL_REAL_SECS_PER_HOUR) {
        socialTravelTimer = 0;
        socialTravelIndex = (socialTravelIndex + 1) % socialZones.length;
      }
      // Only compute a new path when the destination zone changes
      if (socialTravelIndex !== _lastSocialPathIndex) {
        _lastSocialPathIndex = socialTravelIndex;
        const pt = socialZones[socialTravelIndex];
        setPlayerPath(pt.x, pt.y);
      }
    }

    // ── Generic work-activity helpers (driven by WORK_ACTIVITIES registry) ──────

    /** Build the context object passed to registry callbacks for a given workState entry. */
    function buildProductionCtx(ws) {
      return {
        zoneProductMap:        ws.zoneProductMap,
        cropInventory,
        cropStats,
        productStats:          ws.productStats,
        productInventory:      ws.productInventory,
        autoSellSet,
        gold,
        CROPS,
        gameSpeed,
        productionIntervalSecs: ws.act.productionIntervalSecs,
      };
    }

    /** Move player periodically between unlocked zones for a work activity. */
    function updateWorkActivityTravel(actKey, dt) {
      const ws = workState.get(actKey);
      if (!ws) return;
      const list = ws.zones.filter(z => ws.unlockedSet.has(z.name));
      if (list.length === 0) return;
      ws.travelTimer += dt;
      if (ws.travelTimer >= ws.act.travelIntervalSecs) {
        ws.travelTimer = 0;
        ws.travelIndex = (ws.travelIndex + 1) % list.length;
        const pt = list[ws.travelIndex];
        setPlayerPath(pt.x + (pt.width || 0) / 2, pt.y + (pt.height || 0) / 2);
      }
    }

    /** Returns true if any unlocked zone in this activity has work ready to do. */
    function hasWorkActivity(actKey) {
      const ws = workState.get(actKey);
      if (!ws) return false;
      const ctx = buildProductionCtx(ws);
      return ws.zones.filter(z => ws.unlockedSet.has(z.name)).some(z => ws.act.hasWork(z, ctx));
    }

    // Backward-compat shim for code that still calls hasArtisanWork() directly.
    const hasArtisanWork = () => hasWorkActivity('artisan');
    const getUnlockedArtisanZoneList = () => (workState.get('artisan')?.zones ?? []).filter(z => workState.get('artisan').unlockedSet.has(z.name));

  const calendar = new Calendar();

  // Gold system
  const gold = new Gold(50000);

  // Player sprite — loaded via the animator module
  const animator = await createPlayerAnimator();

  // Tileset images
  const tilesetImage = new Image();
  await new Promise(res => { tilesetImage.onload = res; tilesetImage.onerror = () => { console.warn('Tileset failed to load'); res(); }; tilesetImage.src = 'Assets/Tilesets/IdleEcologistMasterSpriteSheet.png'; });

  const tilesetImage2 = new Image();
  await new Promise(res => { tilesetImage2.onload = res; tilesetImage2.onerror = () => { console.warn('SpringWaterAndPaths tileset failed to load'); res(); }; tilesetImage2.src = 'Assets/Tilesets/SpringWaterAndPaths.png'; });

  // Load the Tiled map
  const map = await loadMap('IdleEcologistPrototype.tmj');

  // Crop zone unlock logic
  let cropZones = [];
  const cropzonesLayer = map.layers && map.layers.find(
    l => l.type === 'objectgroup' && l.name && l.name.toLowerCase() === 'cropzones'
  );
  if (cropzonesLayer && Array.isArray(cropzonesLayer.objects)) {
    cropZones = cropzonesLayer.objects.filter(obj =>
      obj.type === 'FarmZone' || obj.type === 'FarmZoneSmall' ||
      obj.class === 'FarmZone' || obj.class === 'FarmZoneSmall'
    );
    cropZones.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  const unlockedZones = new Set([cropZones.length > 0 ? cropZones[0].name : null]);

  // Social zone points (from the socialZones layer)
  let socialZones = [];
  const socialZonesLayer = map.layers && map.layers.find(
    l => l.type === 'objectgroup' && l.name && l.name.toLowerCase() === 'socialzones'
  );
  if (socialZonesLayer && Array.isArray(socialZonesLayer.objects)) {
    socialZones = socialZonesLayer.objects.filter(
      obj => (obj.type || obj.class || '').toLowerCase() === 'socialzone'
    );
    socialZones.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }

  // ── Zone-based work activities (artisan + future ones from activityRegistry) ──
  // workState: activityKey → { act, zones, unlockedSet, costMap, zoneProductMap,
  //                            productStats, productInventory,
  //                            travelIndex, travelTimer, tickTimer }
  const workState = new Map();
  for (const act of WORK_ACTIVITIES) {
    const layer = map.layers?.find(
      l => l.type === 'objectgroup' && l.name?.toLowerCase() === act.mapLayerName
    );
    const zones = (layer && Array.isArray(layer.objects))
      ? act.loadZones(layer.objects)
      : [];
    workState.set(act.key, {
      act,
      zones,
      unlockedSet:      new Set(),
      costMap:          new Map(),  // populated below after getTiledProp is defined
      zoneProductMap:   new Map(),
      productStats:     act.initProductStats(CROPS),
      productInventory: new Map(),
      travelIndex: 0,
      travelTimer: 0,
      tickTimer:   0,
    });
  }

  // Backward-compat aliases — referenced by UI panels (manageFarm, realEstate, market, stats)
  const _aws               = workState.get('artisan');
  const artisanZones        = _aws.zones;
  const unlockedArtisanZones = _aws.unlockedSet;
  const artisanZoneProductMap = _aws.zoneProductMap;
  const artisanStats          = _aws.productStats;
  const artisanInventory      = _aws.productInventory;

  // Walkable polygon nav grid (WalkableZone object layer)
  const walkableLayer = map.layers && map.layers.find(
    l => l.type === 'objectgroup' && l.name && l.name.toLowerCase() === 'walkablezone'
  );
  if (walkableLayer && Array.isArray(walkableLayer.objects)) {
    const walkablePolygons = walkableLayer.objects
      .filter(obj => Array.isArray(obj.polygon) && obj.polygon.length >= 3)
      .map(obj => obj.polygon.map(pt => ({ x: obj.x + pt.x, y: obj.y + pt.y })));
    if (walkablePolygons.length > 0) {
      nav = buildNavGrid(walkablePolygons, map.width * map.tilewidth, map.height * map.tileheight);
      console.log(`[pathfinder] Nav grid built: ${nav.gridW}x${nav.gridH} cells from ${walkablePolygons.length} polygon(s)`);
    }
  }

  // Helper: read a named custom property from a Tiled object's properties array
  function getTiledProp(obj, name) {
    if (!obj.properties) return undefined;
    const prop = obj.properties.find(p => p.name === name);
    return prop ? prop.value : undefined;
  }

  // Cost per zone: FarmZoneSmall = flat 10,000; FarmZone = 10,000 × (rank+1) among FarmZone-only
  const zoneCostMap = new Map();
  let farmZoneRank = 0;
  cropZones.forEach(zone => {
    const isSmall = zone.class === 'FarmZoneSmall' || zone.type === 'FarmZoneSmall';
    // Use cost from Tiled map property if present (parse as number)
    const rawCost = getTiledProp(zone, 'cost');
    if (rawCost != null) {
      const parsedCost = typeof rawCost === 'number' ? rawCost : parseInt(rawCost, 10);
      if (!isNaN(parsedCost)) {
        zoneCostMap.set(zone.name, parsedCost);
        return;
      }
    }
    if (window.FARMZONE_COST_OVERRIDES[zone.name] != null) {
      zoneCostMap.set(zone.name, window.FARMZONE_COST_OVERRIDES[zone.name]);
    } else if (isSmall) {
      zoneCostMap.set(zone.name, 10000);
    } else {
      zoneCostMap.set(zone.name, 10000 * (farmZoneRank + 1));
      farmZoneRank++;
    }
  });

  // Build cost maps for all work activities (getTiledProp is hoisted, safe to call here)
  // Zones without a Tiled 'cost' property use computeZoneCost(rank) if defined, else defaultZoneCost.
  for (const [, ws] of workState) {
    let rank = 0;
    ws.zones.forEach(zone => {
      const rawCost = getTiledProp(zone, 'cost');
      let cost;
      if (rawCost != null && !isNaN(typeof rawCost === 'number' ? rawCost : parseInt(rawCost, 10))) {
        cost = typeof rawCost === 'number' ? rawCost : parseInt(rawCost, 10);
      } else if (typeof ws.act.computeZoneCost === 'function') {
        cost = ws.act.computeZoneCost(rank);
      } else {
        cost = ws.act.defaultZoneCost;
      }
      ws.costMap.set(zone.name, cost);
      rank++;
    });
  }
  // Backward-compat alias
  const artisanZoneCostMap = _aws.costMap;

  // Player state (start in FarmZone01 if available)
  const farmZone01 = cropZones.find(z => z.name === 'FarmZone01');
  let startX = map.width * map.tilewidth / 2;
  let startY = map.height * map.tileheight / 2;
  if (farmZone01) {
    startX = farmZone01.x + farmZone01.width / 2;
    startY = farmZone01.y + farmZone01.height / 2;
  }

  // Zone → { instance, tileCount } map. Pre-plant strawberry in FarmZone01.
  const zoneCrops = new Map();
  if (farmZone01) {
    const tileCount = Math.round(farmZone01.width / 16) * Math.round(farmZone01.height / 16);
    zoneCrops.set('FarmZone01', { instance: new CropInstance(CROPS.strawberry), tileCount });
  }

  // Crop inventory and auto-sell state
  const cropInventory  = new Map(); // cropId → count in hand
  // artisanInventory, artisanStats, artisanZoneProductMap are aliases set up in the workState section above
  const autoSellSet    = new Set(Object.keys(CROPS)); // cropIds with auto-sell enabled (on by default)
  const unlockedCrops  = new Set(Object.keys(CROPS)); // cropIds the player has access to
  // Lifetime stats: cropId → { grown, sold, lifetimeSales }
  const cropStats = new Map();
  Object.keys(CROPS).forEach(id => cropStats.set(id, { grown: 0, sold: 0, lifetimeSales: 0 }));

  function assignDefaultArtisanProduct(zoneName) {
    if (artisanZoneProductMap.has(zoneName)) return;
    const defaultCrop = Object.values(CROPS).find(ct => {
      if (!ct.artisanProduct) return false;
      const s = cropStats.get(ct.id);
      return s && s.sold >= ct.artisanProduct.unlockCropSold;
    });
    if (defaultCrop) artisanZoneProductMap.set(zoneName, defaultCrop.id);
  }

  const player = {
    x: startX, y: startY,
    targetX: startX, targetY: startY, // rAF lerps x/y toward these
    waypoints: [],                    // queued path waypoints (world coords)
    width: 32, height: 32,            // 2×2 tiles = 32px at 16px/tile
  };

  // Camera state
  const camera = {
    zoom: 2,
    get x() { return player.x; },
    get y() { return player.y; }
  };

  // Offscreen canvas for pixel-perfect rendering
  let offscreen, offCtx;

  // Tileset registry — sorted DESCENDING by firstgid so find() returns the correct sheet per GID
  // firstgid values come from IdleEcologistPrototype.tmj tilesets array
  const tilesets = [
    { firstgid: 12251, columns: 88,  image: tilesetImage2 }, // SpringWaterAndPaths
    { firstgid: 1,     columns: 125, image: tilesetImage  }, // IdleEcologistMasterSpriteSheet
  ];

  // Legacy single-tileset ref (used by menu bar, bottom bar, and crop GID lookups — all GIDs < 12251)
  const tileset = tilesets[tilesets.length - 1]; // firstgid 1

  // Viewport
  let viewport = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  };

  // Menu bar
  const menuBar = document.getElementById('menuBar');
  const menuBarCtx = menuBar.getContext('2d');

  // Menu bar collapse/expand (mobile only)
  const MENU_BAR_DESKTOP_H   = 48;
  const MENU_BAR_MOBILE_H    = 80;
  const MENU_BAR_COLLAPSED_H = 14;
  let menuBarCollapsed = false;
  function isMobileLayout() { return window.innerWidth < 640; }
  function applyMenuBarHeight() {
    const h = isMobileLayout()
      ? (menuBarCollapsed ? MENU_BAR_COLLAPSED_H : MENU_BAR_MOBILE_H)
      : MENU_BAR_DESKTOP_H;
    window.currentMenuBarHeight = h;
    menuBar.height       = h;
    menuBar.style.height = h + 'px';
    if (typeof window.resizeGameCanvas === 'function') window.resizeGameCanvas();
  }
  // Initialise height immediately based on screen width
  applyMenuBarHeight();
  menuBar.addEventListener('click', () => {
    if (isMobileLayout()) {
      menuBarCollapsed = !menuBarCollapsed;
      applyMenuBarHeight();
      drawMenuBar();
    }
  });

  // Bottom bar
  const bottomBar = document.getElementById('bottomBar');
  const bottomBarCtx = bottomBar.getContext('2d');

  const bottomTabs = [
    { label: 'Farm',     icon: '\u{1F33F}', full: 'Manage Farm'  }, // 🌿
    { label: 'Stats',    icon: '\u{1F4CA}', full: 'Stats'        }, // 📊
    { label: 'Market',   icon: '\u{1F6D2}', full: 'Market'       }, // 🛒
    { label: 'Land',     icon: '\u{1F3E1}', full: 'Real Estate'  }, // 🏡
    { label: 'Events',   icon: '\u{1F4DC}', full: 'Events'       }, // 📜
    { label: 'Schedule', icon: '\u{1F550}', full: 'Schedule'     }, // 🕐
    { label: 'Settings', icon: '\u2699\uFE0F', full: 'Settings'  }, // ⚙️
  ];
  let activeTab = 0;
  let tabOpen = false;
  let gameSpeed = 1;
  let gamePaused = false;
  let calendarAccum = 0;

  // Sleeping state
  let isSleeping = false;
  let autoPilot   = false; // 🤖 fully-automated decision-making
  let sleepPendingTicks = 0; // > 0: player visible at sleep tile before overlay starts
  const SLEEP_WALK_TICKS = 3; // seconds the player stands at the bed before the overlay
  const SLEEP_TILE_COL = 2;
  const SLEEP_TILE_ROW = 7;
  const SLEEP_WORLD_X = SLEEP_TILE_COL * 16 + 8;
  const SLEEP_WORLD_Y = SLEEP_TILE_ROW * 16 + 8;

  // Work activity tick timers live inside workState entries (ws.tickTimer per activity)

  function drawBottomBar() {
    const w = bottomBar.width;
    const h = bottomBar.height; // 56px = 3 tile rows scaled to fill bar height
    bottomBarCtx.clearRect(0, 0, w, h);

    const tileSize = 16;
    const tilesetCols = 125;
    const tileDrawSize = Math.round(h / 3); // scale to fill bar height
    const numCols = Math.max(3, Math.floor(w / tileDrawSize));

    // Each row: [leftGID, middleGID, rightGID]
    const rows = [
      [11129, 11130, 11131],
      [11254, 11255, 11256],
      [11379, 11380, 11381],
    ];

    // Draw tiled background
    bottomBarCtx.imageSmoothingEnabled = false;
    rows.forEach((rowGids, rowIndex) => {
      const dy = rowIndex * tileDrawSize;
      for (let col = 0; col < numCols; col++) {
        const gid = col === 0 ? rowGids[0] : col === numCols - 1 ? rowGids[2] : rowGids[1];
        const tileId = gid - 1;
        const sx = (tileId % tilesetCols) * tileSize;
        const sy = Math.floor(tileId / tilesetCols) * tileSize;
        const dx = col * tileDrawSize;
        bottomBarCtx.drawImage(tilesetImage, sx, sy, tileSize, tileSize, dx, dy, tileDrawSize, tileDrawSize);
      }
    });

    // Draw tabs overlay
    const tabW = w / bottomTabs.length;
    // Show label text only when tabs are wide enough
    const showLabel = tabW >= 52;
    const iconSize  = showLabel ? Math.min(20, Math.floor(h * 0.42)) : Math.min(26, Math.floor(h * 0.58));
    const labelSize = Math.max(9, Math.min(11, Math.floor(tabW / 7)));

    bottomTabs.forEach((tab, i) => {
      const tx = i * tabW;
      const cx = tx + tabW / 2;

      // Active tab highlight
      if (i === activeTab) {
        bottomBarCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        bottomBarCtx.fillRect(tx + 1, 0, tabW - 2, h);
        // Top accent line for active tab
        bottomBarCtx.fillStyle = '#ffd700';
        bottomBarCtx.fillRect(tx + 1, 0, tabW - 2, 2);
      }

      // Divider between tabs (skip before first)
      if (i > 0) {
        bottomBarCtx.strokeStyle = 'rgba(0,0,0,0.35)';
        bottomBarCtx.lineWidth = 1;
        bottomBarCtx.beginPath();
        bottomBarCtx.moveTo(tx + 0.5, 4);
        bottomBarCtx.lineTo(tx + 0.5, h - 4);
        bottomBarCtx.stroke();
      }

      // Icon (emoji)
      const iconY = showLabel ? h * 0.36 : h * 0.5;
      bottomBarCtx.font = `${iconSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      bottomBarCtx.textAlign = 'center';
      bottomBarCtx.textBaseline = 'middle';
      bottomBarCtx.fillText(tab.icon, cx, iconY);

      // Label text (only when wide enough)
      if (showLabel) {
        const labelY = h * 0.78;
        bottomBarCtx.font = `bold ${labelSize}px sans-serif`;
        bottomBarCtx.textBaseline = 'middle';
        // Drop shadow
        bottomBarCtx.fillStyle = 'rgba(0,0,0,0.6)';
        bottomBarCtx.fillText(tab.label, cx + 1, labelY + 1);
        // Label text
        bottomBarCtx.fillStyle = i === activeTab ? '#ffd700' : '#e8e8e8';
        bottomBarCtx.fillText(tab.label, cx, labelY);
      }
    });
  }

  function hideAll() { market.hide(); realEstate.hide(); stats.hide(); manageFarm.hide(); settingsPanel.hide(); eventsPanel.hide(); schedulePanel.hide(); }

  // Shared handler for bottom-tab tap/click
  function handleTabTap(x) {
    const tabW = bottomBar.width / bottomTabs.length;
    const clicked = Math.floor(x / tabW);
    if (clicked >= 0 && clicked < bottomTabs.length) {
      if (clicked === activeTab) {
        // Toggle the panel open/closed
        tabOpen = !tabOpen;
      } else {
        activeTab = clicked;
        tabOpen = true;
      }
      drawBottomBar();
      if (tabOpen && activeTab === marketTabIndex)          { hideAll(); market.show(); }
      else if (tabOpen && activeTab === realEstateTabIndex)  { hideAll(); realEstate.show(); }
      else if (tabOpen && activeTab === statsTabIndex)       { hideAll(); stats.show(); }
      else if (tabOpen && activeTab === manageFarmTabIndex)  { hideAll(); manageFarm.show(); }
      else if (tabOpen && activeTab === settingsTabIndex)    { hideAll(); settingsPanel.show(); }
      else if (tabOpen && activeTab === eventsTabIndex)      { hideAll(); eventsPanel.update(getActiveEvents(), getPastEvents(), cropInventory); eventsPanel.show(); }
      else if (tabOpen && activeTab === scheduleTabIndex)    { hideAll(); schedulePanel.show(); }
      else { hideAll(); }
    }
  }

  bottomBar.addEventListener('touchstart', (e) => {
    e.preventDefault(); // prevents the subsequent click event and removes 300ms delay
    const rect = bottomBar.getBoundingClientRect();
    const touch = e.changedTouches[0];
    handleTabTap(touch.clientX - rect.left);
  }, { passive: false });

  bottomBar.addEventListener('click', (e) => {
    const rect = bottomBar.getBoundingClientRect();
    handleTabTap(e.clientX - rect.left);
  });

  function drawMenuBar() {
    const mw       = menuBar.width;
    const mh       = menuBar.height;
    const pad      = 8;
    const tileSize = 16;
    const columns  = 125;
    const isMobile = isMobileLayout();

    menuBarCtx.clearRect(0, 0, mw, mh);

    // COLLAPSED: thin strip
    if (isMobile && menuBarCollapsed) {
      menuBarCtx.fillStyle = '#1a1008';
      menuBarCtx.fillRect(0, 0, mw, mh);
      menuBarCtx.font = 'bold 9px sans-serif';
      menuBarCtx.fillStyle = '#ffd700';
      menuBarCtx.textAlign = 'center';
      menuBarCtx.textBaseline = 'middle';
      menuBarCtx.fillText('\u25BC  tap to expand', mw / 2, mh / 2);
      return;
    }

    // Background tiles (covers 0-48px = 3 tile rows)
    renderMenuBar(menuBarCtx, tilesetImage, mw, tileSize);

    // Extra background row for mobile expanded section (48-80px)
    if (isMobile && mh > 48) {
      menuBarCtx.fillStyle = '#201409';
      menuBarCtx.fillRect(0, 48, mw, mh - 48);
      menuBarCtx.strokeStyle = 'rgba(255,215,0,0.15)';
      menuBarCtx.lineWidth = 1;
      menuBarCtx.beginPath();
      menuBarCtx.moveTo(0, 48.5);
      menuBarCtx.lineTo(mw, 48.5);
      menuBarCtx.stroke();
    }

    function drawDivider(x, y1, y2) {
      menuBarCtx.save();
      menuBarCtx.strokeStyle = 'rgba(255,255,255,0.22)';
      menuBarCtx.lineWidth = 1;
      menuBarCtx.beginPath();
      menuBarCtx.moveTo(x + 0.5, y1 != null ? y1 : 4);
      menuBarCtx.lineTo(x + 0.5, y2 != null ? y2 : mh - 4);
      menuBarCtx.stroke();
      menuBarCtx.restore();
    }

    function truncate(ctx, text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 0 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
      return t + '\u2026';
    }

    // Compute next crop unlock
    const lifetimeGold = Array.from(cropStats.values()).reduce((sum, s) => sum + s.lifetimeSales, 0);
    let nextCrop = null, nextReq = '', nextIconGID = null, nextCropName = '';
    for (const cropId of Object.keys(CROPS)) {
      const crop = CROPS[cropId];
      if (crop.unlockCriteria && !crop.isUnlocked(cropStats, lifetimeGold)) {
        nextCrop     = crop;
        nextIconGID  = crop.marketIconGID;
        nextCropName = crop.name;
        const req = crop.unlockCriteria;
        const s   = cropStats.get(req.cropId) || { sold: 0 };
        nextReq = 'Sell ' + req.cropSold + ' ' + (CROPS[req.cropId]?.name || req.cropId) +
                  ' (' + s.sold + '/' + req.cropSold + ')  \u2192  Earn ' +
                  req.goldEarned.toLocaleString() + 'g (' +
                  lifetimeGold.toLocaleString() + '/' + req.goldEarned.toLocaleString() + ')';
        break;
      }
    }

    // Draws gold icon + amount + GPS; returns right edge x
    function computeGoldPerSecond() {
      let gps = 0;
      // Farming GPS — only during farming hours
      if (schedulePanel.isFarmingTime(calendarAccum)) {
        zoneCrops.forEach(({ instance, tileCount }) => {
          const ct = instance.cropType;
          const cycleTime = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
          if (cycleTime > 0 && autoSellSet.has(ct.id)) gps += (tileCount * ct.yieldGold * gameSpeed) / cycleTime;
        });
      }
      // Always-active work activities (artisan) — contribute GPS around the clock
      for (const [, ws] of workState) {
        if (!ws.act.alwaysActive) continue;
        const ctx = buildProductionCtx(ws);
        ws.zones.filter(z => ws.unlockedSet.has(z.name)).forEach(zone => {
          gps += ws.act.getGPS(zone, ctx);
        });
      }
      return gps;
    }

    function drawGold(cy) {
      menuBarCtx.imageSmoothingEnabled = false;
      const goldId = 1159;
      menuBarCtx.drawImage(tilesetImage,
        (goldId % columns) * tileSize, Math.floor(goldId / columns) * tileSize, tileSize, tileSize,
        pad, cy - tileSize / 2, tileSize, tileSize);
      menuBarCtx.font = "bold 14px sans-serif";
      menuBarCtx.fillStyle = "#ffd700";
      menuBarCtx.textAlign = "left";
      menuBarCtx.textBaseline = "middle";
      const goldText  = gold.getFormatted();
      const goldTextX = pad + tileSize + 4;
      menuBarCtx.fillText(goldText, goldTextX, cy);
      let rightEdge = goldTextX + menuBarCtx.measureText(goldText).width + 4;

      // GPS label
      const gps = computeGoldPerSecond();
      if (gps > 0) {
        const gpsText = `+${shortNumber(Math.round(gps))}/s`;
        menuBarCtx.font = "11px sans-serif";
        menuBarCtx.fillStyle = "rgba(180,230,160,0.85)";
        menuBarCtx.textAlign = "left";
        menuBarCtx.textBaseline = "middle";
        menuBarCtx.fillText(gpsText, rightEdge, cy);
        rightEdge += menuBarCtx.measureText(gpsText).width + 6;
      } else {
        rightEdge += 2;
      }
      return rightEdge;
    }
    // MOBILE EXPANDED: 2-row layout
    if (isMobile) {
      const ROW1 = 24;
      const ROW2 = 64;

      // Measure date/time FIRST so we can clip gold section away from date/time
      const dateStr      = calendar.getDateString();
      const timeStr      = calendar.getTimeOfDay();
      const dateTimeText = dateStr + (typeof timeStr !== "undefined" ? "   " + timeStr : "");
      menuBarCtx.font = "bold 12px sans-serif";
      const dtW = menuBarCtx.measureText(dateTimeText).width;
      const dtLeft = mw - pad - dtW;

      // Draw gold clipped to left of date/time section
      menuBarCtx.save();
      menuBarCtx.beginPath();
      menuBarCtx.rect(0, 0, dtLeft - pad * 2, 48);
      menuBarCtx.clip();
      const afterGold = drawGold(ROW1);
      menuBarCtx.restore();
      drawDivider(Math.min(afterGold, dtLeft - pad * 2), 4, 44);

      // Date/time (right of row 1)
      menuBarCtx.font = "bold 12px sans-serif";
      menuBarCtx.fillStyle = "#e8e8e8";
      menuBarCtx.textAlign = "right";
      menuBarCtx.textBaseline = "middle";
      menuBarCtx.fillText(dateTimeText, mw - pad, ROW1);

      // Collapse hint (row 2 right)
      menuBarCtx.font = "bold 9px sans-serif";
      menuBarCtx.fillStyle = "rgba(255,215,0,0.45)";
      menuBarCtx.textAlign = "right";
      menuBarCtx.textBaseline = "middle";
      menuBarCtx.fillText("\u25B2 tap to collapse", mw - pad, ROW2);

      if (nextCrop && nextIconGID) {
        menuBarCtx.imageSmoothingEnabled = false;
        const iconId = nextIconGID - 1;
        menuBarCtx.drawImage(tilesetImage,
          (iconId % columns) * tileSize, Math.floor(iconId / columns) * tileSize, tileSize, tileSize,
          pad, ROW2 - tileSize / 2, tileSize, tileSize);

        menuBarCtx.font = "bold 12px sans-serif";
        menuBarCtx.fillStyle = "#ffd700";
        menuBarCtx.textAlign = "left";
        menuBarCtx.textBaseline = "middle";
        const nameX = pad + tileSize + 4;
        const nameW = menuBarCtx.measureText(nextCropName).width;
        menuBarCtx.fillText(nextCropName, nameX, ROW2);

        // Scrolling marquee for requirement text
        const reqX       = nameX + nameW + 8;
        const hintW      = menuBarCtx.measureText("\u25B2 tap to collapse").width + pad + 12;
        const reqAreaW   = mw - reqX - hintW;
        if (reqAreaW > 20) {
          menuBarCtx.font = "11px sans-serif";
          menuBarCtx.fillStyle = "rgba(255,255,255,0.75)";
          menuBarCtx.textAlign = "left";
          menuBarCtx.textBaseline = "middle";
          const reqTW = menuBarCtx.measureText(nextReq).width;
          if (reqTW <= reqAreaW) {
            // Text fits  draw statically
            menuBarCtx.fillText(nextReq, reqX, ROW2);
          } else {
            // Marquee scroll: clip to the available area, draw twice for seamless loop
            const gap = 40;
            const loopW = reqTW + gap;
            const offset = reqScrollOffset % loopW;
            menuBarCtx.save();
            menuBarCtx.beginPath();
            menuBarCtx.rect(reqX, ROW2 - 12, reqAreaW, 24);
            menuBarCtx.clip();
            menuBarCtx.fillText(nextReq, reqX - offset, ROW2);
            menuBarCtx.fillText(nextReq, reqX - offset + loopW, ROW2);
            menuBarCtx.restore();
          }
        }
      } else {
        menuBarCtx.font = "11px sans-serif";
        menuBarCtx.fillStyle = "rgba(255,255,255,0.4)";
        menuBarCtx.textAlign = "left";
        menuBarCtx.textBaseline = "middle";
        menuBarCtx.fillText("All crops unlocked", pad, ROW2);
      }
      return;
    }
    // DESKTOP: single-row layout
    const cy = mh / 2;
    const afterGold = drawGold(cy);
    drawDivider(afterGold + 2);

    menuBarCtx.font = 'bold 13px sans-serif';
    const dateStr      = calendar.getDateString();
    const timeStr      = calendar.getTimeOfDay();
    const dateTimeText = dateStr + '   ' + timeStr;
    const dtWidth      = menuBarCtx.measureText(dateTimeText).width;
    const dateSectionLeft = mw - pad - dtWidth;
    drawDivider(dateSectionLeft - 8);

    if (nextCrop && nextIconGID) {
      const clipLeft  = afterGold + 16;
      const clipRight = dateSectionLeft - 14;
      const clipW     = clipRight - clipLeft;
      if (clipW > 32) {
        menuBarCtx.save();
        menuBarCtx.beginPath();
        menuBarCtx.rect(clipLeft, 0, clipW, mh);
        menuBarCtx.clip();

        menuBarCtx.imageSmoothingEnabled = false;
        const iconId = nextIconGID - 1;
        menuBarCtx.drawImage(tilesetImage,
          (iconId % columns) * tileSize, Math.floor(iconId / columns) * tileSize, tileSize, tileSize,
          clipLeft, cy - tileSize / 2, tileSize, tileSize);

        menuBarCtx.font = 'bold 12px sans-serif';
        menuBarCtx.fillStyle = '#ffd700';
        menuBarCtx.textAlign = 'left';
        menuBarCtx.textBaseline = 'middle';
        const nameX = clipLeft + tileSize + 5;
        const nameW = menuBarCtx.measureText(nextCropName).width;
        menuBarCtx.fillText(nextCropName, nameX, cy);

        const reqX    = nameX + nameW + 10;
        const reqRoom = clipRight - reqX - 4;
        if (reqRoom > 40) {
          menuBarCtx.font = '11px sans-serif';
          menuBarCtx.fillStyle = 'rgba(255,255,255,0.75)';
          menuBarCtx.fillText(truncate(menuBarCtx, nextReq, reqRoom), reqX, cy);
        }
        menuBarCtx.restore();
      }
    }

    menuBarCtx.font = 'bold 13px sans-serif';
    menuBarCtx.fillStyle = '#e8e8e8';
    menuBarCtx.textAlign = 'right';
    menuBarCtx.textBaseline = 'middle';
    menuBarCtx.fillText(dateTimeText, mw - pad, cy);
  }

  // Draw function (viewport and all variables are now initialized above)
  function draw() {
    viewport.width = canvas.width;
    viewport.height = canvas.height;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#6ab04c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const mapPixelWidth = map.width * map.tilewidth;
    const mapPixelHeight = map.height * map.tileheight;

    if (!offscreen || offscreen.width !== mapPixelWidth || offscreen.height !== mapPixelHeight) {
      offscreen = document.createElement('canvas');
      offscreen.width = mapPixelWidth;
      offscreen.height = mapPixelHeight;
      offCtx = offscreen.getContext('2d');
    }

    offCtx.clearRect(0, 0, mapPixelWidth, mapPixelHeight);
    offCtx.imageSmoothingEnabled = false;

    // Map tiles � render full map to offscreen canvas (camera crop happens at blit step)
    const fullMapViewport = { x: 0, y: 0, width: mapPixelWidth, height: mapPixelHeight };
    map.layers
      .filter(l => l.type === 'tilelayer' && l.visible)
      .forEach(layer => {
        renderTileLayer(offCtx, map, layer, tilesets, fullMapViewport, 1, 1, 0, 0);
      });

    // Draw crops in unlocked zones
    cropZones.forEach(zone => {
      if (!unlockedZones.has(zone.name)) return;
      const entry = zoneCrops.get(zone.name);
      if (!entry) return;
      const { instance } = entry;

      const gid = instance.currentGID;
      const tileId = gid - 1;
      const sx = (tileId % tileset.columns) * 16;
      const sy = Math.floor(tileId / tileset.columns) * 16;
      const zx = Math.round(zone.x);
      const zy = Math.round(zone.y);
      const zw = Math.round(zone.width);
      const zh = Math.round(zone.height);

      offCtx.imageSmoothingEnabled = false;
      for (let row = 0; row < Math.ceil(zh / 16); row++) {
        for (let col = 0; col < Math.ceil(zw / 16); col++) {
          offCtx.drawImage(tilesetImage, sx, sy, 16, 16, zx + col * 16, zy + row * 16, 16, 16);
        }
      }
    });

    // Draw player sprite (hidden while sleeping; animator handles sheet/frame/dir)
    if (!isSleeping) {
      animator.draw(offCtx, player.x, player.y);
    }

    // Crop zone overlays (locked zones only)
    cropZones.forEach((zone, i) => {
      const x = Math.round(zone.x);
      const y = Math.round(zone.y);
      const w = Math.round(zone.width);
      const h = Math.round(zone.height);
      const isSmall = zone.class === 'FarmZoneSmall' || zone.type === 'FarmZoneSmall';
      if (!unlockedZones.has(zone.name)) {
        offCtx.save();
        offCtx.globalAlpha = 0.55;
        offCtx.fillStyle = '#222';
        offCtx.fillRect(x, y, w, h);
        offCtx.globalAlpha = 1.0;
        offCtx.strokeStyle = '#ffd700';
        offCtx.lineWidth = 2;
        offCtx.strokeRect(x, y, w, h);
        // Show unlock cost on all locked zones (small zones now wide enough to display)
        const unlockCost = zoneCostMap.get(zone.name) ?? 0;
        const goldGID = 1160;
        const tileSize = 12;
        const columns = 125;
        const tileId = goldGID - 1;
        const sx = (tileId % columns) * 16;
        const sy = Math.floor(tileId / columns) * 16;
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const iconX = centerX - tileSize / 2 - 10;
        const iconY = centerY - tileSize / 2;
        offCtx.drawImage(tilesetImage, sx, sy, 16, 16, iconX, iconY, tileSize, tileSize);
        offCtx.font = 'bold 10px sans-serif';
        offCtx.fillStyle = '#ffd700';
        offCtx.textAlign = 'left';
        offCtx.textBaseline = 'middle';
        offCtx.fillText(shortNumber(unlockCost), iconX + tileSize + 4, centerY);
        offCtx.restore();
      }
    });

    // Draw artisan product icons above unlocked artisan zones (always visible — artisan runs 24/7)
    if (artisanZones.length > 0) {
      const unlockedArtisanList = artisanZones.filter(z => unlockedArtisanZones.has(z.name));
      if (unlockedArtisanList.length > 0) {
        const iconSize = 14;
        const ACOLS   = 125;
        unlockedArtisanList.forEach((zone) => {
          const assignedCropId = artisanZoneProductMap.get(zone.name);
          const assignedCrop   = assignedCropId ? CROPS[assignedCropId] : null;
          const ap             = assignedCrop ? assignedCrop.artisanProduct : null;
          if (!ap) return;
          const cx  = Math.round(zone.x + (zone.width  || 0) / 2);
          const cy  = Math.round(zone.y + (zone.height || 0) / 2);
          const bcy = cy - iconSize - 8;  // bubble centre Y (above zone)
          const r   = iconSize / 2 + 3;

          offCtx.save();
          // Amber bubble background
          offCtx.globalAlpha = 0.88;
          offCtx.fillStyle   = 'rgba(25, 15, 5, 0.75)';
          offCtx.beginPath();
          offCtx.arc(cx, bcy, r, 0, Math.PI * 2);
          offCtx.fill();
          offCtx.strokeStyle = '#c47a3a';
          offCtx.lineWidth   = 1.5;
          offCtx.stroke();
          offCtx.globalAlpha = 1.0;

          // Artisan product tile icon
          if (tilesetImage && ap.iconGID) {
            const tid = ap.iconGID - 1;
            offCtx.imageSmoothingEnabled = false;
            offCtx.drawImage(
              tilesetImage,
              (tid % ACOLS) * 16, Math.floor(tid / ACOLS) * 16, 16, 16,
              cx - iconSize / 2, bcy - iconSize / 2, iconSize, iconSize
            );
          }
          offCtx.restore();
        });
      }
    }

    // Camera/zoom
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#6ab04c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const viewW = canvas.width / camera.zoom;
    const viewH = canvas.height / camera.zoom;
    let camX = Math.round(camera.x - viewW / 2);
    let camY = Math.round(camera.y - viewH / 2);
    camX = Math.max(0, Math.min(mapPixelWidth - viewW, camX));
    camY = Math.max(0, Math.min(mapPixelHeight - viewH, camY));
    ctx.drawImage(offscreen, camX, camY, viewW, viewH, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // -- Sleep overlay (drawn every frame, inline to avoid flicker) ------------
    if (isSleeping) {
      const now = performance.now() / 1000;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 10, 30, 0.62)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Project sleep tile world position ? screen coords (accounts for camera clamping)
      const _vW = canvas.width / camera.zoom;
      const _vH = canvas.height / camera.zoom;
      let _cX = Math.round(SLEEP_WORLD_X - _vW / 2);
      let _cY = Math.round(SLEEP_WORLD_Y - _vH / 2);
      _cX = Math.max(0, Math.min(mapPixelWidth  - _vW, _cX));
      _cY = Math.max(0, Math.min(mapPixelHeight - _vH, _cY));
      const baseX = (SLEEP_WORLD_X - _cX) * camera.zoom;
      const baseY = (SLEEP_WORLD_Y - _cY) * camera.zoom - 24;
      const CYCLE = 3.0;
      for (let b = 0; b < 3; b++) {
        const t = ((now + b * (CYCLE / 3)) % CYCLE) / CYCLE;
        const alpha = t < 0.55 ? t / 0.55 : 1 - (t - 0.55) / 0.45;
        const riseY = t * 30;
        const scale = 0.65 + t * 0.65;
        const label = 'z'.repeat(b + 1);
        const fontSize = Math.round((8 + b * 3) * scale);
        const ox = (b - 1) * 14;
        const oy = -b * 16 - riseY;
        ctx.save();
        ctx.globalAlpha    = Math.max(0, Math.min(1, alpha)) * 0.92;
        ctx.font           = `bold ${fontSize}px sans-serif`;
        ctx.textAlign      = 'center';
        ctx.textBaseline   = 'middle';
        ctx.strokeStyle    = 'rgba(0,20,60,0.75)';
        ctx.lineWidth      = 3;
        ctx.strokeText(label, baseX + ox, baseY + oy);
        ctx.fillStyle      = '#b8d8ff';
        ctx.fillText(label, baseX + ox, baseY + oy);
        ctx.restore();
      }
      ctx.restore();
    }
    // -------------------------------------------------------------------------
  }

  // rAF render loop — handles smooth player movement, animation, and all drawing
  //   Game logic stays in the 250ms setInterval; this loop only renders.
  const WALK_SPEED_PX_PER_SEC = 300; // world px/sec player travels between zones
  let _lastRafTs = null;
  let reqScrollOffset = 0;
  let currentActivity = 'idle'; // updated by setInterval: 'farming'|'socializing'|'sleeping'|'idle'

  function renderLoop(ts) {
    const dt = _lastRafTs != null ? Math.min((ts - _lastRafTs) / 1000, 0.1) : 0;
    _lastRafTs = ts;

    if (isMobileLayout() && !menuBarCollapsed) reqScrollOffset += 40 * dt;
    // Lerp player toward target position
    const dx   = player.targetX - player.x;
    const dy   = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isMoving = dist > 0.5;
    if (isMoving) {
      const step = Math.min(WALK_SPEED_PX_PER_SEC * dt, dist);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
    } else {
      player.x = player.targetX;
      player.y = player.targetY;
      // Arrived at waypoint — advance to next one if queued
      if (player.waypoints.length > 0) {
        const next = player.waypoints.shift();
        player.targetX = next.x;
        player.targetY = next.y;
      }
    }

    // Determine action and facing direction for this frame.
    // Query the schedule directly (avoids up-to-250ms lag from setInterval updating currentActivity).
    let rafAction = ACTIONS.IDLE;
    let rafDir    = null; // null = keep last direction
    if (isSleeping || sleepPendingTicks > 0) {
      rafAction = ACTIONS.SLEEP;
    } else if (isMoving) {
      rafAction = ACTIONS.WALK;
      rafDir    = animator.dirFromDelta(dx, dy);
    } else if (schedulePanel.isSocializingTime(calendarAccum)) {
      rafAction = ACTIONS.SOCIALIZE;
    } else if (schedulePanel.isFarmingTime(calendarAccum)) {
      rafAction = ACTIONS.FARM;
    }

    if (!gamePaused) animator.update(dt, rafAction, rafDir);

    draw();
    drawMenuBar();
    drawBottomBar();
    requestAnimationFrame(renderLoop);
  }

  // Market panel
  const marketTabIndex = bottomTabs.findIndex(t => t.full === 'Market');
  const market = initMarketPanel({ tilesetImage, CROPS, cropInventory, artisanInventory, artisanStats, autoSellSet, gold, cropStats });

  // Stats panel
  const statsTabIndex = bottomTabs.findIndex(t => t.full === 'Stats');
  const stats = initStatsPanel({ CROPS, cropStats, tilesetImage, cropInventory, artisanInventory, artisanStats });

  // Manage Farm panel
  const manageFarmTabIndex = bottomTabs.findIndex(t => t.full === 'Manage Farm');
  const manageFarm = initManageFarmPanel({
    cropZones, unlockedZones, unlockedCrops, zoneCrops, CROPS, CropInstance, tilesetImage, cropStats,
    artisanZones, unlockedArtisanZones, artisanZoneProductMap,
    onCropChange: () => { draw(); drawMenuBar(); },
  });

  // Real Estate panel
  const realEstateTabIndex = bottomTabs.findIndex(t => t.full === 'Real Estate');

  function getIncomePerSecond() {
    let ips = 0;
    zoneCrops.forEach(({ instance, tileCount }) => {
      const ct = instance.cropType;
      const cycleTime = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
      if (cycleTime > 0) ips += (tileCount * ct.yieldGold) / cycleTime;
    });
    return ips;
  }

  const realEstate = initRealEstatePanel({
    cropZones, unlockedZones, gold, zoneCrops, CROPS, CropInstance,
    artisanZones, unlockedArtisanZones, artisanZoneCostMap,
    getIncomePerSecond, zoneCostMap,
    onPurchase: () => {
      // Auto-assign default artisan product for any newly bought artisan zone
      for (const zoneName of unlockedArtisanZones) assignDefaultArtisanProduct(zoneName);
      draw(); drawMenuBar(); manageFarm.update();
    },
  });

  // --- Event criteria checker ---
  const completedEventIds = new Set(); // stores completed event object references

  function getActiveEvents() {
    return allEvents
      .filter(evt => {
        if (completedEventIds.has(evt)) return false;
        const c = evt.criteria;
        if (!c) return false;
        if (typeof c.hoursSocializing === 'number' && totalSocializingHours < c.hoursSocializing) return false;
        if (c.cropCount) {
          const grown = cropStats.get(c.cropCount.type)?.grown ?? 0;
          if (grown < c.cropCount.amount) return false;
        }
        return true;
      })
      .map(evt => ({
        ...evt,
        onComplete: () => {
          // Deduct quest crops from inventory
          if (evt.quest?.cropType && evt.quest?.cropAmount) {
            const have = cropInventory.get(evt.quest.cropType) ?? 0;
            cropInventory.set(evt.quest.cropType, Math.max(0, have - evt.quest.cropAmount));
          }
          // Add gold reward
          if (evt.reward?.gold) {
            gold.add(evt.reward.gold);
          }
          // Mark completed
          completedEventIds.add(evt);
          // Refresh UI
          eventsPanel.update(getActiveEvents(), getPastEvents(), cropInventory);
          market.update();
          drawMenuBar();
        },
      }));
  }

  function getPastEvents() {
    return allEvents.filter(evt => completedEventIds.has(evt));
  }

  // --- Persistent Save/Load Integration ---
  function getGameState() {
    return {
      gold: gold.amount,
      totalSocializingHours,
      totalFarmingHours,
      totalSleepingHours,
      totalArtisanHours,
      calendar: {
        day: calendar.day,
        month: calendar.month,
        year: calendar.year,
        elapsedMsInDay: (Date.now() - calendar._startTime) % (4 * 60 * 1000),
      },
      cropInventory: Object.fromEntries(cropInventory),
      // Work activities state (generic — driven by WORK_ACTIVITIES registry)
      workActivities: Object.fromEntries(
        Array.from(workState.entries()).map(([key, ws]) => [key, {
          unlockedSet:      Array.from(ws.unlockedSet),
          zoneProductMap:   Object.fromEntries(ws.zoneProductMap),
          productStats:     Object.fromEntries(Array.from(ws.productStats.entries()).map(([k, s]) => [k, { ...s }])),
          productInventory: Object.fromEntries(ws.productInventory),
        }])
      ),
      // Legacy keys kept so saves created before the registry refactor can still be read
      artisanInventory: Object.fromEntries(artisanInventory),
      artisanStats: Object.fromEntries(Array.from(artisanStats.entries()).map(([k, s]) => [k, { ...s }])),
      artisanZoneProductMap: Object.fromEntries(artisanZoneProductMap),
      autoSellSet: Array.from(autoSellSet),
      savedAt: Date.now(),
      unlockedZones: Array.from(unlockedZones),
      unlockedArtisanZones: Array.from(unlockedArtisanZones),
      unlockedCrops: Array.from(unlockedCrops),
      zoneCrops: Array.from(zoneCrops.entries()).map(([zone, { instance, tileCount }]) => ({
        zone,
        cropId: instance.cropType.id,
        tileCount,
        phase: instance.phase,
        timer: instance.timer,
      })),
      cropStats: Object.fromEntries(Array.from(cropStats.entries()).map(([id, s]) => [id, { ...s }])),
      criteriaCompletedEventIds: Array.from(completedEventIds).map(evt => allEvents.indexOf(evt)),
      schedule: schedulePanel.getScheduleState(),
      zoom: camera.zoom,
      gameSpeed,
      autoPilot,
    };
  }

  function applyGameState(state) {
    if (!state) return;
    if (typeof state.gold === 'number') gold.amount = state.gold;
    if (typeof state.totalSocializingHours === 'number') totalSocializingHours = state.totalSocializingHours;
    if (typeof state.totalFarmingHours    === 'number') totalFarmingHours    = state.totalFarmingHours;
    if (typeof state.totalSleepingHours   === 'number') totalSleepingHours   = state.totalSleepingHours;
    if (typeof state.totalArtisanHours    === 'number') totalArtisanHours    = state.totalArtisanHours;
    if (state.calendar) {
      calendar.day = state.calendar.day ?? calendar.day;
      calendar.month = state.calendar.month ?? calendar.month;
      calendar.year = state.calendar.year ?? calendar.year;
      calendar.season = ['Spring','Summer','Fall','Winter'][calendar.month] ?? calendar.season;
      if (state.calendar.elapsedMsInDay != null) {
        calendar._startTime = Date.now() - state.calendar.elapsedMsInDay;
      }
    }
    if (state.cropInventory) {
      cropInventory.clear();
      Object.entries(state.cropInventory).forEach(([id, count]) => cropInventory.set(id, count));
    }
    // Work activities — new format
    if (state.workActivities) {
      for (const [key, data] of Object.entries(state.workActivities)) {
        const ws = workState.get(key);
        if (!ws) continue;
        if (data.unlockedSet)      { ws.unlockedSet.clear();      data.unlockedSet.forEach(z => ws.unlockedSet.add(z)); }
        if (data.zoneProductMap)   { ws.zoneProductMap.clear();   Object.entries(data.zoneProductMap).forEach(([k,v]) => ws.zoneProductMap.set(k,v)); }
        if (data.productStats)     { Object.entries(data.productStats).forEach(([k,s]) => { if (ws.productStats.has(k)) Object.assign(ws.productStats.get(k), s); }); }
        if (data.productInventory) { ws.productInventory.clear(); Object.entries(data.productInventory).forEach(([k,v]) => ws.productInventory.set(k,v)); }
      }
    } else {
      // Legacy save format (before activity registry refactor)
      const aws = workState.get('artisan');
      if (aws) {
        if (state.unlockedArtisanZones) { aws.unlockedSet.clear();    state.unlockedArtisanZones.forEach(z => aws.unlockedSet.add(z)); }
        if (state.artisanZoneProductMap) { aws.zoneProductMap.clear(); Object.entries(state.artisanZoneProductMap).forEach(([k,v]) => aws.zoneProductMap.set(k,v)); }
        if (state.artisanStats)     { Object.entries(state.artisanStats).forEach(([k,s]) => { if (aws.productStats.has(k)) Object.assign(aws.productStats.get(k), s); }); }
        if (state.artisanInventory) { aws.productInventory.clear(); Object.entries(state.artisanInventory).forEach(([k,v]) => aws.productInventory.set(k,v)); }
      }
    }
    if (state.autoSellSet) {
      autoSellSet.clear();
      state.autoSellSet.forEach(id => autoSellSet.add(id));
    }
    if (state.unlockedZones) {
      unlockedZones.clear();
      state.unlockedZones.forEach(z => unlockedZones.add(z));
    }
    // Auto-assign defaults for any unlocked artisan zones with no assignment
    for (const zoneName of unlockedArtisanZones) assignDefaultArtisanProduct(zoneName);
    if (state.unlockedCrops) {
      unlockedCrops.clear();
      state.unlockedCrops.forEach(c => unlockedCrops.add(c));
    }
    if (state.zoneCrops) {
      zoneCrops.clear();
      state.zoneCrops.forEach(zc => {
        const cropType = CROPS[zc.cropId];
        if (cropType) {
          const instance = new CropInstance(cropType);
          instance.phase = zc.phase ?? 0;
          instance.timer = zc.timer ?? 0;
          zoneCrops.set(zc.zone, { instance, tileCount: zc.tileCount });
        }
      });
    }
    if (state.cropStats) {
      Object.entries(state.cropStats).forEach(([id, s]) => {
        if (cropStats.has(id)) Object.assign(cropStats.get(id), s);
      });
    }
    if (Array.isArray(state.criteriaCompletedEventIds)) {
      state.criteriaCompletedEventIds.forEach(i => { if (allEvents[i]) completedEventIds.add(allEvents[i]); });
    }
    if (state.schedule) schedulePanel.applyScheduleState(state.schedule);
    if (typeof state.zoom === 'number') camera.zoom = state.zoom;
    if (typeof state.gameSpeed === 'number') gameSpeed = state.gameSpeed;
    if (typeof state.autoPilot === 'boolean') autoPilot = state.autoPilot;
    draw(); drawMenuBar(); drawBottomBar();
    market.update(); realEstate.update(); stats.update(); manageFarm.update();
    eventsPanel.update(getActiveEvents(), getPastEvents(), cropInventory);
    settingsPanel.update();
  }

  // ── Auto-pilot system ────────────────────────────────────────────────────────────
  //
  // Decisions made every game tick when autoPilot === true:
  //   1. SELL ROUTING   — if a workshop is unlocked for a crop + artisan is
  //                       unlocked (sold ≥ threshold): hold raw, sell artisan.
  //                       Otherwise sell raw as normal.
  //   2. WORKSHOP ASSIGN — all unlocked artisan workshops point to the best
  //                        crop (highest effective GPS).
  //   3. CROP SWAP       — every farm zone grows the best available crop.
  //   4. AUTO-BUY        — whenever we can afford the cheapest locked upgrade
  //                        (farm zone or artisan workshop), buy it immediately.
  // ────────────────────────────────────────────────────────────

  /**
   * Effective gold earned per tile per second for a crop, accounting for the
   * artisan route if a workshop is active and the product is unlocked.
   */
  function cropEffectiveGPS(cropId) {
    const ct = CROPS[cropId];
    if (!ct) return 0;
    const cycleTime = (ct.growthPhaseGIDs.length - 1) * ct.growthTimePerPhase;
    if (cycleTime <= 0) return 0;
    const ap = ct.artisanProduct;
    if (ap) {
      const hasWorkshop = [...unlockedArtisanZones].some(zn => artisanZoneProductMap.get(zn) === cropId);
      if (hasWorkshop && (cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold) {
        // goldValue earned per cropInputCount crops consumed per cycleTime
        return (ap.goldValue / ap.cropInputCount) / cycleTime;
      }
    }
    return ct.yieldGold / cycleTime;
  }

  /** Returns the cropId with the highest effective GPS among actually-unlocked crops. */
  function bestUnlockedCropId() {
    const lifetimeGold = Array.from(cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
    let bestId = null, bestGPS = -1;
    for (const [id, ct] of Object.entries(CROPS)) {
      if (!ct.isUnlocked(cropStats, lifetimeGold)) continue;
      const gps = cropEffectiveGPS(id);
      if (gps > bestGPS) { bestGPS = gps; bestId = id; }
    }
    return bestId;
  }

  function runAutoPilot() {
    if (!autoPilot) return;

    const bestId = bestUnlockedCropId();
    let dirty = false;

    // 1. SELL ROUTING — set autoSellSet correctly for every crop
    // Crops whose raw form should be held (has active workshop + artisan unlocked)
    const holdRawSet = new Set();
    for (const zn of unlockedArtisanZones) {
      const cid = artisanZoneProductMap.get(zn);
      if (!cid) continue;
      const ap = CROPS[cid]?.artisanProduct;
      if (ap && (cropStats.get(cid)?.sold ?? 0) >= ap.unlockCropSold) holdRawSet.add(cid);
    }
    for (const cropId of Object.keys(CROPS)) {
      const ap   = CROPS[cropId]?.artisanProduct;
      const aKey = ap ? `${cropId}_artisan` : null;
      if (holdRawSet.has(cropId)) {
        if (autoSellSet.has(cropId))         { autoSellSet.delete(cropId);    dirty = true; }
        if (aKey && !autoSellSet.has(aKey))  { autoSellSet.add(aKey);         dirty = true; }
      } else {
        if (!autoSellSet.has(cropId))        { autoSellSet.add(cropId);       dirty = true; }
        if (aKey && autoSellSet.has(aKey))   { autoSellSet.delete(aKey);      dirty = true; }
      }
    }

    // 2. WORKSHOP ASSIGN — all workshops point to best crop
    if (bestId) {
      for (const zn of unlockedArtisanZones) {
        if (artisanZoneProductMap.get(zn) !== bestId) {
          artisanZoneProductMap.set(zn, bestId);
          dirty = true;
        }
      }
    }

    // 3. CROP SWAP — every farm zone grows best crop
    if (bestId) {
      for (const [zoneName, entry] of zoneCrops) {
        if (entry.instance.cropType.id !== bestId) {
          zoneCrops.set(zoneName, { instance: new CropInstance(CROPS[bestId]), tileCount: entry.tileCount });
          dirty = true;
        }
      }
    }

    // 4. AUTO-BUY — buy the cheapest available upgrade we can afford
    const candidates = [];
    cropZones.forEach(z => {
      if (!unlockedZones.has(z.name)) {
        const cost = zoneCostMap.get(z.name) ?? 0;
        if (cost > 0) candidates.push({ type: 'farm', zone: z, cost });
      }
    });
    for (const [, ws] of workState) {
      ws.zones.forEach(z => {
        if (!ws.unlockedSet.has(z.name)) {
          const cost = ws.costMap.get(z.name) ?? 0;
          if (cost > 0) candidates.push({ type: ws.act.key, zone: z, cost, ws });
        }
      });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    for (const c of candidates) {
      if (gold.amount >= c.cost) {
        if (!gold.spend(c.cost)) break;
        if (c.type === 'farm') {
          unlockedZones.add(c.zone.name);
          const cropToPlant = bestId ?? 'strawberry';
          const tc = Math.round(c.zone.width / 16) * Math.round((c.zone.height || 16) / 16);
          zoneCrops.set(c.zone.name, { instance: new CropInstance(CROPS[cropToPlant]), tileCount: tc });
        } else {
          c.ws.unlockedSet.add(c.zone.name);
          if (bestId) artisanZoneProductMap.set(c.zone.name, bestId);
          else assignDefaultArtisanProduct(c.zone.name);
        }
        dirty = true;
        realEstate.update();
        break; // one purchase per tick
      }
    }

    if (dirty) {
      draw(); drawMenuBar();
      manageFarm.update();
      market.update();
    }
  }

  const settingsTabIndex = bottomTabs.findIndex(t => t.full === 'Settings');
  const eventsTabIndex = bottomTabs.findIndex(t => t.full === 'Events');
  const settingsPanel = initSettingsPanel({
    getGameState,
    applyGameState,
    getZoom:        () => camera.zoom,
    setZoom:        (z) => { camera.zoom = z; draw(); },
    getSpeed:       () => gameSpeed,
    setSpeed:       (s) => { gameSpeed = s; },
    isPaused:       () => gamePaused,
    togglePause:    () => { gamePaused = !gamePaused; },
    getAutoPilot:   () => autoPilot,
    setAutoPilot:   (v) => { autoPilot = v; if (v) runAutoPilot(); },
  });
  document.body.appendChild(settingsPanel.panel);

  const eventsPanel = initEventsPanel();
  document.body.appendChild(eventsPanel.panel);

  const scheduleTabIndex = bottomTabs.findIndex(t => t.full === 'Schedule');
  const schedulePanel = initSchedulePanel({
    onScheduleChange: () => { /* future: update UI indicators */ },
  });
  document.body.appendChild(schedulePanel.panel);

  // ── Offline simulation ─────────────────────────────────────────────────────────────────────
  function simulateOffline(offlineRealSecs) {
    const MAX_SECS = 2 * 3600; // cap at 2 real hours
    const simSecs  = Math.min(Math.floor(offlineRealSecs), MAX_SECS);
    if (simSecs <= 0) return null;

    // Each real second = 4 game-ticks of gameSpeed units
    const DT = 4 * gameSpeed;
    const goldBefore   = gold.amount;
    const producedWork  = new Map();  // actKey → Map<productKey, count>
    const harvestedCrops = new Map(); // cropId → count
    // Per-activity tick accumulators (start from current timer values)
    const workAcc = new Map();
    for (const [key, ws] of workState) workAcc.set(key, ws.tickTimer);

    for (let t = 0; t < simSecs; t++) {
      calendarAccum += DT;
      while (calendarAccum >= DAY_REAL_SECS) {
        calendarAccum -= DAY_REAL_SECS;
        calendar.nextDay();
      }

      const farmingActive = schedulePanel.isFarmingTime(calendarAccum);

      if (farmingActive) {
        zoneCrops.forEach(({ instance, tileCount }) => {
          instance.tick(DT);
          if (instance.isFullyGrown) {
            const id = instance.cropType.id;
            const s  = cropStats.get(id);
            s.grown += tileCount;
            harvestedCrops.set(id, (harvestedCrops.get(id) || 0) + tileCount);
            if (autoSellSet.has(id)) {
              const earned = instance.cropType.yieldGold * tileCount;
              gold.add(earned);
              s.sold          += tileCount;
              s.lifetimeSales += earned;
            } else {
              cropInventory.set(id, (cropInventory.get(id) || 0) + tileCount);
            }
            instance.harvest();
          }
        });
      }

      // Zone-based work activity production (offline sim)
      // alwaysActive activities run every simulated second regardless of schedule.
      for (const [actKey, ws] of workState) {
        if (ws.act.alwaysActive || schedulePanel.isActivityTime(actKey, calendarAccum)) {
          let acc = (workAcc.get(actKey) || 0) + DT;
          while (acc >= ws.act.productionIntervalSecs) {
            acc -= ws.act.productionIntervalSecs;
            const ctx = {
              zoneProductMap: ws.zoneProductMap, cropInventory, cropStats,
              productStats: ws.productStats, productInventory: ws.productInventory,
              autoSellSet, gold, CROPS, gameSpeed: 1,
              productionIntervalSecs: ws.act.productionIntervalSecs,
            };
            ws.zones.filter(z => ws.unlockedSet.has(z.name)).forEach(zone => {
              const productKey = ws.act.produce(zone, ctx);
              if (productKey) {
                if (!producedWork.has(actKey)) producedWork.set(actKey, new Map());
                const pm = producedWork.get(actKey);
                pm.set(productKey, (pm.get(productKey) || 0) + 1);
              }
            });
          }
          workAcc.set(actKey, acc);
        } else {
          workAcc.set(actKey, 0);
        }
      }
    }

    // Sync tick timers back to workState
    for (const [key, ws] of workState) ws.tickTimer = workAcc.get(key) ?? 0;
    return { goldEarned: gold.amount - goldBefore, harvestedCrops, producedWork, secondsSimulated: simSecs, cappedAt: offlineRealSecs > MAX_SECS };
  }

  function showOfflineModal(result, offlineRealSecs) {
    const { goldEarned, harvestedCrops, producedWork, secondsSimulated, cappedAt } = result;
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      position:     'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
      background:   'rgba(0,0,0,0.72)',
      display:      'flex', alignItems: 'center', justifyContent: 'center',
      zIndex:       '999', fontFamily: 'sans-serif',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background:   '#111', border: '2px solid #ffd700', borderRadius: '10px',
      padding:      '20px 26px', maxWidth: '380px', width: '90vw', color: '#e8e8e8',
    });

    const title = document.createElement('div');
    title.textContent = 'Welcome back!';
    Object.assign(title.style, { font: 'bold 15px sans-serif', color: '#ffd700', marginBottom: '4px' });
    box.appendChild(title);

    const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
                   : s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
                   : `${s}s`;
    const sub = document.createElement('div');
    sub.textContent = cappedAt
      ? `Simulated ${fmt(secondsSimulated)} of progress (capped at 2 hours).`
      : `You were away for ${fmt(Math.floor(offlineRealSecs))}.`;
    Object.assign(sub.style, { font: '11px sans-serif', color: '#888', marginBottom: '14px' });
    box.appendChild(sub);

    const totalWorkProduced = Array.from(producedWork.values()).reduce((s, pm) => s + pm.size, 0);
    if (goldEarned > 0 || harvestedCrops.size > 0 || totalWorkProduced > 0) {
      const earned = document.createElement('div');
      Object.assign(earned.style, { font: 'bold 13px sans-serif', color: '#ffd700', marginBottom: '8px' });
      earned.textContent = `🪙 +${shortNumber(goldEarned)} gold earned`;
      box.appendChild(earned);

      if (harvestedCrops.size > 0) {
        const hdr = document.createElement('div');
        hdr.textContent = 'Crops harvested:';
        Object.assign(hdr.style, { font: 'bold 11px sans-serif', color: '#6dbd5a', marginBottom: '4px' });
        box.appendChild(hdr);
        harvestedCrops.forEach((count, id) => {
          const ct = CROPS[id];
          if (!ct) return;
          const row = document.createElement('div');
          row.textContent = `  ${ct.name}: ${shortNumber(count)}`;
          Object.assign(row.style, { font: '12px sans-serif', color: '#ccc', marginBottom: '2px' });
          box.appendChild(row);
        });
      }

      if (producedWork.size > 0) {
        for (const [actKey, productMap] of producedWork) {
          if (productMap.size === 0) continue;
          const actDesc = workState.get(actKey)?.act;
          const hdr = document.createElement('div');
          hdr.textContent = (actDesc?.displayName ?? actKey) + ' produced:';
          Object.assign(hdr.style, { font: 'bold 11px sans-serif', color: actDesc?.color ?? '#aaa', marginTop: '8px', marginBottom: '4px' });
          box.appendChild(hdr);
          productMap.forEach((count, productKey) => {
            const label = actDesc?.getProductLabel(productKey, CROPS) ?? productKey;
            const row = document.createElement('div');
            row.textContent = `  ${label}: ${shortNumber(count)}`;
            Object.assign(row.style, { font: '12px sans-serif', color: '#ccc', marginBottom: '2px' });
            box.appendChild(row);
          });
        }
      }
    } else {
      const none = document.createElement('div');
      none.textContent = 'Nothing to collect — crops needed to grow or artisan zones unassigned.';
      Object.assign(none.style, { font: '12px sans-serif', color: '#888' });
      box.appendChild(none);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Continue';
    Object.assign(btn.style, {
      marginTop: '16px', padding: '8px 28px',
      background: '#ffd700', color: '#111', border: 'none',
      borderRadius: '5px', font: 'bold 13px sans-serif', cursor: 'pointer',
    });
    btn.addEventListener('click', () => document.body.removeChild(modal));
    box.appendChild(btn);
    modal.appendChild(box);
    modal.addEventListener('click', e => { if (e.target === modal) document.body.removeChild(modal); });
    document.body.appendChild(modal);
  }

  // Load game state on startup
  const loadedState = loadGame();
  if (loadedState) {
    console.log('[Startup] Applying loaded save...');
    applyGameState(loadedState);
    console.log('[Startup] After apply — gold:', gold.amount, '| unlockedZones:', Array.from(unlockedZones));
    if (loadedState.savedAt) {
      const offlineRealSecs = (Date.now() - loadedState.savedAt) / 1000;
      if (offlineRealSecs > 5) {
        const result = simulateOffline(offlineRealSecs);
        if (result) showOfflineModal(result, offlineRealSecs);
      }
    }
  } else {
    console.log('[Startup] Starting fresh (no save data).');
  }

  // Auto-save every 10 seconds — only when state has changed
  let stateDirty = false;
  const markDirty = () => { stateDirty = true; };
  setInterval(() => {
    if (!stateDirty) return;
    stateDirty = false;
    saveGame(getGameState());
  }, 10000);

  // --- All declarations done. Now safe to call draw and set up listeners ---
  window.addEventListener('resize', () => { draw(); drawMenuBar(); drawBottomBar(); });
  window.addEventListener('orientationchange', () => { draw(); drawMenuBar(); drawBottomBar(); });

  draw();
  drawMenuBar();
  drawBottomBar();

  // Start main rAF render loop (handles smooth movement, animation, and all drawing)
  requestAnimationFrame(renderLoop);

  // Start calendar (sets _startTime + _onDayChange), then stop internal timer
  // so we can manage day advancement manually with game speed support.
  calendar.start(() => { drawMenuBar(); });
  calendar.stop();

  // Game tick: advance crop growth every second and redraw
  setInterval(() => {
    if (gamePaused) return;

    // Advance in-game time
    calendar.gameTimeMs += gameSpeed * 1000;

    // Calendar day advancement (DAY_REAL_SECS real-seconds per day � speed)
    calendarAccum += gameSpeed;
    if (calendarAccum >= DAY_REAL_SECS) {
      calendarAccum -= DAY_REAL_SECS;
      calendar.nextDay();
    }

    const farmingActive     = schedulePanel.isFarmingTime(calendarAccum);
    const socializingActive = schedulePanel.isSocializingTime(calendarAccum);
    const sleepingActive    = schedulePanel.isSleepingTime(calendarAccum);
    // Track current activity for the rAF animator (artisan is now passive background)
    currentActivity = sleepingActive ? 'sleeping'
      : socializingActive ? 'socializing'
      : farmingActive ? 'farming' : 'idle';

    // Accumulate time-spent hours for each activity
    const hoursPerTick = gameSpeed * 24 / DAY_REAL_SECS;
    if (socializingActive) totalSocializingHours += hoursPerTick;
    if (farmingActive)     totalFarmingHours     += hoursPerTick;
    if (sleepingActive)    totalSleepingHours    += hoursPerTick;


    // Sleeping state transitions
    if (sleepingActive && !isSleeping && sleepPendingTicks === 0) {
      // First tick of sleep: walk player to sleep tile.
      // Clear any queued waypoints so stale social/farm paths can't override the destination.
      sleepPendingTicks    = SLEEP_WALK_TICKS;
      player.waypoints     = [];
      player.targetX       = SLEEP_WORLD_X;
      player.targetY       = SLEEP_WORLD_Y;
    } else if (!isSleeping && sleepPendingTicks > 0) {
      if (!sleepingActive) {
        // Sleep window ended before countdown finished � cancel and wake immediately
        sleepPendingTicks = 0;
      } else {
        sleepPendingTicks--;
        if (sleepPendingTicks === 0) {
          // Countdown done: hide player and start sleep overlay
          isSleeping = true;
        }
      }
    } else if (!sleepingActive && isSleeping) {
      isSleeping = false;
      sleepPendingTicks    = 0;
      _lastSocialPathIndex = -1; // force path recalculation on next socialize window
      // Immediately return player to their current farm zone
      const wakeList = getUnlockedZoneList();
      if (wakeList.length > 0) {
        zoneTravelIndex = zoneTravelIndex % wakeList.length;
        movePlayerToZone(wakeList[zoneTravelIndex]);
      }
      zoneTravelTimer = 0;
    }

    zoneCrops.forEach(({ instance, tileCount }) => {
      if (farmingActive) instance.tick(gameSpeed);
      if (instance.isFullyGrown) {
        const id = instance.cropType.id;
        const s  = cropStats.get(id);
        s.grown += tileCount;
        if (autoSellSet.has(id)) {
          const earned = instance.cropType.yieldGold * tileCount;
          gold.add(earned);
          s.sold         += tileCount;
          s.lifetimeSales += earned;
        } else {
          cropInventory.set(id, (cropInventory.get(id) || 0) + tileCount);
        }
        instance.harvest();
        if (activeTab === marketTabIndex)     market.update();
        if (activeTab === realEstateTabIndex) realEstate.update();
      }
    });
    stats.update(); // Always update stats panel

    // Auto-pilot: automated crop/buy/sell decisions
    runAutoPilot();

    // Zone-based work activity production (artisan + future activities)
    // alwaysActive activities run every tick regardless of schedule.
    let workProduced = false;
    for (const [actKey, ws] of workState) {
      if (ws.act.alwaysActive || schedulePanel.isActivityTime(actKey, calendarAccum)) {
        ws.tickTimer += gameSpeed;
        if (ws.tickTimer >= ws.act.productionIntervalSecs) {
          ws.tickTimer -= ws.act.productionIntervalSecs;
          const ctx = buildProductionCtx(ws);
          ws.zones.filter(z => ws.unlockedSet.has(z.name)).forEach(zone => {
            if (ws.act.produce(zone, ctx)) workProduced = true;
          });
        }
      } else {
        ws.tickTimer = 0;
      }
    }
    if (workProduced && activeTab === marketTabIndex) market.update();
    if (!isSleeping && sleepPendingTicks === 0) {
      if (socializingActive) {
        if (!_wasSocializing) {
          // Just entered socializing block � reset timer so player gets a full hour at current point
          socialTravelTimer = 0;
        }
        updatePlayerSocialTravel(gameSpeed);
      } else if (farmingActive) {
        updatePlayerZoneTravel(gameSpeed);
      }
    }
    _wasSocializing = socializingActive;
    markDirty(); // state changed this tick
    // Rendering is handled by the rAF renderLoop — no draw() call here
  }, 250);
}

main();

window.getTotalSocializingHours = () => typeof totalSocializingHours !== 'undefined' ? totalSocializingHours : 0;
window.getTotalFarmingHours     = () => typeof totalFarmingHours     !== 'undefined' ? totalFarmingHours     : 0;
window.getTotalSleepingHours    = () => typeof totalSleepingHours    !== 'undefined' ? totalSleepingHours    : 0;
window.getTotalArtisanHours     = () => typeof totalArtisanHours     !== 'undefined' ? totalArtisanHours     : 0;