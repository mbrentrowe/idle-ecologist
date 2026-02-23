// playerAnimator.js â€” Sprite animation state machine for the player character
//
// SPRITE SHEET
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Source:  public/Assets/Characters/Farmer/playerSpriteSheet.png
// Size:    800 Ã— 96 px
// Frame:   32 Ã— 32 px  (2Ã—2 tiles at 16 px/tile = "four squares")
// Layout:  25 columns Ã— 3 rows
//
// HOW TO EDIT ANIMATIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â€¢ frameW / frameH in SPRITE_SHEETS  â€” pixel size of one frame in the PNG
// â€¢ In SPRITE_CONFIG, for each action:
//     dirRow      â€” which row (0-based) in the sheet for each direction
//     frameStart  â€” first column index (0-based) for that animation clip
//     frames      â€” how many columns this clip spans
//     fps         â€” playback speed
//
// DIRECTIONS: 0=DOWN  1=UP  2=LEFT  3=RIGHT
//
// SPRITE SHEET COLUMN MAP (0-based):
//   Cols  0– 4  (5 frames) — Shovel
//   Cols  5–10  (6 frames) — Scythe / harvesting
//   Cols 11–16  (6 frames) — Walking
//   Cols 17–24  (8 frames) — Watering crops
//
// ROW MAP (0-based):
//   Row 0 — facing forward  (DOWN)
//   Row 1 — facing backward (UP)
//   Row 2 — facing left / right
//
// FARMING plays three phases in sequence: Shovel → Watering → Scythe

export const DIRS = { DOWN: 0, UP: 1, LEFT: 2, RIGHT: 3 };

export const ACTIONS = {
  IDLE:      'idle',
  WALK:      'walk',
  FARM:      'farm',
  SOCIALIZE: 'socialize',
  SLEEP:     'sleep',
};

// â”€â”€ Sprite sheet registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single sheet for all player animations.
export const SPRITE_SHEETS = {
  player: {
    src:    'Assets/Characters/Farmer/playerSpriteSheet.png',
    frameW: 32,
    frameH: 32,
  },
};

// â”€â”€ Animation config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// displayW / displayH â€” how large the sprite is drawn in world pixels.
//   32Ã—32 = 2Ã—2 tiles at 16 px/tile, matching the "four squares" frame size.

export const SPRITE_CONFIG = {

  [ACTIONS.IDLE]: {
    sheet:      'player',
    displayW:   32, displayH: 32,
    // dirRow: DOWN=0 UP=0 LEFT=1 RIGHT=1  (idle uses walk rows, no separate idle row needed)
    dirRow:     { 0: 0, 1: 0, 2: 1, 3: 1 },
    frameStart: 0,   // columns 0â€“3: idle frames
    frames:     4,
    fps:        4,
    loop:       true,
  },

  [ACTIONS.WALK]: {
    sheet:      'player',
    displayW:   32, displayH: 32,
    // dirRow: DOWN=0 UP=0 LEFT=1 RIGHT=1
    dirRow:     { 0: 0, 1: 0, 2: 1, 3: 1 },
    frameStart: 0,   // columns 0â€“7: walk cycle
    frames:     8,
    fps:        8,
    loop:       true,
  },

  [ACTIONS.FARM]: {
    sheet:      'player',
    displayW:   32, displayH: 32,
    // Row 2 assumed to hold action/farming frames
    dirRow:     { 0: 2, 1: 2, 2: 2, 3: 2 },
    frameStart: 0,
    frames:     8,
    fps:        6,
    loop:       true,
  },

  [ACTIONS.SOCIALIZE]: {
    sheet:      'player',
    displayW:   32, displayH: 32,
    // Use walking frames at slower speed for socializing
    dirRow:     { 0: 0, 1: 1, 2: 2, 3: 2 },
    frameStart: 11,  // cols 11–16 (1-based 12–17)
    frames:     6,
    fps:        3,
    loop:       true,
  },

  [ACTIONS.SLEEP]: {
    sheet:      'player',
    displayW:   32, displayH: 32,
    // Hold first walking frame (facing down) while sleeping
    dirRow:     { 0: 0, 1: 1, 2: 2, 3: 2 },
    frameStart: 11,
    frames:     1,
    fps:        1,
    loop:       false,
  },
};

