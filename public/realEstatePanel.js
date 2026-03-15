import { BOTTOM_BAR_HEIGHT } from './constants.js';
// realEstatePanel.js - Real Estate tab: buy new farm zones

/**
 * Builds and manages the Real Estate panel DOM.
 *
 * @param {object}              opts
 * @param {object[]}            opts.cropZones      - All zones from the Tiled map (sorted)
 * @param {Set<string>}         opts.unlockedZones  - Shared set of unlocked zone names
 * @param {Gold}                opts.gold           - Shared Gold instance
 * @param {Map}                 opts.zoneCrops      - Shared zoneCrops map
 * @param {object}              opts.CROPS          - CROPS dict from crops.js
 * @param {Function}            opts.CropInstance   - CropInstance constructor
 * @param {Function}            opts.onPurchase     - Called after a zone is bought (triggers redraw)
 * @returns {{ show: Function, hide: Function, update: Function }}
 */
export function initRealEstatePanel({
  cropZones, unlockedZones, gold, zoneCrops, CROPS, CropInstance, getIncomePerSecond, zoneCostMap,
  artisanZones, unlockedArtisanZones, artisanZoneCostMap, onPurchase
}) {
  const TILESIZE = 16;

  function shortNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'k';
    return n.toLocaleString();
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return '∞';
    seconds = Math.ceil(seconds);
    if (seconds < 60)  return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }

  // Cost formula: same as the locked overlay in the game
  function zoneCost(zone) {
    // zoneCostMap is already resolved from Tiled props, overrides, or defaults
    return zoneCostMap.get(zone.name) ?? 0;
  }

  // ── Panel container ──────────────────────────────────────────────────────
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position:   'fixed',
    bottom:     BOTTOM_BAR_HEIGHT + 'px',
    left:       '0',
    width:      '100vw',
    boxSizing:  'border-box',
    background: 'rgba(14, 14, 14, 0.97)',
    borderTop:  '2px solid #ffd700',
    zIndex:     '20',
    overflowY:  'auto',
    maxHeight:  'calc(100vh - 96px)',
    display:    'none',
    fontFamily: 'sans-serif',
  });

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding:       '6px 14px',
    font:          'bold 12px sans-serif',
    color:         '#ffd700',
    borderBottom:  '1px solid rgba(255,215,0,0.25)',
    letterSpacing: '1.5px',
    display:       'flex',
    alignItems:    'center',
    gap:           '12px',
  });
  const title = document.createElement('span');
  title.textContent = 'REAL ESTATE';
  header.appendChild(title);
  // Autobuy Cheapest button
  const autobuyBtn = document.createElement('button');
  autobuyBtn.textContent = 'Autobuy Cheapest';
  Object.assign(autobuyBtn.style, {
    background:   '#2a2a2a',
    color:        '#ffd700',
    border:       '1px solid #ffd700',
    borderRadius: '4px',
    padding:      '2px 10px',
    font:         'bold 11px sans-serif',
    cursor:       'pointer',
    marginLeft:   'auto',
    opacity:      '0.85',
  });
  let autobuyActive = false;
  let autobuyInterval = null;
  autobuyBtn.addEventListener('click', () => {
    autobuyActive = !autobuyActive;
    autobuyBtn.style.background = autobuyActive ? '#4a9a2b' : '#2a2a2a';
    if (autobuyActive) {
      autobuyBtn.textContent = 'Autobuy: ON';
      autobuyInterval = setInterval(() => {
        // Find the cheapest locked zone
        const lockedZones = cropZones.filter(z => !unlockedZones.has(z.name));
        if (lockedZones.length === 0) return;
        lockedZones.sort((a, b) => (zoneCostMap.get(a.name) ?? 0) - (zoneCostMap.get(b.name) ?? 0));
        const cheapest = lockedZones[0];
        const cost = zoneCostMap.get(cheapest.name) ?? 0;
        if (gold.amount >= cost) {
          if (!gold.spend(cost)) return;
          unlockedZones.add(cheapest.name);
          const tc = Math.round(cheapest.width / TILESIZE) * Math.round(cheapest.height / TILESIZE);
          zoneCrops.set(cheapest.name, { instance: new CropInstance(CROPS.strawberry), tileCount: tc });
          update();
          onPurchase();
        }
      }, 500);
    } else {
      autobuyBtn.textContent = 'Autobuy Cheapest';
      if (autobuyInterval) clearInterval(autobuyInterval);
      autobuyInterval = null;
    }
  });

  // Sort by Cost button
  const sortBtn = document.createElement('button');
  sortBtn.textContent = 'Sort by Cost';
  Object.assign(sortBtn.style, {
    background:   '#2a2a2a',
    color:        '#ffd700',
    border:       '1px solid #ffd700',
    borderRadius: '4px',
    padding:      '2px 10px',
    font:         'bold 11px sans-serif',
    cursor:       'pointer',
    marginLeft:   '8px',
    opacity:      '0.85',
  });
  let sortAsc = true;
  sortBtn.addEventListener('click', () => {
    sortAsc = !sortAsc;
    cropZones.sort((a, b) => {
      const costA = zoneCostMap.get(a.name) ?? 0;
      const costB = zoneCostMap.get(b.name) ?? 0;
      return sortAsc ? costA - costB : costB - costA;
    });
    // Remove all rows and re-add in sorted order
    rowRefs.length = 0;
    while (panel.children.length > 1) panel.removeChild(panel.lastChild);
    cropZones.forEach((zone, i) => {
      const tileCount = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
      let cost = zoneCost(zone);
      const row = document.createElement('div');
      Object.assign(row.style, {
        display:      'flex',
        alignItems:   'center',
        padding:      '7px 14px',
        gap:          '12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      });
      const swatch = document.createElement('div');
      Object.assign(swatch.style, {
        width:       '18px',
        height:      '18px',
        borderRadius:'3px',
        background:  '#3d7a25',
        border:      '1px solid #4a9a2b',
        flexShrink:  '0',
      });
      row.appendChild(swatch);
      const info = document.createElement('div');
      Object.assign(info.style, {
        display:   'flex',
        flexDirection: 'column',
        minWidth:  '110px',
        flexShrink:'0',
      });
      const nameEl = document.createElement('span');
      const zoneNumMatch = zone.name.match(/FarmZone(\d+)/);
      const friendlyName = zoneNumMatch ? `Zone ${parseInt(zoneNumMatch[1], 10)}` : zone.name;
      nameEl.textContent = friendlyName;
      Object.assign(nameEl.style, { color: '#e8e8e8', font: 'bold 13px sans-serif' });
      const plotEl = document.createElement('span');
      plotEl.textContent = `${tileCount} plots`;
      Object.assign(plotEl.style, { color: '#888', font: '11px sans-serif' });
      info.appendChild(nameEl);
      info.appendChild(plotEl);
      row.appendChild(info);
      const spacer = document.createElement('div');
      spacer.style.flex = '1';
      row.appendChild(spacer);
      const costEl = document.createElement('span');
      Object.assign(costEl.style, {
        color:      '#ffd700',
        font:       'bold 13px sans-serif',
        flexShrink: '0',
      });
      row.appendChild(costEl);
      const actionEl = document.createElement('div');
      Object.assign(actionEl.style, {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        flexShrink: '0',
        minWidth:   '140px',
        justifyContent: 'flex-end',
      });
      row.appendChild(actionEl);
      panel.appendChild(row);
      rowRefs.push({ zone, index: i, tileCount, cost, costEl, actionEl, rowEl: row });
    });
    update();
  });
  header.appendChild(autobuyBtn);
  header.appendChild(sortBtn);
  panel.appendChild(header);

  // ── Zone rows ─────────────────────────────────────────────────────────────
  const rowRefs = []; // [{ statusEl, actionEl, buyBtn | null }]

  cropZones.forEach((zone, i) => {
    const tileCount = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
    // Cost will be recalculated in update()
    let cost = zoneCost(zone);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'flex',
      alignItems:   'center',
      padding:      '7px 14px',
      gap:          '12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    });

    // Zone colour swatch
    const swatch = document.createElement('div');
    Object.assign(swatch.style, {
      width:       '18px',
      height:      '18px',
      borderRadius:'3px',
      background:  '#3d7a25',
      border:      '1px solid #4a9a2b',
      flexShrink:  '0',
    });
    row.appendChild(swatch);

    // Name + plot count
    const info = document.createElement('div');
    Object.assign(info.style, {
      display:   'flex',
      flexDirection: 'column',
      minWidth:  '110px',
      flexShrink:'0',
    });
    const nameEl = document.createElement('span');
    // Friendly zone name: Zone N
    const zoneNumMatch = zone.name.match(/FarmZone(\d+)/);
    const friendlyName = zoneNumMatch ? `Zone ${parseInt(zoneNumMatch[1], 10)}` : zone.name;
    nameEl.textContent = friendlyName;
    Object.assign(nameEl.style, { color: '#e8e8e8', font: 'bold 13px sans-serif' });
    const plotEl = document.createElement('span');
    plotEl.textContent = `${tileCount} plots`;
    Object.assign(plotEl.style, { color: '#888', font: '11px sans-serif' });
    info.appendChild(nameEl);
    info.appendChild(plotEl);
    row.appendChild(info);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    row.appendChild(spacer);

    // Cost label
    const costEl = document.createElement('span');
    Object.assign(costEl.style, {
      color:      '#ffd700',
      font:       'bold 13px sans-serif',
      flexShrink: '0',
    });
    row.appendChild(costEl);

    // Status / action area
    const actionEl = document.createElement('div');
    Object.assign(actionEl.style, {
      display:    'flex',
      alignItems: 'center',
      gap:        '6px',
      flexShrink: '0',
      minWidth:   '140px',
      justifyContent: 'flex-end',
    });
    row.appendChild(actionEl);

    panel.appendChild(row);
    rowRefs.push({ zone, index: i, tileCount, cost, costEl, actionEl, rowEl: row });
  });

  document.body.appendChild(panel);

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderRow({ zone, index, tileCount, cost, costEl, actionEl, rowEl }) {
    const owned = unlockedZones.has(zone.name);
    actionEl.innerHTML = '';

    if (owned) {
      rowEl.style.display = 'none';
      return;
    }

    rowEl.style.display = 'flex';

    const have       = gold.amount;
    const canAfford  = have >= cost;
    const shortfall  = cost - have;

    // Cost display
    costEl.textContent = `🪙 ${shortNumber(cost)}`;

    if (!canAfford) {
      const ips       = getIncomePerSecond();
      const secsNeeded = ips > 0 ? shortfall / ips : Infinity;

      const needEl = document.createElement('div');
      Object.assign(needEl.style, {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        gap:           '1px',
      });

      const needText = document.createElement('span');
      needText.textContent = `Need ${shortNumber(shortfall)} more`;
      Object.assign(needText.style, { color: '#e05555', font: '11px sans-serif' });

      const timeText = document.createElement('span');
      timeText.textContent = ips > 0 ? `~${formatTime(secsNeeded)}` : 'No income yet';
      Object.assign(timeText.style, { color: '#aaa', font: '10px sans-serif' });

      needEl.appendChild(needText);
      needEl.appendChild(timeText);
      actionEl.appendChild(needEl);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Buy';
    Object.assign(btn.style, {
      background:   canAfford ? '#6b4d00' : '#2a2a2a',
      color:        canAfford ? '#ffd700' : '#555',
      border:       `1px solid ${canAfford ? '#ffd700' : '#444'}`,
      borderRadius: '4px',
      padding:      '4px 14px',
      font:         'bold 12px sans-serif',
      cursor:       canAfford ? 'pointer' : 'not-allowed',
      opacity:      canAfford ? '1' : '0.6',
    });

    if (canAfford) {
      btn.addEventListener('click', () => {
        if (!gold.spend(cost)) return;
        unlockedZones.add(zone.name);
        // Auto-plant the default crop (strawberry) in the new zone
        const tc = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
        zoneCrops.set(zone.name, { instance: new CropInstance(CROPS.strawberry), tileCount: tc });
        update();
        onPurchase();
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = '#8a6500'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#6b4d00'; });
    }

    actionEl.appendChild(btn);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function update() {
    // Remove all rows except header
    while (panel.children.length > 1) panel.removeChild(panel.lastChild);
    rowRefs.length = 0;
    // Filter cropZones for display
    const displayZones = cropZones;
    displayZones.forEach((zone, i) => {
      const tileCount = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
      let cost = zoneCost(zone);
      const row = document.createElement('div');
      Object.assign(row.style, {
        display:      'flex',
        alignItems:   'center',
        padding:      '7px 14px',
        gap:          '12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      });
      const swatch = document.createElement('div');
      Object.assign(swatch.style, {
        width:       '18px',
        height:      '18px',
        borderRadius:'3px',
        background:  '#3d7a25',
        border:      '1px solid #4a9a2b',
        flexShrink:  '0',
      });
      row.appendChild(swatch);
      const info = document.createElement('div');
      Object.assign(info.style, {
        display:   'flex',
        flexDirection: 'column',
        minWidth:  '110px',
        flexShrink:'0',
      });
      const nameEl = document.createElement('span');
      const zoneNumMatch = zone.name.match(/FarmZone(\d+)/);
      const friendlyName = zoneNumMatch ? `Zone ${parseInt(zoneNumMatch[1], 10)}` : zone.name;
      nameEl.textContent = friendlyName;
      Object.assign(nameEl.style, { color: '#e8e8e8', font: 'bold 13px sans-serif' });
      const plotEl = document.createElement('span');
      plotEl.textContent = `${tileCount} plots`;
      Object.assign(plotEl.style, { color: '#888', font: '11px sans-serif' });
      info.appendChild(nameEl);
      info.appendChild(plotEl);
      row.appendChild(info);
      const spacer = document.createElement('div');
      spacer.style.flex = '1';
      row.appendChild(spacer);
      const costEl = document.createElement('span');
      Object.assign(costEl.style, {
        color:      '#ffd700',
        font:       'bold 13px sans-serif',
        flexShrink: '0',
      });
      row.appendChild(costEl);
      const actionEl = document.createElement('div');
      Object.assign(actionEl.style, {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        flexShrink: '0',
        minWidth:   '140px',
        justifyContent: 'flex-end',
      });
      row.appendChild(actionEl);
      panel.appendChild(row);
      const ref = { zone, index: i, tileCount, cost, costEl, actionEl, rowEl: row };
      rowRefs.push(ref);
      renderRow(ref);
    });

    // ── Artisan Workshops section ───────────────────────────────────────────
    if (artisanZones && artisanZones.length > 0) {
      const artisanSecHeader = document.createElement('div');
      Object.assign(artisanSecHeader.style, {
        padding:       '6px 14px',
        font:          'bold 12px sans-serif',
        color:         '#c47a3a',
        borderBottom:  '1px solid rgba(196,122,58,0.4)',
        borderTop:     '1px solid rgba(196,122,58,0.3)',
        letterSpacing: '1.5px',
        marginTop:     '4px',
      });
      artisanSecHeader.textContent = 'ARTISAN WORKSHOPS';
      panel.appendChild(artisanSecHeader);

      artisanZones.forEach((zone, i) => {
        const cost = artisanZoneCostMap ? (artisanZoneCostMap.get(zone.name) ?? 25000) : 25000;
        const owned = unlockedArtisanZones && unlockedArtisanZones.has(zone.name);
        if (owned) return; // hide already-bought workshops

        const row = document.createElement('div');
        Object.assign(row.style, {
          display:      'flex',
          alignItems:   'center',
          padding:      '7px 14px',
          gap:          '12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        });

        const swatch = document.createElement('div');
        Object.assign(swatch.style, {
          width: '18px', height: '18px', borderRadius: '3px',
          background: '#7a4e22', border: '1px solid #c47a3a', flexShrink: '0',
        });
        row.appendChild(swatch);

        const info = document.createElement('div');
        Object.assign(info.style, { display: 'flex', flexDirection: 'column', minWidth: '110px', flexShrink: '0' });
        const nameEl = document.createElement('span');
        nameEl.textContent = `Workbench ${i + 1}`;
        Object.assign(nameEl.style, { color: '#e8c89a', font: 'bold 13px sans-serif' });
        const subEl = document.createElement('span');
        subEl.textContent = 'Artisan station';
        Object.assign(subEl.style, { color: '#888', font: '11px sans-serif' });
        info.appendChild(nameEl);
        info.appendChild(subEl);
        row.appendChild(info);

        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        row.appendChild(spacer);

        const costEl = document.createElement('span');
        costEl.textContent = `🪙 ${shortNumber(cost)}`;
        Object.assign(costEl.style, { color: '#ffd700', font: 'bold 13px sans-serif', flexShrink: '0' });
        row.appendChild(costEl);

        const actionEl = document.createElement('div');
        Object.assign(actionEl.style, {
          display: 'flex', alignItems: 'center', gap: '6px',
          flexShrink: '0', minWidth: '140px', justifyContent: 'flex-end',
        });

        const have = gold.amount;
        const canAfford = have >= cost;
        if (!canAfford) {
          const shortfall = cost - have;
          const ips = getIncomePerSecond();
          const secsNeeded = ips > 0 ? shortfall / ips : Infinity;
          const needEl = document.createElement('div');
          Object.assign(needEl.style, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' });
          const needText = document.createElement('span');
          needText.textContent = `Need ${shortNumber(shortfall)} more`;
          Object.assign(needText.style, { color: '#e05555', font: '11px sans-serif' });
          const timeText = document.createElement('span');
          timeText.textContent = ips > 0 ? `~${formatTime(secsNeeded)}` : 'No income yet';
          Object.assign(timeText.style, { color: '#aaa', font: '10px sans-serif' });
          needEl.appendChild(needText);
          needEl.appendChild(timeText);
          actionEl.appendChild(needEl);
        }

        const btn = document.createElement('button');
        btn.textContent = 'Buy';
        Object.assign(btn.style, {
          background:   canAfford ? '#6b4d00' : '#2a2a2a',
          color:        canAfford ? '#ffd700' : '#555',
          border:       `1px solid ${canAfford ? '#ffd700' : '#444'}`,
          borderRadius: '4px', padding: '4px 14px',
          font:         'bold 12px sans-serif',
          cursor:       canAfford ? 'pointer' : 'not-allowed',
          opacity:      canAfford ? '1' : '0.6',
        });
        if (canAfford) {
          btn.addEventListener('click', () => {
            if (!gold.spend(cost)) return;
            unlockedArtisanZones.add(zone.name);
            update();
            onPurchase();
          });
          btn.addEventListener('mouseenter', () => { btn.style.background = '#8a6500'; });
          btn.addEventListener('mouseleave', () => { btn.style.background = '#6b4d00'; });
        }
        actionEl.appendChild(btn);
        row.appendChild(actionEl);
        panel.appendChild(row);
      });
    }
  }

  return {
    show()   { panel.style.display = 'block'; update(); },
    hide()   { panel.style.display = 'none'; },
    update,
  };
}
