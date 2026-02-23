import { BOTTOM_BAR_HEIGHT } from './constants.js';
// eventsPanel.js - Events tab: upcoming and active ecological events

const TILESET_URL  = 'Assets/Tilesets/IdleEcologistMasterSpriteSheet.png';
const TILESET_COLS = 125;
const TILE_PX      = 16;
const TILESET_W    = 2000;
const TILESET_H    = 1568;

function makeTileSprite(gid, displaySize = 32) {
  const tileId = gid - 1;
  const col = tileId % TILESET_COLS;
  const row = Math.floor(tileId / TILESET_COLS);
  const scale = displaySize / TILE_PX;
  const el = document.createElement('span');
  el.style.display          = 'inline-block';
  el.style.flexShrink       = '0';
  el.style.width            = `${displaySize}px`;
  el.style.height           = `${displaySize}px`;
  el.style.background       = `url('${TILESET_URL}')`;
  el.style.backgroundPosition = `-${col * TILE_PX * scale}px -${row * TILE_PX * scale}px`;
  el.style.backgroundSize   = `${TILESET_W * scale}px ${TILESET_H * scale}px`;
  el.style.imageRendering   = 'pixelated';
  return el;
}

function makeSection(title, content) {
  const section = document.createElement('div');
  Object.assign(section.style, {
    marginBottom: '18px',
  });

  const heading = document.createElement('div');
  heading.textContent = title;
  Object.assign(heading.style, {
    color:        '#ffd700',
    font:         'bold 14px sans-serif',
    borderBottom: '1px solid rgba(255,215,0,0.25)',
    paddingBottom:'4px',
    marginBottom: '8px',
  });
  section.appendChild(heading);

  const body = document.createElement('div');
  body.textContent = content;
  Object.assign(body.style, {
    color: '#ccc',
    font:  '13px sans-serif',
  });
  section.appendChild(body);

  return { section, body };
}

