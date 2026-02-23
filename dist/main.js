"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const phaser_1 = __importDefault(require("phaser"));
const GameBoardScene_1 = require("./GameBoardScene");
const config = {
    type: phaser_1.default.AUTO,
    width: 800,
    height: 600,
    scene: GameBoardScene_1.GameBoardScene,
    parent: undefined,
    backgroundColor: '#222222',
};
new phaser_1.default.Game(config);