// â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Load the player sprite sheet and return an animator instance.
 * @returns {Promise<object>} animator
 */
export async function createPlayerAnimator() {
  const images = {};
  await Promise.all(
    Object.entries(SPRITE_SHEETS).map(([key, cfg]) =>
      new Promise(res => {
        const img = new Image();
        img.onload  = () => { images[key] = img; res(); };
        img.onerror = () => { console.warn(`[playerAnimator] Failed to load: ${cfg.src}`); res(); };
        img.src     = cfg.src;
      })
    )
  );

  let action     = ACTIONS.IDLE;
  let dir        = DIRS.DOWN;
  let frame      = 0;
  let frameTimer = 0;
  let phaseIndex = 0;   // index into cfg.phases[] for multi-phase actions (e.g. FARM)

  /**
   * Determine direction from a (dx, dy) movement delta.
   * Returns the dominant-axis DIRS constant.
   */
  function dirFromDelta(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? DIRS.RIGHT : DIRS.LEFT;
    }
    return dy >= 0 ? DIRS.DOWN : DIRS.UP;
  }

  /**
   * Advance the animation state.
   * @param {number} dt        â€” delta time in seconds
   * @param {string} newAction â€” one of ACTIONS.*
   * @param {number|null} newDir â€” one of DIRS.* or null to keep current
   */
  function update(dt, newAction, newDir = null) {
    if (newAction !== action) {
      action     = newAction;
      phaseIndex = 0;
      const cfg0 = SPRITE_CONFIG[action];
      frame      = cfg0.phases ? cfg0.phases[0].frameStart : cfg0.frameStart;
      frameTimer = 0;
    }
    if (newDir !== null && newDir !== dir) {
      dir = newDir;
    }

    const cfg      = SPRITE_CONFIG[action];
    frameTimer    += dt;
    const frameDur  = 1 / cfg.fps;

    if (cfg.phases) {
      // Multi-phase animation: advance frame within current phase, then roll to next phase
      while (frameTimer >= frameDur) {
        frameTimer -= frameDur;
        const phase    = cfg.phases[phaseIndex];
        const nextFrame = frame + 1;
        if (nextFrame >= phase.frameStart + phase.frames) {
          // End of this phase — advance to the next (wrapping to repeat the sequence)
          phaseIndex = (phaseIndex + 1) % cfg.phases.length;
          frame      = cfg.phases[phaseIndex].frameStart;
        } else {
          frame = nextFrame;
        }
      }
    } else {
      while (frameTimer >= frameDur) {
        frameTimer -= frameDur;
        if (cfg.loop) {
          frame = cfg.frameStart + ((frame - cfg.frameStart + 1) % cfg.frames);
        } else {
          frame = Math.min(frame + 1, cfg.frameStart + cfg.frames - 1);
        }
      }
    }
  }

  /**
   * Draw the character centred at (worldX, worldY).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} worldX
   * @param {number} worldY
   */
  function draw(ctx, worldX, worldY) {
    const cfg   = SPRITE_CONFIG[action];
    const sheet = SPRITE_SHEETS[cfg.sheet];
    const img   = images[cfg.sheet];
    if (!img) return;

    const row = cfg.dirRow[dir] ?? 0;
    const sx  = frame  * sheet.frameW;
    const sy  = row    * sheet.frameH;
    const dx  = Math.round(worldX - cfg.displayW / 2);
    const dy  = Math.round(worldY - cfg.displayH / 2);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, sheet.frameW, sheet.frameH, dx, dy, cfg.displayW, cfg.displayH);
  }

  return {
    update,
    draw,
    dirFromDelta,
    setAction: (a) => {
      if (a !== action) {
        action     = a;
        phaseIndex = 0;
        const cfg0 = SPRITE_CONFIG[a];
        frame      = cfg0.phases ? cfg0.phases[0].frameStart : cfg0.frameStart;
        frameTimer = 0;
      }
    },
    setDir:    (d) => { dir   = d; },
    getAction: ()  => action,
    getDir:    ()  => dir,
    DIRS,
    ACTIONS,
  };
}