export function initEventsPanel() {
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

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   '14px',
  });
  const title = document.createElement('span');
  title.textContent = 'Events';
  Object.assign(title.style, {
    color:  '#ffd700',
    font:   'bold 16px sans-serif',
    letterSpacing: '1px',
  });
  header.appendChild(title);
  panel.appendChild(header);


  // Active Events section
  const { section: activeSection, body: activeBody } = makeSection('Active Events', 'No active events right now.');
  panel.appendChild(activeSection);

  // Past Events section
  const { section: pastSection, body: pastBody } = makeSection('Past Events', 'No events have occurred yet.');
  panel.appendChild(pastSection);


  function update(activeEvents = [], pastEvents = [], cropInventory = new Map()) {
    function renderActive(body, events, emptyText) {
      body.innerHTML = '';
      if (!events || events.length === 0) {
        body.textContent = emptyText;
        return;
      }
      events.forEach(evt => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          padding:      '12px 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display:      'flex',
          flexDirection:'column',
          gap:          '6px',
        });

        // Quest giver with icon
        const giverRow = document.createElement('div');
        giverRow.style.display = 'flex';
        giverRow.style.alignItems = 'center';
        const icon = document.createElement('span');
        if (evt.questGiver && evt.questGiver.icon) {
          // Render icon from tileset if available, else fallback
          icon.textContent = '';
          icon.style.display = 'inline-block';
          icon.style.width = '24px';
          icon.style.height = '24px';
          icon.style.background = `url('Assets/Tilesets/IdleEcologistMasterSpriteSheet.png')`;
          icon.style.backgroundPosition = `-${16 * ((evt.questGiver.icon - 1) % 125)}px -${16 * (Math.floor((evt.questGiver.icon - 1) / 125))}px`;
          icon.style.backgroundSize = '2000px 1568px';
        } else {
          icon.textContent = '👤';
          icon.style.fontSize = '20px';
        }
        giverRow.appendChild(icon);
        const giverName = document.createElement('span');
        giverName.textContent = evt.questGiver?.name || 'Unknown';
        giverName.style.marginLeft = '8px';
        giverName.style.color = '#ffd700';
        giverName.style.fontWeight = 'bold';
        giverRow.appendChild(giverName);
        row.appendChild(giverRow);

        // Dialog + decorative sprite
        const dialogRow = document.createElement('div');
        Object.assign(dialogRow.style, {
          display:    'flex',
          alignItems: 'center',
          gap:        '10px',
          margin:     '4px 0 0 32px',
        });
        const dialog = document.createElement('div');
        dialog.textContent = evt.questDialog || '';
        dialog.style.color = '#e8e8e8';
        dialog.style.flex  = '1';
        dialogRow.appendChild(makeTileSprite(1023, 32));
        dialogRow.appendChild(dialog);
        row.appendChild(dialogRow);

        // Reward
        const reward = document.createElement('div');
        reward.textContent = `Reward: ${evt.reward?.gold ?? 0} gold`;
        reward.style.color = '#b6ffb6';
        reward.style.margin = '4px 0 0 32px';
        row.appendChild(reward);

        // Give Items button
        const btn = document.createElement('button');
        btn.textContent = `Give ${evt.quest?.cropAmount ?? 0} ${evt.quest?.cropType ?? ''}`;
        btn.style.margin = '8px 0 0 32px';
        btn.disabled = !evt.quest || (cropInventory.get(evt.quest.cropType) ?? 0) < (evt.quest.cropAmount ?? 0);
        btn.onclick = () => evt.onComplete && evt.onComplete(evt);
        row.appendChild(btn);

        body.appendChild(row);
      });
    }

    function renderPast(body, events, emptyText) {
      body.innerHTML = '';
      if (!events || events.length === 0) {
        body.textContent = emptyText;
        return;
      }
      events.forEach(evt => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          padding:      '12px 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display:      'flex',
          flexDirection:'column',
          gap:          '6px',
        });
        // Quest giver with icon
        const giverRow = document.createElement('div');
        giverRow.style.display = 'flex';
        giverRow.style.alignItems = 'center';
        const icon = document.createElement('span');
        if (evt.questGiver && evt.questGiver.icon) {
          icon.textContent = '';
          icon.style.display = 'inline-block';
          icon.style.width = '24px';
          icon.style.height = '24px';
          icon.style.background = `url('Assets/Tilesets/IdleEcologistMasterSpriteSheet.png')`;
          icon.style.backgroundPosition = `-${16 * ((evt.questGiver.icon - 1) % 125)}px -${16 * (Math.floor((evt.questGiver.icon - 1) / 125))}px`;
          icon.style.backgroundSize = '2000px 1568px';
        } else {
          icon.textContent = '👤';
          icon.style.fontSize = '20px';
        }
        giverRow.appendChild(icon);
        const giverName = document.createElement('span');
        giverName.textContent = evt.questGiver?.name || 'Unknown';
        giverName.style.marginLeft = '8px';
        giverName.style.color = '#ffd700';
        giverName.style.fontWeight = 'bold';
        giverRow.appendChild(giverName);
        row.appendChild(giverRow);

        // Dialog + decorative sprite
        const dialogRow = document.createElement('div');
        Object.assign(dialogRow.style, {
          display:    'flex',
          alignItems: 'center',
          gap:        '10px',
          margin:     '4px 0 0 32px',
        });
        const dialog = document.createElement('div');
        dialog.textContent = evt.questDialog || '';
        dialog.style.color = '#e8e8e8';
        dialog.style.flex  = '1';
        dialogRow.appendChild(makeTileSprite(1023, 32));
        dialogRow.appendChild(dialog);
        row.appendChild(dialogRow);

        // Reward
        const reward = document.createElement('div');
        reward.textContent = `Reward: ${evt.reward?.gold ?? 0} gold`;
        reward.style.color = '#b6ffb6';
        reward.style.margin = '4px 0 0 32px';
        row.appendChild(reward);

        body.appendChild(row);
      });
    }

    renderActive(activeBody, activeEvents, 'No active events right now.');
    renderPast(pastBody, pastEvents, 'No events have occurred yet.');
  }

  function show() { panel.style.display = 'block'; }
  function hide() { panel.style.display = 'none'; }

  return { panel, show, hide, update };
}
