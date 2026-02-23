"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameBoardScene = void 0;
const phaser_1 = __importDefault(require("phaser"));
class GameBoardScene extends phaser_1.default.Scene {
    constructor() {
        super('GameBoard');
    }
    preload() {
        // Load the Tiled map (JSON)
        this.load.tilemapTiledJSON('gameMap', '../IdleEcologistPrototype.tmj');
        // Load the tileset image with the correct key
        this.load.image('IdleEcologistMasterSpriteSheet', '../Assets/Tilesets/IdleEcologistMasterSpriteSheet.png');
    }
    create() {
        // Create the map
        const map = this.make.tilemap({ key: 'gameMap' });
        // Add the tileset image using the correct key
        const tileset = map.addTilesetImage('IdleEcologistMasterSpriteSheet', 'IdleEcologistMasterSpriteSheet');
        if (!tileset) {
            console.error('Tileset is null. Debug info:');
            console.log('Tileset name used:', 'IdleEcologistMasterSpriteSheet');
            console.log('Tileset image key used:', 'IdleEcologistMasterSpriteSheet');
            console.log('Available tilesets:', map.tilesets.map(ts => ts.name));
            return;
        }
        // Create layers
        map.layers.forEach(layer => {
            map.createLayer(layer.name, tileset, 0, 0);
        });
    }
}
exports.GameBoardScene = GameBoardScene;
