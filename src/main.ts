import Phaser from 'phaser';
import { GameBoardScene } from './GameBoardScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: GameBoardScene,
  parent: undefined,
  backgroundColor: '#222222',
};

new Phaser.Game(config);
