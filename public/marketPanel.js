import { BOTTOM_BAR_HEIGHT } from './constants.js';
// marketPanel.js - Market tab UI panel

const TILESIZE = 16;
const TILESET_COLS = 125;

function gidCoords(gid) {
  const id = gid - 1;
  return { sx: (id % TILESET_COLS) * TILESIZE, sy: Math.floor(id / TILESET_COLS) * TILESIZE };
}

/**
 * Builds and manages the Market panel DOM.
 *
 * @param {object}                  opts
 * @param {HTMLImageElement}        opts.tilesetImage
 * @param {object}                  opts.CROPS          - CROPS dict from crops.js
 * @param {Map<string,number>}      opts.cropInventory  - cropId → count (shared reference)
 * @param {Map<string,number>}      opts.artisanInventory - artisanKey → count (shared reference)
 * @param {Set<string>}             opts.autoSellSet    - cropIds / artisanKeys with auto-sell on (shared reference)
 * @param {Gold}                    opts.gold           - Gold instance
 * @returns {{ show: Function, hide: Function, update: Function }}
 */
export function initMarketPanel({ tilesetImage, CROPS, cropInventory, artisanInventory, autoSellSet, gold, cropStats }) {

  // ── Panel container ──────────────────────────────────────────────────────
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position:    'fixed',
    bottom:     BOTTOM_BAR_HEIGHT + 'px',
    left:        '0',
    width:       '100vw',
    boxSizing:   'border-box',
    background:  'rgba(14, 14, 14, 0.97)',
    borderTop:   '2px solid #ffd700',
    zIndex:      '20',
    overflowY:   'auto',
    maxHeight:   'calc(100vh - 96px)',
    display:     'none',
    fontFamily:  'sans-serif',
  });

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding:        '6px 14px',
    display:        'flex',
    alignItems:     'center',
    gap:            '14px',
    borderBottom:   '1px solid rgba(255,215,0,0.25)',
  });

  const headerTitle = document.createElement('span');
  Object.assign(headerTitle.style, {
    font:          'bold 12px sans-serif',
    color:         '#ffd700',
    letterSpacing: '1.5px',
    flex:          '0 0 auto',
  });
  headerTitle.textContent = 'MARKET';
  header.appendChild(headerTitle);

  // Sell-All toggle
  const sellAllBtn = document.createElement('button');
  function updateSellAllBtn() {
    const allOn = Object.keys(CROPS).every(id => autoSellSet.has(id));
    sellAllBtn.textContent = allOn ? '⏹ Disable All Auto-Sell' : '▶ Enable All Auto-Sell';
    Object.assign(sellAllBtn.style, {
      background:    allOn ? '#6b4d00' : '#2a2a2a',
      color:         allOn ? '#ffd700' : '#aaa',
      border:        `1px solid ${allOn ? '#ffd700' : '#555'}`,
      borderRadius:  '4px',
      padding:       '3px 10px',
      font:          'bold 11px sans-serif',
      cursor:        'pointer',
      flexShrink:    '0',
    });
  }
  sellAllBtn.addEventListener('click', () => {
    const allOn = Object.keys(CROPS).every(id => autoSellSet.has(id));
    Object.keys(CROPS).forEach(id => {
      if (allOn) autoSellSet.delete(id);
      else autoSellSet.add(id);
    });
    // Refresh each row's auto-sell button
    Object.entries(rowRefs).forEach(([cropId, refs]) => {
      applyAutoSellStyle(refs.autoSellBtn, autoSellSet.has(cropId));
    });
    updateSellAllBtn();
  });
  updateSellAllBtn();
  header.appendChild(sellAllBtn);

  panel.appendChild(header);

  // ── Per-crop rows ─────────────────────────────────────────────────────────
  const rowRefs = {}; // cropId → { countEl, autoSellBtn, sellBtns[] }

  Object.values(CROPS).forEach(cropType => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'flex',
      alignItems:   'center',
      padding:      '6px 14px',
      gap:          '10px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    });

    // Icon
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width  = 24;
    iconCanvas.height = 24;
    Object.assign(iconCanvas.style, {
      width:           '24px',
      height:          '24px',
      imageRendering:  'pixelated',
      flexShrink:      '0',
    });
    const ictx = iconCanvas.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    const { sx, sy } = gidCoords(cropType.marketIconGID);
    ictx.drawImage(tilesetImage, sx, sy, TILESIZE, TILESIZE, 0, 0, 24, 24);
    row.appendChild(iconCanvas);

    // Name
    const nameEl = document.createElement('span');
    nameEl.textContent = cropType.name;
    Object.assign(nameEl.style, {
      color:      '#e8e8e8',
      font:       'bold 13px sans-serif',
      minWidth:   '90px',
      flexShrink: '0',
    });
    row.appendChild(nameEl);

    // Inventory count
    const countEl = document.createElement('span');
    countEl.textContent = 'x 0';
    Object.assign(countEl.style, {
      color:      '#aaa',
      font:       '12px sans-serif',
      minWidth:   '42px',
      flexShrink: '0',
    });
    row.appendChild(countEl);

    // Sell buttons
    const sellGroup = document.createElement('div');
    Object.assign(sellGroup.style, { display: 'flex', gap: '4px', flex: '1', flexWrap: 'wrap' });

    const sellBtns = [];
    [1, 5, 25, 'All'].forEach(amount => {
      const btn = document.createElement('button');
      btn.textContent = `Sell ${amount}`;
      applyBtnStyle(btn, 'sell');
      btn.addEventListener('click', () => {
        const have = cropInventory.get(cropType.id) || 0;
        const qty  = amount === 'All' ? have : Math.min(amount, have);
        if (qty <= 0) return;
        cropInventory.set(cropType.id, have - qty);
        const earned = qty * cropType.yieldGold;
        gold.add(earned);
        if (cropStats) {
          const s = cropStats.get(cropType.id);
          if (s) { s.sold += qty; s.lifetimeSales += earned; }
        }
        refreshRow(cropType.id);
      });
      sellGroup.appendChild(btn);
      sellBtns.push(btn);
    });
    row.appendChild(sellGroup);

    // Auto-sell toggle
    const autoSellBtn = document.createElement('button');
    applyAutoSellStyle(autoSellBtn, autoSellSet.has(cropType.id));
    autoSellBtn.addEventListener('click', () => {
      if (autoSellSet.has(cropType.id)) autoSellSet.delete(cropType.id);
      else autoSellSet.add(cropType.id);
      applyAutoSellStyle(autoSellBtn, autoSellSet.has(cropType.id));
      updateSellAllBtn();
    });
    row.appendChild(autoSellBtn);

    panel.appendChild(row);
    rowRefs[cropType.id] = { countEl, sellBtns, autoSellBtn };
  });

  // ── Artisan Goods section ───────────────────────────────────────────
  const artisanHeader = document.createElement('div');
  Object.assign(artisanHeader.style, {
    padding:        '6px 14px',
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    borderBottom:   '1px solid rgba(196,122,58,0.4)',
    borderTop:      '1px solid rgba(196,122,58,0.3)',
    marginTop:      '4px',
  });
  const artisanTitle = document.createElement('span');
  Object.assign(artisanTitle.style, {
    font:          'bold 12px sans-serif',
    color:         '#c47a3a',
    letterSpacing: '1.5px',
  });
  artisanTitle.textContent = 'ARTISAN GOODS';
  const artisanSubtitle = document.createElement('span');
  Object.assign(artisanSubtitle.style, { font: '11px sans-serif', color: '#666' });
  artisanSubtitle.textContent = 'Crafted during Artisan hours (sell 10,000 of a crop to unlock)';
  artisanHeader.appendChild(artisanTitle);
  artisanHeader.appendChild(artisanSubtitle);
  panel.appendChild(artisanHeader);

  const artisanRowRefs = {}; // cropId → { countEl, sellBtns[] }

  Object.values(CROPS).forEach(cropType => {
    const ap = cropType.artisanProduct;
    if (!ap) return;
    const artisanKey = `${cropType.id}_artisan`;

    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'flex',
      alignItems:   'center',
      padding:      '6px 14px',
      gap:          '10px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      opacity:      '0.4', // dimmed until unlocked
    });

    // Icon (same GID as crop for now)
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 24; iconCanvas.height = 24;
    Object.assign(iconCanvas.style, { width: '24px', height: '24px', imageRendering: 'pixelated', flexShrink: '0' });
    const ictx = iconCanvas.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    const { sx, sy } = gidCoords(ap.iconGID);
    ictx.drawImage(tilesetImage, sx, sy, TILESIZE, TILESIZE, 0, 0, 24, 24);
    row.appendChild(iconCanvas);

    // Name
    const nameEl = document.createElement('span');
    nameEl.textContent = ap.name;
    Object.assign(nameEl.style, { color: '#e8c89a', font: 'bold 13px sans-serif', minWidth: '140px', flexShrink: '0' });
    row.appendChild(nameEl);

    // Inventory count
    const countEl = document.createElement('span');
    countEl.textContent = 'x 0';
    Object.assign(countEl.style, { color: '#aaa', font: '12px sans-serif', minWidth: '42px', flexShrink: '0' });
    row.appendChild(countEl);

    // Sell buttons
    const sellGroup = document.createElement('div');
    Object.assign(sellGroup.style, { display: 'flex', gap: '4px', flex: '1', flexWrap: 'wrap' });
    const sellBtns = [];
    [1, 5, 25, 'All'].forEach(amount => {
      const btn = document.createElement('button');
      btn.textContent = `Sell ${amount}`;
      applyArtisanBtnStyle(btn);
      btn.addEventListener('click', () => {
        const have = artisanInventory ? (artisanInventory.get(artisanKey) || 0) : 0;
        const qty  = amount === 'All' ? have : Math.min(amount, have);
        if (qty <= 0) return;
        artisanInventory.set(artisanKey, have - qty);
        gold.add(qty * ap.goldValue);
        refreshArtisanRow(cropType.id);
      });
      sellGroup.appendChild(btn);
      sellBtns.push(btn);
    });
    row.appendChild(sellGroup);

    // Auto-sell toggle
    const autoSellBtn = document.createElement('button');
    applyAutoSellStyle(autoSellBtn, autoSellSet.has(artisanKey));
    autoSellBtn.addEventListener('click', () => {
      if (autoSellSet.has(artisanKey)) autoSellSet.delete(artisanKey);
      else autoSellSet.add(artisanKey);
      applyAutoSellStyle(autoSellBtn, autoSellSet.has(artisanKey));
    });
    row.appendChild(autoSellBtn);

    panel.appendChild(row);
    artisanRowRefs[cropType.id] = { countEl, sellBtns, autoSellBtn, row };
  });

  document.body.appendChild(panel);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function applyBtnStyle(btn, _type) {
    Object.assign(btn.style, {
      background:   '#2d5a1b',
      color:        '#fff',
      border:       '1px solid #4a9a2b',
      borderRadius: '4px',
      padding:      '3px 8px',
      font:         'bold 11px sans-serif',
      cursor:       'pointer',
      flexShrink:   '0',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#3d7a25'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#2d5a1b'; });
  }

  function applyArtisanBtnStyle(btn) {
    Object.assign(btn.style, {
      background:   '#5a3a1b',
      color:        '#fff',
      border:       '1px solid #c47a3a',
      borderRadius: '4px',
      padding:      '3px 8px',
      font:         'bold 11px sans-serif',
      cursor:       'pointer',
      flexShrink:   '0',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#7a4e22'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#5a3a1b'; });
  }

  function applyAutoSellStyle(btn, on) {
    btn.textContent = 'Auto-Sell';
    Object.assign(btn.style, {
      background:   on ? '#6b4d00' : '#2a2a2a',
      color:        on ? '#ffd700' : '#777',
      border:       `1px solid ${on ? '#ffd700' : '#444'}`,
      borderRadius: '4px',
      padding:      '3px 8px',
      font:         'bold 11px sans-serif',
      cursor:       'pointer',
      flexShrink:   '0',
    });
  }

  function refreshRow(cropId) {
    const refs = rowRefs[cropId];
    if (!refs) return;
    const count = cropInventory.get(cropId) || 0;
    refs.countEl.textContent = `x ${count}`;
    refs.sellBtns.forEach(b => { b.style.opacity = count > 0 ? '1' : '0.4'; });
  }

  function refreshArtisanRow(cropId) {
    const refs = artisanRowRefs[cropId];
    if (!refs) return;
    const cropType = CROPS[cropId];
    const ap = cropType && cropType.artisanProduct;
    if (!ap) return;
    const artisanKey = `${cropId}_artisan`;
    const unlocked = (cropStats && cropStats.get(cropId) && cropStats.get(cropId).sold >= ap.unlockCropSold);
    refs.row.style.opacity = unlocked ? '1' : '0.4';
    const count = artisanInventory ? (artisanInventory.get(artisanKey) || 0) : 0;
    refs.countEl.textContent = `x ${count}`;
    refs.sellBtns.forEach(b => { b.style.opacity = (unlocked && count > 0) ? '1' : '0.4'; });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    show()   { panel.style.display = 'block'; this.update(); },
    hide()   { panel.style.display = 'none'; },
    update() {
      Object.keys(rowRefs).forEach(refreshRow);
      Object.keys(artisanRowRefs).forEach(refreshArtisanRow);
      updateSellAllBtn();
    },
  };
}
