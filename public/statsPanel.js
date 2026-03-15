import { BOTTOM_BAR_HEIGHT } from './constants.js';
// statsPanel.js - Stats tab: lifetime crop statistics

/**
 * @param {object}              opts
 * @param {object}              opts.CROPS         - CROPS dict from crops.js
 * @param {Map<string,object>}  opts.cropStats     - Shared stats map: cropId → { grown, sold, lifetimeSales }
 * @param {Map<string,number>}  opts.cropInventory - Live inventory map: cropId → count in hand
 * @param {Map<string,number>}  opts.artisanInventory - Live artisan inventory: artisanKey → count
 * @param {Map<string,{crafted,sold,lifetimeSales}>} opts.artisanStats - Artisan historical stats
 * @returns {{ show: Function, hide: Function, update: Function }}
 */
export function initStatsPanel({ CROPS, cropStats, tilesetImage, cropInventory, artisanInventory, artisanStats }) {

  function shortNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'k';
    return n.toLocaleString();
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

  // ── Sub-tab bar ───────────────────────────────────────────────────────────
  const subTabBar = document.createElement('div');
  Object.assign(subTabBar.style, {
    display:      'flex',
    borderBottom: '2px solid rgba(255,215,0,0.3)',
    background:   'rgba(0,0,0,0.3)',
  });

  let activeSubTab = 'stats';

  function makeSubTab(label, key) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding:    '8px 20px',
      border:     'none',
      background: 'transparent',
      color:      '#aaa',
      font:       'bold 13px sans-serif',
      cursor:     'pointer',
      borderBottom: '3px solid transparent',
      marginBottom: '-2px',
    });
    btn.addEventListener('click', () => switchSubTab(key));
    return btn;
  }

  const tabBtnStats = makeSubTab('Stats', 'stats');
  const tabBtnStock = makeSubTab('Stock', 'stock');
  subTabBar.appendChild(tabBtnStats);
  subTabBar.appendChild(tabBtnStock);
  panel.appendChild(subTabBar);

  function switchSubTab(key) {
    activeSubTab = key;
    statsView.style.display = key === 'stats' ? 'block' : 'none';
    stockView.style.display = key === 'stock' ? 'block' : 'none';
    tabBtnStats.style.color = key === 'stats' ? '#ffd700' : '#aaa';
    tabBtnStock.style.color = key === 'stock' ? '#ffd700' : '#aaa';
    tabBtnStats.style.borderBottomColor = key === 'stats' ? '#ffd700' : 'transparent';
    tabBtnStock.style.borderBottomColor = key === 'stock' ? '#ffd700' : 'transparent';
    if (key === 'stock') updateStock();
  }

  // ── STATS VIEW ────────────────────────────────────────────────────────────
  const statsView = document.createElement('div');
  panel.appendChild(statsView);

  // ── Column headers ────────────────────────────────────────────────────────
  function makeHeader() {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
      padding:      '5px 14px',
      borderBottom: '1px solid rgba(255,215,0,0.4)',
      gap:          '8px',
    });
    ['Crop', 'Grown', 'Sold', 'Price / unit', 'Lifetime Sales'].forEach((label, i) => {
      const el = document.createElement('span');
      el.textContent = label;
      Object.assign(el.style, {
        color:      '#ffd700',
        font:       'bold 11px sans-serif',
        textAlign:  i === 0 ? 'left' : 'right',
        letterSpacing: '0.5px',
      });
      row.appendChild(el);
    });
    return row;
  }
  statsView.appendChild(makeHeader());

  // ── Crop rows ─────────────────────────────────────────────────────────────
  const rowRefs = {}; // cropId → { grownEl, soldEl, salesEl }

  Object.values(CROPS).forEach(cropType => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
      padding:      '6px 14px',
      gap:          '8px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      alignItems:   'center',
    });

    // Crop icon (from tileset)
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 22;
    iconCanvas.height = 22;
    Object.assign(iconCanvas.style, {
      width: '22px', height: '22px', imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '4px', flexShrink: '0',
      gridColumn: '1', justifySelf: 'start',
    });
    if (tilesetImage && cropType.marketIconGID) {
      const ctx = iconCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const TILESIZE = 16;
      const TILESET_COLS = 125;
      const id = cropType.marketIconGID - 1;
      const sx = (id % TILESET_COLS) * TILESIZE;
      const sy = Math.floor(id / TILESET_COLS) * TILESIZE;
      ctx.clearRect(0, 0, 22, 22);
      ctx.drawImage(tilesetImage, sx, sy, TILESIZE, TILESIZE, 0, 0, 22, 22);
    }

    const nameEl = document.createElement('span');
    nameEl.textContent = cropType.name;
    Object.assign(nameEl.style, { color: '#e8e8e8', font: 'bold 13px sans-serif', marginLeft: '2px' });

    // Name cell with icon
    const nameCell = document.createElement('span');
    nameCell.style.display = 'flex';
    nameCell.style.alignItems = 'center';
    nameCell.appendChild(iconCanvas);
    nameCell.appendChild(nameEl);

    const grownEl  = makeStatCell('0');
    const soldEl   = makeStatCell('0');
    const priceEl  = makeStatCell(`🪙 ${shortNumber(cropType.yieldGold)}`);
    const salesEl  = makeStatCell('0');

    row.appendChild(nameCell);
    row.appendChild(grownEl);
    row.appendChild(soldEl);
    row.appendChild(priceEl);
    row.appendChild(salesEl);

    // Unlock requirement element placeholder
    const reqEl = document.createElement('span');
    Object.assign(reqEl.style, { color: '#e05555', font: '11px sans-serif', gridColumn: '1 / span 5', marginTop: '2px' });
    row.appendChild(reqEl);

    statsView.appendChild(row);

    rowRefs[cropType.id] = { grownEl, soldEl, salesEl, reqEl };
  });

  // ── Total row ─────────────────────────────────────────────────────────────
  const totalRow = document.createElement('div');
  Object.assign(totalRow.style, {
    display:      'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
    padding:      '7px 14px',
    gap:          '8px',
    borderTop:    '2px solid rgba(255,215,0,0.35)',
    alignItems:   'center',
    background:   'rgba(255,215,0,0.06)',
  });

  const totalLabelEl  = document.createElement('span');
  totalLabelEl.textContent = 'TOTAL';
  Object.assign(totalLabelEl.style, { color: '#ffd700', font: 'bold 12px sans-serif', letterSpacing: '1px' });

  const totalGrownEl  = makeStatCell('0', true);
  const totalSoldEl   = makeStatCell('0', true);
  const totalPriceEl  = makeStatCell('—', true);
  const totalSalesEl  = makeStatCell('0', true);

  totalRow.appendChild(totalLabelEl);
  totalRow.appendChild(totalGrownEl);
  totalRow.appendChild(totalSoldEl);
  totalRow.appendChild(totalPriceEl);
  totalRow.appendChild(totalSalesEl);
  statsView.appendChild(totalRow);

  // ── ARTISAN GOODS section in Stats sub-tab ─────────────────────────────
  const artisanStatsSecHeader = document.createElement('div');
  Object.assign(artisanStatsSecHeader.style, {
    padding:      '6px 14px',
    font:         'bold 12px sans-serif',
    color:        '#c47a3a',
    borderTop:    '1px solid rgba(196,122,58,0.4)',
    borderBottom: '1px solid rgba(196,122,58,0.3)',
    letterSpacing:'1.5px',
    marginTop:    '4px',
  });
  artisanStatsSecHeader.textContent = 'ARTISAN GOODS';
  statsView.appendChild(artisanStatsSecHeader);

  // Artisan stats column headers
  const artisanStatsColHeader = document.createElement('div');
  Object.assign(artisanStatsColHeader.style, {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
    padding:             '5px 14px',
    borderBottom:        '1px solid rgba(196,122,58,0.25)',
    gap:                 '8px',
  });
  ['Product', 'Crafted', 'Sold', 'Price / unit', 'Lifetime Sales'].forEach((label, i) => {
    const el = document.createElement('span');
    el.textContent = label;
    Object.assign(el.style, {
      color:         '#c47a3a',
      font:          'bold 11px sans-serif',
      textAlign:     i === 0 ? 'left' : 'right',
      letterSpacing: '0.5px',
    });
    artisanStatsColHeader.appendChild(el);
  });
  statsView.appendChild(artisanStatsColHeader);

  // Artisan stats rows
  const artisanRowRefs = {}; // cropId → { craftedEl, soldEl, salesEl }
  Object.values(CROPS).forEach(cropType => {
    const ap = cropType.artisanProduct;
    if (!ap) return;
    const artisanKey = `${cropType.id}_artisan`;

    const row = document.createElement('div');
    Object.assign(row.style, {
      display:             'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
      padding:             '6px 14px',
      gap:                 '8px',
      borderBottom:        '1px solid rgba(255,255,255,0.05)',
      alignItems:          'center',
    });

    // Icon
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 22; iconCanvas.height = 22;
    Object.assign(iconCanvas.style, {
      width: '22px', height: '22px', imageRendering: 'pixelated',
      verticalAlign: 'middle', marginRight: '4px', flexShrink: '0',
    });
    if (tilesetImage && ap.iconGID) {
      const ctx = iconCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const TILESIZE = 16, TILESET_COLS = 125;
      const id = ap.iconGID - 1;
      ctx.drawImage(tilesetImage,
        (id % TILESET_COLS) * TILESIZE, Math.floor(id / TILESET_COLS) * TILESIZE,
        TILESIZE, TILESIZE, 0, 0, 22, 22);
    }
    const nameEl = document.createElement('span');
    nameEl.textContent = ap.name;
    Object.assign(nameEl.style, { color: '#e8c89a', font: 'bold 13px sans-serif', marginLeft: '2px' });
    const nameCell = document.createElement('span');
    nameCell.style.display = 'flex'; nameCell.style.alignItems = 'center';
    nameCell.appendChild(iconCanvas); nameCell.appendChild(nameEl);

    const craftedEl = makeStatCell('0');
    const soldEl    = makeStatCell('0');
    const priceEl   = makeStatCell(`🪙 ${shortNumber(ap.goldValue)}`);
    const salesEl   = makeStatCell('0');

    row.appendChild(nameCell);
    row.appendChild(craftedEl);
    row.appendChild(soldEl);
    row.appendChild(priceEl);
    row.appendChild(salesEl);
    statsView.appendChild(row);
    artisanRowRefs[artisanKey] = { craftedEl, soldEl, salesEl };
  });

  // Artisan stats total row
  const artisanStatsTotalRow = document.createElement('div');
  Object.assign(artisanStatsTotalRow.style, {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
    padding:             '7px 14px',
    gap:                 '8px',
    borderTop:           '2px solid rgba(196,122,58,0.35)',
    alignItems:          'center',
    background:          'rgba(196,122,58,0.06)',
  });
  const artisanStatsTotalLabelEl  = document.createElement('span');
  artisanStatsTotalLabelEl.textContent = 'TOTAL';
  Object.assign(artisanStatsTotalLabelEl.style, { color: '#c47a3a', font: 'bold 12px sans-serif', letterSpacing: '1px' });
  const artisanStatsTotCraftedEl = makeStatCell('0', true);
  const artisanStatsTotSoldEl    = makeStatCell('0', true);
  const artisanStatsTotPriceEl   = makeStatCell('—', true);
  const artisanStatsTotSalesEl   = makeStatCell('0', true);
  artisanStatsTotalRow.appendChild(artisanStatsTotalLabelEl);
  artisanStatsTotalRow.appendChild(artisanStatsTotCraftedEl);
  artisanStatsTotalRow.appendChild(artisanStatsTotSoldEl);
  artisanStatsTotalRow.appendChild(artisanStatsTotPriceEl);
  artisanStatsTotalRow.appendChild(artisanStatsTotSalesEl);
  statsView.appendChild(artisanStatsTotalRow);

  document.body.appendChild(panel);

  // ── STOCK VIEW ────────────────────────────────────────────────────────────
  const stockView = document.createElement('div');
  stockView.style.display = 'none';
  panel.appendChild(stockView);

  // Stock column header
  const stockHeader = document.createElement('div');
  Object.assign(stockHeader.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
    padding: '5px 14px', borderBottom: '1px solid rgba(255,215,0,0.4)', gap: '8px',
  });
  ['Crop', 'In Stock', 'Est. Value'].forEach((label, i) => {
    const el = document.createElement('span');
    el.textContent = label;
    Object.assign(el.style, {
      color: '#ffd700', font: 'bold 11px sans-serif',
      textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.5px',
    });
    stockHeader.appendChild(el);
  });
  stockView.appendChild(stockHeader);

  // Stock rows (one per crop)
  const stockRefs = {}; // cropId → { stockEl, valueEl }
  Object.values(CROPS).forEach(cropType => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      padding: '6px 14px', gap: '8px',
      borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center',
    });

    // Icon + name
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 22; iconCanvas.height = 22;
    Object.assign(iconCanvas.style, {
      width: '22px', height: '22px', imageRendering: 'pixelated',
      verticalAlign: 'middle', marginRight: '4px', flexShrink: '0',
    });
    if (tilesetImage && cropType.marketIconGID) {
      const ctx = iconCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const TILESIZE = 16, TILESET_COLS = 125;
      const id = cropType.marketIconGID - 1;
      ctx.drawImage(tilesetImage,
        (id % TILESET_COLS) * TILESIZE, Math.floor(id / TILESET_COLS) * TILESIZE,
        TILESIZE, TILESIZE, 0, 0, 22, 22);
    }
    const nameEl = document.createElement('span');
    nameEl.textContent = cropType.name;
    Object.assign(nameEl.style, { color: '#e8e8e8', font: 'bold 13px sans-serif', marginLeft: '2px' });
    const nameCell = document.createElement('span');
    nameCell.style.display = 'flex'; nameCell.style.alignItems = 'center';
    nameCell.appendChild(iconCanvas); nameCell.appendChild(nameEl);

    const stockEl = makeStatCell('0');
    const valueEl = makeStatCell('0');

    row.appendChild(nameCell);
    row.appendChild(stockEl);
    row.appendChild(valueEl);
    stockView.appendChild(row);
    stockRefs[cropType.id] = { stockEl, valueEl, yieldGold: cropType.yieldGold };
  });

  // Stock total row
  const stockTotalRow = document.createElement('div');
  Object.assign(stockTotalRow.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
    padding: '7px 14px', gap: '8px',
    borderTop: '2px solid rgba(255,215,0,0.35)',
    background: 'rgba(255,215,0,0.06)', alignItems: 'center',
  });
  const stockTotalLabelEl = document.createElement('span');
  stockTotalLabelEl.textContent = 'TOTAL';
  Object.assign(stockTotalLabelEl.style, { color: '#ffd700', font: 'bold 12px sans-serif', letterSpacing: '1px' });
  const stockTotalCountEl = makeStatCell('0', true);
  const stockTotalValueEl = makeStatCell('0', true);
  stockTotalRow.appendChild(stockTotalLabelEl);
  stockTotalRow.appendChild(stockTotalCountEl);
  stockTotalRow.appendChild(stockTotalValueEl);
  stockView.appendChild(stockTotalRow);

  // ── Artisan Goods in Stock sub-tab ─────────────────────────────────
  const artisanStockHeaderSec = document.createElement('div');
  Object.assign(artisanStockHeaderSec.style, {
    padding: '6px 14px',
    font: 'bold 12px sans-serif',
    color: '#c47a3a',
    borderTop: '1px solid rgba(196,122,58,0.4)',
    borderBottom: '1px solid rgba(196,122,58,0.3)',
    letterSpacing: '1.5px',
    marginTop: '4px',
  });
  artisanStockHeaderSec.textContent = 'ARTISAN GOODS';
  stockView.appendChild(artisanStockHeaderSec);

  // Artisan stock column header
  const artisanStockColHeader = document.createElement('div');
  Object.assign(artisanStockColHeader.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
    padding: '5px 14px', borderBottom: '1px solid rgba(196,122,58,0.25)', gap: '8px',
  });
  ['Product', 'In Stock', 'Est. Value'].forEach((label, i) => {
    const el = document.createElement('span');
    el.textContent = label;
    Object.assign(el.style, {
      color: '#c47a3a', font: 'bold 11px sans-serif',
      textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.5px',
    });
    artisanStockColHeader.appendChild(el);
  });
  stockView.appendChild(artisanStockColHeader);

  const artisanStockRefs = {}; // cropId → { stockEl, valueEl }
  Object.values(CROPS).forEach(cropType => {
    const ap = cropType.artisanProduct;
    if (!ap) return;
    const artisanKey = `${cropType.id}_artisan`;

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      padding: '6px 14px', gap: '8px',
      borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center',
    });

    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 22; iconCanvas.height = 22;
    Object.assign(iconCanvas.style, {
      width: '22px', height: '22px', imageRendering: 'pixelated',
      verticalAlign: 'middle', marginRight: '4px', flexShrink: '0',
    });
    if (tilesetImage && ap.iconGID) {
      const ctx = iconCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const TILESIZE = 16, TILESET_COLS = 125;
      const id = ap.iconGID - 1;
      ctx.drawImage(tilesetImage,
        (id % TILESET_COLS) * TILESIZE, Math.floor(id / TILESET_COLS) * TILESIZE,
        TILESIZE, TILESIZE, 0, 0, 22, 22);
    }
    const nameEl = document.createElement('span');
    nameEl.textContent = ap.name;
    Object.assign(nameEl.style, { color: '#e8c89a', font: 'bold 13px sans-serif', marginLeft: '2px' });
    const nameCell = document.createElement('span');
    nameCell.style.display = 'flex'; nameCell.style.alignItems = 'center';
    nameCell.appendChild(iconCanvas); nameCell.appendChild(nameEl);

    const stockEl = makeStatCell('0');
    const valueEl = makeStatCell('0');
    row.appendChild(nameCell); row.appendChild(stockEl); row.appendChild(valueEl);
    stockView.appendChild(row);
    artisanStockRefs[cropType.id] = { stockEl, valueEl, artisanKey, goldValue: ap.goldValue };
  });

  // Artisan stock total row
  const artisanTotalRow = document.createElement('div');
  Object.assign(artisanTotalRow.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
    padding: '7px 14px', gap: '8px',
    borderTop: '2px solid rgba(196,122,58,0.35)',
    background: 'rgba(196,122,58,0.06)', alignItems: 'center',
  });
  const artisanTotalLabelEl = document.createElement('span');
  artisanTotalLabelEl.textContent = 'TOTAL';
  Object.assign(artisanTotalLabelEl.style, { color: '#c47a3a', font: 'bold 12px sans-serif', letterSpacing: '1px' });
  const artisanTotalCountEl = makeStatCell('0', true);
  const artisanTotalValueEl = makeStatCell('0', true);
  artisanTotalRow.appendChild(artisanTotalLabelEl);
  artisanTotalRow.appendChild(artisanTotalCountEl);
  artisanTotalRow.appendChild(artisanTotalValueEl);
  stockView.appendChild(artisanTotalRow);

  function updateStock() {
    let totalCount = 0, totalValue = 0;
    Object.values(CROPS).forEach(cropType => {
      const count = (cropInventory ? cropInventory.get(cropType.id) : 0) ?? 0;
      const value = count * cropType.yieldGold;
      const refs = stockRefs[cropType.id];
      if (!refs) return;
      refs.stockEl.textContent = shortNumber(count);
      refs.valueEl.textContent = `🪙 ${shortNumber(value)}`;
      totalCount += count;
      totalValue += value;
    });
    stockTotalCountEl.textContent = shortNumber(totalCount);
    stockTotalValueEl.textContent = `🪙 ${shortNumber(totalValue)}`;

    // Artisan goods stock
    let artisanTotal = 0, artisanTotalVal = 0;
    Object.values(artisanStockRefs).forEach(refs => {
      const count = (artisanInventory ? (artisanInventory.get(refs.artisanKey) || 0) : 0);
      const value = count * refs.goldValue;
      refs.stockEl.textContent = shortNumber(count);
      refs.valueEl.textContent = `🪙 ${shortNumber(value)}`;
      artisanTotal += count;
      artisanTotalVal += value;
    });
    artisanTotalCountEl.textContent = shortNumber(artisanTotal);
    artisanTotalValueEl.textContent = `🪙 ${shortNumber(artisanTotalVal)}`;
  }

  setInterval(() => { if (activeSubTab === 'stock') updateStock(); }, 1000);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function makeStatCell(text, bold = false) {
    const el = document.createElement('span');
    el.textContent = text;
    Object.assign(el.style, {
      color:     '#ccc',
      font:      `${bold ? 'bold ' : ''}12px sans-serif`,
      textAlign: 'right',
    });
    return el;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function update() {
    let totGrown = 0, totSold = 0, totSales = 0;

    Object.values(CROPS).forEach(cropType => {
      const s = cropStats.get(cropType.id) || { grown: 0, sold: 0, lifetimeSales: 0 };
      const refs = rowRefs[cropType.id];
      if (!refs) return;
      refs.grownEl.textContent  = shortNumber(s.grown);
      refs.soldEl.textContent   = shortNumber(s.sold);
      refs.salesEl.textContent  = `🪙 ${shortNumber(s.lifetimeSales)}`;
      totGrown += s.grown;
      totSold  += s.sold;
      totSales += s.lifetimeSales;

      // Update unlock requirement display
      const lifetimeGold = Array.from(cropStats.values()).reduce((sum, s) => sum + s.lifetimeSales, 0);
      const unlocked = cropType.isUnlocked ? cropType.isUnlocked(cropStats, lifetimeGold) : true;
      if (!unlocked && cropType.unlockCriteria) {
        const req = cropType.unlockCriteria;
        const stats = cropStats.get(req.cropId) || { sold: 0 };
        refs.reqEl.textContent = `Unlock: Sell ${req.cropSold} ${CROPS[req.cropId]?.name || req.cropId} (${stats.sold}/${req.cropSold}), Earn ${shortNumber(req.goldEarned)} gold (${shortNumber(lifetimeGold)}/${shortNumber(req.goldEarned)})`;
      } else {
        refs.reqEl.textContent = '';
      }
    });

    totalGrownEl.textContent  = shortNumber(totGrown);
    totalSoldEl.textContent   = shortNumber(totSold);
    totalSalesEl.textContent  = `🪙 ${shortNumber(totSales)}`;

    // Artisan stats rows
    if (artisanStats) {
      let totCrafted = 0, totArtSold = 0, totArtSales = 0;
      artisanStats.forEach((s, artisanKey) => {
        const refs = artisanRowRefs[artisanKey];
        if (!refs) return;
        refs.craftedEl.textContent = shortNumber(s.crafted);
        refs.soldEl.textContent    = shortNumber(s.sold);
        refs.salesEl.textContent   = `🪙 ${shortNumber(s.lifetimeSales)}`;
        totCrafted += s.crafted;
        totArtSold += s.sold;
        totArtSales += s.lifetimeSales;
      });
      artisanStatsTotCraftedEl.textContent = shortNumber(totCrafted);
      artisanStatsTotSoldEl.textContent    = shortNumber(totArtSold);
      artisanStatsTotSalesEl.textContent   = `🪙 ${shortNumber(totArtSales)}`;
    }
  }

  // ── Time Spent Section ───────────────────────────────────────────────────
  const timeSection = document.createElement('div');
  Object.assign(timeSection.style, {
    padding:      '14px 14px 10px 14px',
    borderTop:    '2px solid rgba(255,215,0,0.35)',
    marginTop:    '4px',
  });

  const timeHeader = document.createElement('div');
  timeHeader.textContent = 'Time Spent';
  Object.assign(timeHeader.style, {
    color: '#ffd700', font: 'bold 13px sans-serif', letterSpacing: '1px', marginBottom: '10px',
  });
  timeSection.appendChild(timeHeader);

  const timeGrid = document.createElement('div');
  Object.assign(timeGrid.style, {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
  });

  function makeTimeCard(icon, label, color) {
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '8px',
      padding: '10px 8px',
      textAlign: 'center',
      border: `1px solid ${color}44`,
    });
    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.fontSize = '22px';
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    Object.assign(labelEl.style, { color, font: 'bold 11px sans-serif', marginTop: '4px' });
    const valEl = document.createElement('div');
    valEl.textContent = '0.0 h';
    Object.assign(valEl.style, { color: '#e8e8e8', font: 'bold 15px sans-serif', marginTop: '6px' });
    card.appendChild(iconEl);
    card.appendChild(labelEl);
    card.appendChild(valEl);
    timeGrid.appendChild(card);
    return valEl;
  }

  const farmingTimeEl     = makeTimeCard('🌾', 'Farming',     '#6dbd5a');
  const socializingTimeEl = makeTimeCard('💬', 'Socializing', '#5ab5bd');
  const artisanTimeEl     = makeTimeCard('🏺', 'Artisan',     '#c47a3a');
  const sleepingTimeEl    = makeTimeCard('😴', 'Sleeping',    '#9a7fc7');

  Object.assign(timeGrid.style, { gridTemplateColumns: '1fr 1fr 1fr 1fr' });

  timeSection.appendChild(timeGrid);
  panel.appendChild(timeSection);

  function updateTimeSpent() {
    if (window.getTotalFarmingHours)     farmingTimeEl.textContent     = `${window.getTotalFarmingHours().toFixed(1)} h`;
    if (window.getTotalSocializingHours) socializingTimeEl.textContent = `${window.getTotalSocializingHours().toFixed(1)} h`;
    if (window.getTotalArtisanHours)     artisanTimeEl.textContent     = `${window.getTotalArtisanHours().toFixed(1)} h`;
    if (window.getTotalSleepingHours)    sleepingTimeEl.textContent    = `${window.getTotalSleepingHours().toFixed(1)} h`;
  }

  setInterval(updateTimeSpent, 1000);

  return {
    show()   { panel.style.display = 'block'; switchSubTab(activeSubTab); update(); updateTimeSpent(); },
    hide()   { panel.style.display = 'none'; },
    update,
  };
}
