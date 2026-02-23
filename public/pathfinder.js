// pathfinder.js — Walkable-polygon nav grid + A* pathfinding
//
// USAGE
// ─────
// 1. Call buildNavGrid(walkablePolygons, mapW, mapH) once at load time.
//    walkablePolygons: array of arrays of {x, y} world-coordinate points.
//    Returns a nav object passed to findPath().
//
// 2. Call findPath(nav, startX, startY, endX, endY).
//    Returns an array of {x, y} world-coordinate waypoints, or null if
//    no path exists (caller should fall back to direct movement).
//
// CELL SIZE
// ─────────
// The walkable grid uses 16-pixel cells (one Tiled tile).
// Smaller cells = more accurate paths but slower to build.
const CELL = 16;

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Nav grid builder ──────────────────────────────────────────────────────────
/**
 * Rasterise walkable polygons into a uniform grid.
 * @param {Array<Array<{x:number,y:number}>>} polygons  — world-space polygon arrays
 * @param {number} mapW   — total map width  in world pixels
 * @param {number} mapH   — total map height in world pixels
 * @param {number} [cell] — grid cell size in pixels (default 16)
 * @returns {{ grid: Uint8Array, gridW: number, gridH: number, cellSize: number }}
 */
export function buildNavGrid(polygons, mapW, mapH, cell = CELL) {
  const gridW = Math.ceil(mapW / cell);
  const gridH = Math.ceil(mapH / cell);
  const grid  = new Uint8Array(gridW * gridH); // 0 = blocked, 1 = walkable

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      // Test the centre point of this cell
      const wx = gx * cell + cell / 2;
      const wy = gy * cell + cell / 2;
      for (const poly of polygons) {
        if (pointInPolygon(wx, wy, poly)) {
          grid[gy * gridW + gx] = 1;
          break;
        }
      }
    }
  }
  return { grid, gridW, gridH, cellSize: cell };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function isWalkable({ grid, gridW, gridH }, gx, gy) {
  if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return false;
  return grid[gy * gridW + gx] === 1;
}

// Walk a line between two world points and return false if any cell is blocked.
function lineIsWalkable(nav, ax, ay, bx, by) {
  const { cellSize } = nav;
  const dist  = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / (cellSize * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t  = s / steps;
    const wx = ax + (bx - ax) * t;
    const wy = ay + (by - ay) * t;
    if (!isWalkable(nav, Math.floor(wx / cellSize), Math.floor(wy / cellSize))) {
      return false;
    }
  }
  return true;
}

// Convert world coords to grid cell (clamped).
function toCell(wx, wy, nav) {
  return {
    gx: Math.max(0, Math.min(nav.gridW - 1, Math.floor(wx / nav.cellSize))),
    gy: Math.max(0, Math.min(nav.gridH - 1, Math.floor(wy / nav.cellSize))),
  };
}

// Centre world coords of a grid cell.
function cellToWorld(gx, gy, cellSize) {
  return { x: gx * cellSize + cellSize / 2, y: gy * cellSize + cellSize / 2 };
}

// Find the nearest walkable cell to (gx, gy) within radius r.
function nearestWalkable(nav, gx, gy, radius = 10) {
  if (isWalkable(nav, gx, gy)) return { gx, gy };
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isWalkable(nav, gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
      }
    }
  }
  return null;
}

// ── Minimal binary min-heap ────────────────────────────────────────────────────
class MinHeap {
  constructor() { this._d = []; }
  push(f, id) { this._d.push({ f, id }); this._up(this._d.length - 1); }
  pop()  { const t = this._d[0]; const l = this._d.pop(); if (this._d.length) { this._d[0] = l; this._dn(0); } return t; }
  empty(){ return this._d.length === 0; }
  _up(i) { while (i > 0) { const p = (i-1)>>1; if (this._d[i].f < this._d[p].f) { [this._d[i],this._d[p]] = [this._d[p],this._d[i]]; i=p; } else break; } }
  _dn(i) { const n=this._d.length; for(;;){ let m=i,l=2*i+1,r=2*i+2; if(l<n&&this._d[l].f<this._d[m].f)m=l; if(r<n&&this._d[r].f<this._d[m].f)m=r; if(m===i)break; [this._d[i],this._d[m]]=[this._d[m],this._d[i]]; i=m; } }
}

