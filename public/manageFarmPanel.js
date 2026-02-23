import { BOTTOM_BAR_HEIGHT } from './constants.js';
// manageFarmPanel.js - Manage Farm tab: view owned zones and switch crops

const TILESIZE = 16;
const TILESET_COLS = 125;

function gidCoords(gid) {
  const id = gid - 1;
  return { sx: (id % TILESET_COLS) * TILESIZE, sy: Math.floor(id / TILESET_COLS) * TILESIZE };
}

/**
 * @param {object}              opts
 * @param {object[]}            opts.cropZones       - All zones sorted
 * @param {Set<string>}         opts.unlockedZones   - Owned zone names
 * @param {Set<string>}         opts.unlockedCrops   - Unlocked crop IDs
 * @param {Map}                 opts.zoneCrops        - zoneName → { instance, tileCount }
 * @param {object}              opts.CROPS            - CROPS dict
 * @param {Function}            opts.CropInstance     - CropInstance constructor
 * @param {HTMLImageElement}    opts.tilesetImage
 * @param {Function}            opts.onCropChange     - Called after switching a zone's crop
 * @returns {{ show: Function, hide: Function, update: Function }}
 */
export function initManageFarmPanel({
  cropZones, unlockedZones, unlockedCrops, zoneCrops, CROPS, CropInstance, tilesetImage, cropStats, onCropChange
}) {

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
  });
  header.textContent = 'MANAGE FARM';
  panel.appendChild(header);

  // ── Zone rows (rebuilt on show/update) ───────────────────────────────────
  const listEl = document.createElement('div');
  panel.appendChild(listEl);

  document.body.appendChild(panel);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function drawCropIcon(canvas, gid) {
    canvas.width  = 24;
    canvas.height = 24;
    Object.assign(canvas.style, { width: '24px', height: '24px', imageRendering: 'pixelated', flexShrink: '0' });
    const ictx = canvas.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    const { sx, sy } = gidCoords(gid);
    ictx.drawImage(tilesetImage, sx, sy, TILESIZE, TILESIZE, 0, 0, 24, 24);
  }

  function buildRows() {
    listEl.innerHTML = '';

    const ownedZones = cropZones.filter(z => unlockedZones.has(z.name));

    if (ownedZones.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No farm zones owned yet. Buy some in Real Estate!';
      Object.assign(empty.style, { color: '#888', padding: '14px', font: '12px sans-serif' });
      listEl.appendChild(empty);
      return;
    }

    // ── Global "All Zones" row ──────────────────────────────────────────────
    const globalRow = document.createElement('div');
    Object.assign(globalRow.style, {
      display:      'flex',
      alignItems:   'center',
      padding:      '8px 14px',
      gap:          '12px',
      borderBottom: '2px solid rgba(255,215,0,0.35)',
      background:   'rgba(255,215,0,0.05)',
      flexWrap:     'wrap',
    });

    const globalLabel = document.createElement('div');
    Object.assign(globalLabel.style, {
      color:      '#ffd700',
      font:       'bold 12px sans-serif',
      minWidth:   '110px',
      flexShrink: '0',
      letterSpacing: '0.5px',
    });
    globalLabel.textContent = 'ALL ZONES';
    globalRow.appendChild(globalLabel);

    const globalSpacer = document.createElement('div');
    globalSpacer.style.flex = '1';
    globalRow.appendChild(globalSpacer);

    const globalBtnGroup = document.createElement('div');
    Object.assign(globalBtnGroup.style, {
      display:        'flex',
      gap:            '6px',
      flexWrap:       'wrap',
      justifyContent: 'flex-end',
    });

    Object.values(CROPS).forEach(cropType => {
      const lifetimeGold = cropStats ? Array.from(cropStats.values()).reduce((sum, s) => sum + s.lifetimeSales, 0) : 0;
      const unlocked = cropType.isUnlocked ? cropType.isUnlocked(cropStats, lifetimeGold) : true;

      // "active" for global = every owned zone is already on this crop
      const allActive = ownedZones.length > 0 && ownedZones.every(z => {
        const e = zoneCrops.get(z.name);
        return e && e.instance.cropType.id === cropType.id;
      });

      const btn = document.createElement('button');
      Object.assign(btn.style, {
        display:      'flex',
        alignItems:   'center',
        gap:          '5px',
        background:   allActive ? '#6b4d00' : unlocked ? '#252525' : '#222',
        color:        allActive ? '#ffd700' : unlocked ? '#ccc' : '#888',
        border:       `1px solid ${allActive ? '#ffd700' : unlocked ? '#444' : '#333'}`,
        borderRadius: '4px',
        padding:      '3px 10px 3px 6px',
        font:         'bold 11px sans-serif',
        cursor:       allActive ? 'default' : unlocked ? 'pointer' : 'not-allowed',
        opacity:      unlocked ? '1' : '0.6',
      });

      const icon = document.createElement('canvas');
      drawCropIcon(icon, cropType.marketIconGID);
      icon.style.width  = '16px';
      icon.style.height = '16px';
      const label = document.createElement('span');
      label.textContent = cropType.name;
      btn.appendChild(icon);
      btn.appendChild(label);

      if (unlocked && !allActive) {
        btn.addEventListener('mouseenter', () => { btn.style.background = '#3a3000'; btn.style.borderColor = '#ffd700'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#252525'; btn.style.borderColor = '#444'; });
        btn.addEventListener('click', () => {
          ownedZones.forEach(zone => {
            const tc = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
            zoneCrops.set(zone.name, { instance: new CropInstance(cropType), tileCount: tc });
          });
          onCropChange();
          buildRows();
        });
      }

      globalBtnGroup.appendChild(btn);
    });

    globalRow.appendChild(globalBtnGroup);
    listEl.appendChild(globalRow);
    // ── End global row ─────────────────────────────────────────────────────

    ownedZones.forEach(zone => {
      const entry    = zoneCrops.get(zone.name);
      const tileCount = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
      const currentCropType = entry ? entry.instance.cropType : null;

      const row = document.createElement('div');
      Object.assign(row.style, {
        display:      'flex',
        alignItems:   'center',
        padding:      '7px 14px',
        gap:          '12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexWrap:     'wrap',
      });

      // Zone name + plot count
      const info = document.createElement('div');
      Object.assign(info.style, {
        display:       'flex',
        flexDirection: 'column',
        minWidth:      '110px',
        flexShrink:    '0',
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

      // Current crop indicator
      const currentEl = document.createElement('div');
      Object.assign(currentEl.style, {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        flexShrink: '0',
        minWidth:   '110px',
      });
      if (currentCropType) {
        const icon = document.createElement('canvas');
        drawCropIcon(icon, currentCropType.marketIconGID);
        const cropLabel = document.createElement('span');
        cropLabel.textContent = currentCropType.name;
        Object.assign(cropLabel.style, { color: '#aaa', font: '12px sans-serif' });
        currentEl.appendChild(icon);
        currentEl.appendChild(cropLabel);
      }
      row.appendChild(currentEl);

      // Spacer
      const spacer = document.createElement('div');
      spacer.style.flex = '1';
      row.appendChild(spacer);

      // Crop selector buttons (one per unlocked crop)
      const btnGroup = document.createElement('div');
      Object.assign(btnGroup.style, {
        display:  'flex',
        gap:      '6px',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      });

      Object.values(CROPS).forEach(cropType => {
        // Check unlock status
        const lifetimeGold = cropStats ? Array.from(cropStats.values()).reduce((sum, s) => sum + s.lifetimeSales, 0) : 0;
        const unlocked = cropType.isUnlocked ? cropType.isUnlocked(cropStats, lifetimeGold) : true;
        const isActive = currentCropType && currentCropType.id === cropType.id;

        const btn = document.createElement('button');
        Object.assign(btn.style, {
          display:      'flex',
          alignItems:   'center',
          gap:          '5px',
          background:   isActive ? '#6b4d00' : unlocked ? '#252525' : '#222',
          color:        isActive ? '#ffd700' : unlocked ? '#ccc' : '#888',
          border:       `1px solid ${isActive ? '#ffd700' : unlocked ? '#444' : '#333'}`,
          borderRadius: '4px',
          padding:      '3px 10px 3px 6px',
          font:         'bold 11px sans-serif',
          cursor:       isActive ? 'default' : unlocked ? 'pointer' : 'not-allowed',
          opacity:      unlocked ? '1' : '0.6',
        });

        const icon = document.createElement('canvas');
        drawCropIcon(icon, cropType.marketIconGID);
        icon.style.width  = '16px';
        icon.style.height = '16px';

        const label = document.createElement('span');
        label.textContent = cropType.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        if (unlocked && !isActive) {
          btn.addEventListener('mouseenter', () => { btn.style.background = '#333'; btn.style.borderColor = '#666'; });
          btn.addEventListener('mouseleave', () => { btn.style.background = '#252525'; btn.style.borderColor = '#444'; });
          btn.addEventListener('click', () => {
            const tc = Math.round(zone.width / TILESIZE) * Math.round(zone.height / TILESIZE);
            zoneCrops.set(zone.name, { instance: new CropInstance(cropType), tileCount: tc });
            onCropChange();
            buildRows(); // refresh the panel
          });
        }

        btnGroup.appendChild(btn);
      });

      row.appendChild(btnGroup);
      listEl.appendChild(row);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    show()   { buildRows(); panel.style.display = 'block'; },
    hide()   { panel.style.display = 'none'; },
    update() { if (panel.style.display !== 'none') buildRows(); },
  };
}
