// map.js - Loads and parses the Tiled .tmj map file

export async function loadMap(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load map: ' + url);
  return await response.json();
}