// ── A* pathfinder ─────────────────────────────────────────────────────────────
const DIRS = [
  [1,0,1],[0,1,1],[-1,0,1],[0,-1,1],       // cardinal  (cost 1)
  [1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414], // diagonal (cost √2)
];

/**
 * Find a path between two world positions using the nav grid from buildNavGrid.
 * Returns an array of {x, y} world-coordinate waypoints (smoothed), or null
 * when no path exists within the walkable area.
 * @param {object} nav        — returned by buildNavGrid
 * @param {number} startX/Y   — current player world position
 * @param {number} endX/Y     — destination world position
 */
export function findPath(nav, startX, startY, endX, endY) {
  const { grid, gridW, gridH, cellSize } = nav;

  let sc = toCell(startX, startY, nav);
  let ec = toCell(endX,   endY,   nav);

  // Snap start/end to nearest walkable cell if they land off-grid
  if (!isWalkable(nav, sc.gx, sc.gy)) {
    const n = nearestWalkable(nav, sc.gx, sc.gy);
    if (!n) return null;
    sc = n;
  }
  if (!isWalkable(nav, ec.gx, ec.gy)) {
    const n = nearestWalkable(nav, ec.gx, ec.gy);
    if (!n) return null;
    ec = n;
  }

  // Exact same cell — just move directly
  if (sc.gx === ec.gx && sc.gy === ec.gy) {
    return [{ x: endX, y: endY }];
  }

  const idx  = (gx, gy) => gy * gridW + gx;
  const h    = (gx, gy) => Math.hypot(gx - ec.gx, gy - ec.gy);

  const gScore = new Float32Array(gridW * gridH).fill(Infinity);
  const came   = new Int32Array(gridW * gridH).fill(-1);
  const heap   = new MinHeap();

  const si = idx(sc.gx, sc.gy);
  gScore[si] = 0;
  heap.push(h(sc.gx, sc.gy), si);

  while (!heap.empty()) {
    const { id: ci } = heap.pop();
    const cgx = ci % gridW;
    const cgy = Math.floor(ci / gridW);

    if (cgx === ec.gx && cgy === ec.gy) {
      // Reconstruct
      const path = [];
      let pi = ci;
      while (pi !== -1) {
        path.push(cellToWorld(pi % gridW, Math.floor(pi / gridW), cellSize));
        pi = came[pi];
      }
      path.reverse();
      // Exact end position instead of cell centre
      path[path.length - 1] = { x: endX, y: endY };
      return smoothPath(path, nav);
    }

    for (const [ddx, ddy, cost] of DIRS) {
      const nx = cgx + ddx, ny = cgy + ddy;
      if (!isWalkable(nav, nx, ny)) continue;
      // Prevent diagonal clipping through corners
      if (cost > 1 && (!isWalkable(nav, cgx + ddx, cgy) || !isWalkable(nav, cgx, cgy + ddy))) continue;
      const ni  = idx(nx, ny);
      const ng  = gScore[ci] + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni]   = ci;
        heap.push(ng + h(nx, ny), ni);
      }
    }
  }

  return null; // no path found
}

// ── String-pull path smoother ─────────────────────────────────────────────────
function smoothPath(path, nav) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let reach = anchor + 1;
    for (let j = anchor + 2; j < path.length; j++) {
      if (lineIsWalkable(nav, path[anchor].x, path[anchor].y, path[j].x, path[j].y)) {
        reach = j;
      } else {
        break;
      }
    }
    out.push(path[reach]);
    anchor = reach;
  }
  return out;
}
