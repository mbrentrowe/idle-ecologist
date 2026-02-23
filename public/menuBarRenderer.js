// menuBarRenderer.js - Draws the tabbed menu bar using tileset GIDs

export function renderMenuBar(ctx, tilesetImage, widthPx, tileSize) {
  // GIDs for each row and column
  const columns = 125; // from tileset
  const tilesAcross = Math.ceil(widthPx / tileSize);
  // Row 1
  for (let i = 0; i < tilesAcross; i++) {
    let gid;
    if (i === 0) gid = 7379;
    else if (i === tilesAcross - 1) gid = 7381;
    else gid = 7380;
    const tileId = gid - 1;
    const sx = (tileId % columns) * tileSize;
    const sy = Math.floor(tileId / columns) * tileSize;
    ctx.drawImage(
      tilesetImage,
      sx, sy, tileSize, tileSize,
      i * tileSize, 0, tileSize, tileSize
    );
  }
  // Row 2
  for (let i = 0; i < tilesAcross; i++) {
    let gid;
    if (i === 0) gid = 7504;
    else if (i === tilesAcross - 1) gid = 7506;
    else gid = 7505;
    const tileId = gid - 1;
    const sx = (tileId % columns) * tileSize;
    const sy = Math.floor(tileId / columns) * tileSize;
    ctx.drawImage(
      tilesetImage,
      sx, sy, tileSize, tileSize,
      i * tileSize, tileSize, tileSize, tileSize
    );
  }
  // Row 3
  for (let i = 0; i < tilesAcross; i++) {
    let gid;
    if (i === 0) gid = 7629;
    else if (i === tilesAcross - 1) gid = 7631;
    else gid = 7630;
    const tileId = gid - 1;
    const sx = (tileId % columns) * tileSize;
    const sy = Math.floor(tileId / columns) * tileSize;
    ctx.drawImage(
      tilesetImage,
      sx, sy, tileSize, tileSize,
      i * tileSize, 2 * tileSize, tileSize, tileSize
    );
  }
}
