// settingsPanel.js - Settings tab: save/clear, zoom, and game speed controls
import { saveGame, clearSave } from './saveSystem.js';
import { BOTTOM_BAR_HEIGHT } from './constants.js';

const ZOOM_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SPEED_MIN = 1;
const SPEED_MAX = 5;

function makeBtn(text, onClick, extra = {}) {
  const btn = document.createElement('button');
  btn.textContent = text;
  Object.assign(btn.style, {
    background:   '#2a2a2a',
    color:        '#ffd700',
    border:       '1px solid #ffd700',
    borderRadius: '4px',
    padding:      '6px 14px',
    font:         'bold 14px sans-serif',
    cursor:       'pointer',
    minWidth:     '36px',
    ...extra,
  });
  btn.onclick = onClick;
  return btn;
}

function makeLabel(text) {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, {
    color:      '#e8e8e8',
    font:       'bold 13px sans-serif',
    minWidth:   '70px',
    display:    'inline-block',
  });
  return el;
}

function makeDisplay(text) {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, {
    color:       '#ffd700',
    font:        'bold 14px sans-serif',
    minWidth:    '48px',
    textAlign:   'center',
    display:     'inline-block',
    padding:     '0 8px',
  });
  return el;
}

function makeRow(...children) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginBottom: '14px',
  });
  children.forEach(c => row.appendChild(c));
  return row;
}

export function initSettingsPanel({
  getGameState, applyGameState,
  getZoom, setZoom,
  getSpeed, setSpeed,
  isPaused, togglePause,
  getAutoPilot, setAutoPilot,
}) {
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
    padding:    '20px 24px',
  });
  // ── Auto-pilot ────────────────────────────────────────────────────────────
  const apDesc = document.createElement('div');
  apDesc.textContent = '🤖 Auto-pilot: automatically buys upgrades, grows the most profitable crop, routes output through artisan workshops, and adjusts sell settings.';
  Object.assign(apDesc.style, {
    color: '#888', font: '11px sans-serif', marginBottom: '8px', lineHeight: '1.5',
  });
  panel.appendChild(apDesc);

  const apBtn = makeBtn('🤖 Auto-pilot: OFF', () => {
    setAutoPilot(!getAutoPilot());
    update();
  }, { minWidth: '180px' });
  panel.appendChild(makeRow(apBtn));
  // ── Save / Clear ────────────────────────────────────────────────────────
  const saveBtn = makeBtn('💾 Force Save', () => {
    saveGame(getGameState());
    alert('Game saved!');
  });
  const clearBtn = makeBtn('🗑 Clear Save', () => {
    if (confirm('Delete all save data and restart?')) {
      clearSave();
      location.reload();
    }
  }, { background: '#5a1e1e', color: '#ff8080', borderColor: '#ff8080' });
  panel.appendChild(makeRow(saveBtn, clearBtn));

  // ── Zoom ────────────────────────────────────────────────────────────────
  const zoomDisplay = makeDisplay('2×');

  const zoomOut = makeBtn('−', () => {
    const cur = getZoom();
    const idx = ZOOM_STEPS.indexOf(cur);
    const next = idx > 0 ? ZOOM_STEPS[idx - 1] : ZOOM_STEPS[0];
    setZoom(next);
    update();
  });
  const zoomIn = makeBtn('+', () => {
    const cur = getZoom();
    const idx = ZOOM_STEPS.indexOf(cur);
    const next = idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoom(next);
    update();
  });
  panel.appendChild(makeRow(makeLabel('Zoom:'), zoomOut, zoomDisplay, zoomIn));

  // ── Game Speed ──────────────────────────────────────────────────────────
  const speedDisplay = makeDisplay('1×');
  const pauseBtn = makeBtn('⏸', () => {
    togglePause();
    update();
  }, { minWidth: '44px' });

  const rewindBtn = makeBtn('⏪', () => {
    const s = getSpeed();
    if (s > SPEED_MIN) setSpeed(s - 1);
    update();
  });
  const ffBtn = makeBtn('⏩', () => {
    const s = getSpeed();
    if (s < SPEED_MAX) setSpeed(s + 1);
    update();
  });
  panel.appendChild(makeRow(makeLabel('Speed:'), rewindBtn, speedDisplay, pauseBtn, ffBtn));

  function update() {
    // Auto-pilot
    const apOn = getAutoPilot();
    apBtn.textContent = `🤖 Auto-pilot: ${apOn ? 'ON' : 'OFF'}`;
    apBtn.style.background   = apOn ? '#1a3a1a' : '#2a2a2a';
    apBtn.style.color        = apOn ? '#7dff7d' : '#ffd700';
    apBtn.style.borderColor  = apOn ? '#7dff7d' : '#ffd700';

    // Zoom
    const zoom = getZoom();
    const zoomIdx = ZOOM_STEPS.indexOf(zoom);
    zoomDisplay.textContent = zoom === 0.5 ? '½×' : `${zoom}×`;
    zoomOut.disabled = zoomIdx <= 0;
    zoomIn.disabled  = zoomIdx >= ZOOM_STEPS.length - 1;
    zoomOut.style.opacity = zoomOut.disabled ? '0.35' : '1';
    zoomIn.style.opacity  = zoomIn.disabled  ? '0.35' : '1';

    // Speed / pause
    const paused = isPaused();
    const speed  = getSpeed();
    speedDisplay.textContent = paused ? '—' : `${speed}×`;
    speedDisplay.style.color = paused ? '#888' : '#ffd700';
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.style.background = paused ? '#1a3a1a' : '#2a2a2a';
    pauseBtn.style.color = paused ? '#7dff7d' : '#ffd700';
    rewindBtn.disabled = paused || speed <= SPEED_MIN;
    ffBtn.disabled     = paused || speed >= SPEED_MAX;
    rewindBtn.style.opacity = rewindBtn.disabled ? '0.35' : '1';
    ffBtn.style.opacity     = ffBtn.disabled     ? '0.35' : '1';
  }

  return {
    show()   { panel.style.display = 'block'; update(); },
    hide()   { panel.style.display = 'none'; },
    update,
    panel,
  };
}
