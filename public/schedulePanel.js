import { BOTTOM_BAR_HEIGHT } from './constants.js';
// schedulePanel.js – Daily schedule: Farming, Socializing, Sleeping (must total 24h)

const ACTIVITIES = [
  { key: 'farming',     label: 'Farming',     icon: '🌾', color: '#6dbd5a', description: 'Crops only grow during farming hours.' },
  { key: 'socializing', label: 'Socializing', icon: '💬', color: '#5ab5bd', description: 'Unlocks NPC events. (coming soon)' },
  { key: 'artisan',    label: 'Artisan',     icon: '🏺', color: '#c47a3a', description: 'Convert crops into high-value products.' },
  { key: 'sleeping',   label: 'Sleeping',    icon: '😴', color: '#9a7fc7', description: 'Rest and recover.' },
];

const TOTAL_HOURS = 24;
const MIN_HOURS = 0;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function initSchedulePanel({ getSchedule, onScheduleChange } = {}) {
  const schedule = { farming: 8, socializing: 4, artisan: 4, sleeping: 8 };

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
    maxHeight:  '60vh',
    padding:    '18px 18px 12px 18px',
    display:    'none',
  });

  const valDisplays = {};
  const sliders = {};
  const barSegments = [];

  // Bar visualization
  const barContainer = document.createElement('div');
  Object.assign(barContainer.style, {
    display: 'flex', height: '16px', borderRadius: '8px', overflow: 'hidden', marginBottom: '18px',
  });
  ACTIVITIES.forEach(act => {
    const seg = document.createElement('div');
    Object.assign(seg.style, {
      height: '100%', background: act.color, transition: 'width 0.2s',
      width: `${(schedule[act.key] / TOTAL_HOURS) * 100}%`,
    });
    barSegments.push(seg);
    barContainer.appendChild(seg);
  });
  panel.appendChild(barContainer);

  // Total display
  const totalEl = document.createElement('div');
  totalEl.textContent = `${TOTAL_HOURS} / 24 hours`;
  Object.assign(totalEl.style, {
    color: '#aaa', font: '11px sans-serif', textAlign: 'right', marginBottom: '10px',
  });
  panel.appendChild(totalEl);

  function redistributeOthers(changedKey, newVal) {
    const others = ACTIVITIES.filter(a => a.key !== changedKey);
    const oldOtherTotal = others.reduce((s, a) => s + schedule[a.key], 0);
    const remaining = TOTAL_HOURS - newVal;
    schedule[changedKey] = clamp(newVal, MIN_HOURS, TOTAL_HOURS);
    if (remaining <= 0) {
      others.forEach(a => { schedule[a.key] = 0; });
    } else if (oldOtherTotal <= 0) {
      const each = remaining / others.length;
      others.forEach(a => { schedule[a.key] = each; });
    } else {
      others.forEach(a => {
        schedule[a.key] = clamp((schedule[a.key] / oldOtherTotal) * remaining, MIN_HOURS, remaining);
      });
      // Fix rounding so total stays exactly 24
      const newTotal = ACTIVITIES.reduce((s, a) => s + schedule[a.key], 0);
      const diff = TOTAL_HOURS - newTotal;
      if (Math.abs(diff) > 0.001) {
        const lastOther = others[others.length - 1];
        schedule[lastOther.key] = clamp(schedule[lastOther.key] + diff, MIN_HOURS, TOTAL_HOURS);
      }
    }
  }

  function updateUI() {
    ACTIVITIES.forEach((act, i) => {
      const val = Math.round(schedule[act.key] * 10) / 10;
      sliders[act.key].value = val;
      valDisplays[act.key].textContent = `${Math.round(val)}h`;
      barSegments[i].style.width = `${(schedule[act.key] / TOTAL_HOURS) * 100}%`;
    });
    totalEl.textContent = `${ACTIVITIES.reduce((s, a) => s + schedule[a.key], 0).toFixed(0)} / 24 hours`;
    if (onScheduleChange) onScheduleChange({ ...schedule });
  }

  // Build slider rows
  ACTIVITIES.forEach(act => {
    const row = document.createElement('div');
    Object.assign(row.style, { marginBottom: '18px' });

    // Header row: icon + label + description + value
    const headerRow = document.createElement('div');
    Object.assign(headerRow.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
    });

    const iconEl = document.createElement('span');
    iconEl.textContent = act.icon;
    iconEl.style.fontSize = '18px';
    headerRow.appendChild(iconEl);

    const labelEl = document.createElement('span');
    labelEl.textContent = act.label;
    Object.assign(labelEl.style, { color: act.color, font: 'bold 14px sans-serif', flexShrink: '0' });
    headerRow.appendChild(labelEl);

    const descEl = document.createElement('span');
    descEl.textContent = act.description;
    Object.assign(descEl.style, { color: '#666', font: '11px sans-serif', flex: '1' });
    headerRow.appendChild(descEl);

    const valEl = document.createElement('span');
    valEl.textContent = `${schedule[act.key]}h`;
    Object.assign(valEl.style, {
      color: '#ffd700', font: 'bold 14px sans-serif', minWidth: '32px', textAlign: 'right',
    });
    valDisplays[act.key] = valEl;
    headerRow.appendChild(valEl);

    row.appendChild(headerRow);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = MIN_HOURS;
    slider.max = TOTAL_HOURS;
    slider.step = '1';
    slider.value = schedule[act.key];
    Object.assign(slider.style, {
      width: '100%', accentColor: act.color, cursor: 'pointer',
    });
    slider.addEventListener('input', () => {
      redistributeOthers(act.key, Number(slider.value));
      updateUI();
    });
    sliders[act.key] = slider;
    row.appendChild(slider);

    panel.appendChild(row);
  });

  // Hint
  const hint = document.createElement('div');
  hint.textContent = 'Crops grow during Farming hours. Artisan goods are crafted during Artisan hours.';
  Object.assign(hint.style, {
    color: '#555', font: '11px sans-serif', marginTop: '4px', textAlign: 'center',
  });
  panel.appendChild(hint);

  updateUI();

  function show() { panel.style.display = 'block'; }
  function hide() { panel.style.display = 'none'; }
  function getScheduleState() { return { ...schedule }; }
  function applyScheduleState(saved) {
    if (!saved) return;
    Object.assign(schedule, saved);
    updateUI();
  }

  const DAY_REAL_SECS = 240; // must match js-tiled-loader
  function dayHourOf(calendarAccum) {
    return ((calendarAccum % DAY_REAL_SECS) / DAY_REAL_SECS) * TOTAL_HOURS;
  }

  /** Crops only grow during farming hours (first block of the day). */
  function isFarmingTime(calendarAccum) {
    return dayHourOf(calendarAccum) < schedule.farming;
  }

  /** Player sleeps during the final block of the day. */
  function isSleepingTime(calendarAccum) {
    return dayHourOf(calendarAccum) >= (schedule.farming + schedule.socializing + schedule.artisan);
  }

  /** Player socializes during the second block of the day. */
  function isSocializingTime(calendarAccum) {
    const h = dayHourOf(calendarAccum);
    return h >= schedule.farming && h < (schedule.farming + schedule.socializing);
  }

  /** Player does artisan work during the third block of the day. */
  function isArtisanTime(calendarAccum) {
    const h = dayHourOf(calendarAccum);
    const artisanStart = schedule.farming + schedule.socializing;
    return h >= artisanStart && h < artisanStart + schedule.artisan;
  }

  return { panel, show, hide, getScheduleState, applyScheduleState, isFarmingTime, isSocializingTime, isSleepingTime, isArtisanTime };
}
