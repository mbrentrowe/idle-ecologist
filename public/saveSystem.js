// saveSystem.js - Persistent save/load for Idle Ecologist

const SAVE_KEY = 'idleEcologistSave';

export function saveGame(state) {
  const data = JSON.stringify(state);
  localStorage.setItem(SAVE_KEY, data);
  console.log('[Save] Saved game. Gold:', state.gold, '| Day:', state.calendar?.day, 'Month:', state.calendar?.month, 'Year:', state.calendar?.year, '| Zones:', state.unlockedZones);
}

export function loadGame() {
  const data = localStorage.getItem(SAVE_KEY);
  if (!data) {
    console.log('[Load] No save data found in localStorage.');
    return null;
  }
  try {
    const state = JSON.parse(data);
    console.log('[Load] Found save. Gold:', state.gold, '| Day:', state.calendar?.day, 'Month:', state.calendar?.month, 'Year:', state.calendar?.year, '| Zones:', state.unlockedZones);
    return state;
  } catch {
    console.log('[Load] Failed to parse save data.');
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
