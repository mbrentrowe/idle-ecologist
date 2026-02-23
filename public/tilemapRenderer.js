// tilemapRenderer.js - Renders a Tiled map to canvas

// Accept scaleX and scaleY for consistent rendering
// tilesets: array of { firstgid, columns, image } sorted by firstgid DESCENDING
// (so the first entry whose firstgid <= gid is the correct sheet)
export function renderTileLayer(ctx, map, layer, tilesets, viewport, scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0) {
  const { tilewidth, tileheight, width, height } = map;
  const data = layer.data;
  // Calculate visible tile range
  const startCol = Math.floor(viewport.x / tilewidth);
  const endCol = Math.ceil((viewport.x + viewport.width) / tilewidth);
  const startRow = Math.floor(viewport.y / tileheight);
  const endRow = Math.ceil((viewport.y + viewport.height) / tileheight);
  for (let y = startRow; y < endRow && y < height; y++) {
    for (let x = startCol; x < endCol && x < width; x++) {
      const tileIndex = y * width + x;
      const gid = data[tileIndex];
      if (gid === 0) continue;
      // Find the tileset whose firstgid is <= this gid (tilesets sorted desc)
      const ts = tilesets.find(t => gid >= t.firstgid);
      if (!ts || !ts.image) continue;
      const tileId = gid - ts.firstgid;
      const sx = (tileId % ts.columns) * tilewidth;
      const sy = Math.floor(tileId / ts.columns) * tileheight;
      ctx.drawImage(
        ts.image,
        sx, sy, tilewidth, tileheight,
        Math.round(x * tilewidth * scaleX + offsetX),
        Math.round(y * tileheight * scaleY + offsetY),
        Math.round(tilewidth * scaleX),
        Math.round(tileheight * scaleY)
      );
    }
  }
}
