import Phaser from 'phaser';

import './style.css';
import { GameScene } from './game/scenes/GameScene';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="game-shell">
    <div id="game-root"></div>
  </div>
`;

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1280,
  height: 720,
  backgroundColor: '#060a14',
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(gameConfig);
