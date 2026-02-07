import Phaser from 'phaser';

import { enemies, type EnemyDefinition, type EnemyId } from '../data/enemies';
import {
  startingGold,
  towerOrder,
  towers,
  type TowerDefinition,
  type TowerId,
} from '../data/towers';
import { waves } from '../data/waves';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const GRID_COLS = 14;
const GRID_ROWS = 9;

const ISO_TILE_WIDTH = 96;
const ISO_TILE_HEIGHT = 56;
const ISO_ORIGIN_X = GAME_WIDTH / 2;
const ISO_ORIGIN_Y = 128;

const BASE_HEALTH_START = 20;
const UI_DEPTH = 5000;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.7;

const ISO_GRASS_TEXTURE_KEY = 'iso-grass';
const ISO_ROAD_TEXTURE_KEY = 'iso-road';
const ISO_CROSSROAD_TEXTURE_KEY = 'iso-crossroad';
const ISO_TREE_TEXTURE_KEY = 'iso-tree';

const PROJECTILE_TEXTURE_KEY = 'projectile-star';
const HIT_TEXTURE_KEY = 'hit-spark';

const towerTextureKeyById: Record<TowerId, string> = {
  dart: 'tower-dart-iso',
  cannon: 'tower-cannon-iso',
  frost: 'tower-frost-iso',
};

const enemyTextureKeyById: Record<EnemyId, string> = {
  scout: 'enemy-scout-iso',
  raider: 'enemy-raider-iso',
  brute: 'enemy-brute-iso',
  spoonBoss: 'enemy-spoon-boss',
};

interface GridTile {
  col: number;
  row: number;
}

interface PendingSpawn {
  enemyId: EnemyId;
  delayMs: number;
}

interface BossRuntime {
  nextVortexAt: number;
  nextSlamAt: number;
  nextSplinterAt: number;
}

interface EnemyInstance {
  def: EnemyDefinition;
  hp: number;
  sprite: Phaser.GameObjects.Image;
  hpBack: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  waypointIndex: number;
  gridX: number;
  gridY: number;
  slowFactor: number;
  slowUntil: number;
  bossRuntime?: BossRuntime;
}

interface TowerInstance {
  def: TowerDefinition;
  tileCol: number;
  tileRow: number;
  gridX: number;
  gridY: number;
  body: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  cooldownMs: number;
  disabledUntil: number;
}

interface ProjectileInstance {
  sprite: Phaser.GameObjects.Image;
  target: EnemyInstance | null;
  damage: number;
  speed: number;
  splashRadius: number;
  slowPct: number;
  slowDurationMs: number;
}

interface BossVortex {
  x: number;
  y: number;
  radius: number;
  endAt: number;
  nextTickAt: number;
  ring: Phaser.GameObjects.Arc;
}

interface UiBar {
  back: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
  width: number;
  height: number;
}

interface UIButton {
  bg: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  normalKey: string;
  pressedKey: string;
  disabledKey: string;
  enabled: boolean;
  width: number;
  height: number;
  onPress: () => void;
}

interface TowerButton {
  id: TowerId;
  button: UIButton;
}

export class GameScene extends Phaser.Scene {
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  private pathTileKeys = new Set<string>();
  private occupiedTileKeys = new Set<string>();
  private waypoints: Phaser.Math.Vector2[] = [];

  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private uiObjects: Phaser.GameObjects.GameObject[] = [];

  private enemies: EnemyInstance[] = [];
  private towers: TowerInstance[] = [];
  private projectiles: ProjectileInstance[] = [];
  private pendingSpawns: PendingSpawn[] = [];
  private bossVortexes: BossVortex[] = [];

  private spawnCooldownMs = 0;
  private waveInProgress = false;
  private currentWaveIndex = -1;

  private gold = startingGold;
  private baseHealth = BASE_HEALTH_START;
  private selectedTowerId: TowerId = towerOrder[0];
  private gameEnded = false;
  private speedMultiplier = 1;
  private cameraZoom = 1;

  private goldText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private zoomText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;

  private waveButton!: UIButton;
  private zoomInButton!: UIButton;
  private zoomOutButton!: UIButton;
  private towerButtons: TowerButton[] = [];

  private hpBar!: UiBar;
  private bossBar!: UiBar;

  private hoverTile!: Phaser.GameObjects.Image;
  private rangePreviewGraphics!: Phaser.GameObjects.Graphics;

  private messageTimer?: Phaser.Time.TimerEvent;
  private lastHitSfxAt = 0;

  public constructor() {
    super('GameScene');
  }

  public preload(): void {
    this.load.image(ISO_GRASS_TEXTURE_KEY, 'assets/images/iso/tile_grass.png');
    this.load.image(ISO_ROAD_TEXTURE_KEY, 'assets/images/iso/tile_road.png');
    this.load.image(ISO_CROSSROAD_TEXTURE_KEY, 'assets/images/iso/tile_crossroad.png');
    this.load.image(ISO_TREE_TEXTURE_KEY, 'assets/images/iso/deco_tree.png');

    this.load.image('tower-dart-iso', 'assets/images/entities/tower_dart_iso.png');
    this.load.image('tower-cannon-iso', 'assets/images/entities/tower_cannon_iso.png');
    this.load.image('tower-frost-iso', 'assets/images/entities/tower_frost_iso.png');

    this.load.image('enemy-scout-iso', 'assets/images/entities/enemy_scout_iso.png');
    this.load.image('enemy-raider-iso', 'assets/images/entities/enemy_raider_iso.png');
    this.load.image('enemy-brute-iso', 'assets/images/entities/enemy_brute_iso.png');
    this.load.image('enemy-spoon-boss', 'assets/images/entities/enemy_spoon_boss.png');

    this.load.image(PROJECTILE_TEXTURE_KEY, 'assets/images/projectile_star.png');
    this.load.image(HIT_TEXTURE_KEY, 'assets/images/hit_spark.png');

    this.load.image('ui-panel-main', 'assets/images/ui/panel_main.png');
    this.load.image('ui-panel-alt', 'assets/images/ui/panel_alt.png');
    this.load.image('ui-button-green', 'assets/images/ui/button_green.png');
    this.load.image('ui-button-green-pressed', 'assets/images/ui/button_green_pressed.png');
    this.load.image('ui-button-blue', 'assets/images/ui/button_blue.png');
    this.load.image('ui-button-blue-pressed', 'assets/images/ui/button_blue_pressed.png');
    this.load.image('ui-button-disabled', 'assets/images/ui/button_disabled.png');
    this.load.image('ui-bar-back', 'assets/images/ui/bar_back.png');
    this.load.image('ui-bar-fill', 'assets/images/ui/bar_fill.png');
    this.load.image('ui-icon-play', 'assets/images/ui/icon_play.png');
    this.load.image('ui-icon-zoom-in', 'assets/images/ui/icon_zoom_in.png');
    this.load.image('ui-icon-zoom-out', 'assets/images/ui/icon_zoom_out.png');

    this.load.audio('sfx-place', 'assets/audio/pick_cutlery_01.ogg');
    this.load.audio('sfx-hit', 'assets/audio/drop_cutlery_01.ogg');
  }

  public create(): void {
    this.resetState();
    this.drawBackground();
    this.buildPath();
    this.drawBoard();
    this.createPlacementPreview();
    this.createHud();
    this.setupCameras();
    this.registerInputs();
    this.setZoom(1);
    this.refreshHud();
    this.showMessage('Isometric spoon defense hazir. SPACE ile dalga baslat.', 2600);
  }

  public update(_time: number, delta: number): void {
    if (this.gameEnded) {
      return;
    }

    const scaledDelta = delta * this.speedMultiplier;
    this.updateSpawning(scaledDelta);
    this.updateEnemies(scaledDelta);
    this.updateBossVortexes();
    this.updateTowers(scaledDelta);
    this.updateProjectiles(scaledDelta);
    this.checkWaveState();
    this.refreshHud();
  }

  private resetState(): void {
    this.pathTileKeys.clear();
    this.occupiedTileKeys.clear();
    this.waypoints = [];
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.pendingSpawns = [];
    this.bossVortexes = [];

    this.spawnCooldownMs = 0;
    this.waveInProgress = false;
    this.currentWaveIndex = -1;

    this.gold = startingGold;
    this.baseHealth = BASE_HEALTH_START;
    this.selectedTowerId = towerOrder[0];
    this.gameEnded = false;
    this.speedMultiplier = 1;
    this.cameraZoom = 1;

    this.lastHitSfxAt = 0;
  }

  private drawBackground(): void {
    const bg = this.trackWorld(this.add.graphics());
    bg.fillGradientStyle(0x102034, 0x202f4a, 0x2a2037, 0x4b2d2d, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const accents = this.trackWorld(this.add.graphics());
    accents.fillStyle(0x8cd7ff, 0.11);
    accents.fillCircle(150, 120, 200);
    accents.fillStyle(0xffcb8d, 0.09);
    accents.fillCircle(1120, 600, 240);
  }

  private buildPath(): void {
    const tiles: GridTile[] = [];

    this.appendPathSegment(tiles, { col: 0, row: 4 }, { col: 3, row: 4 });
    this.appendPathSegment(tiles, { col: 3, row: 4 }, { col: 3, row: 1 });
    this.appendPathSegment(tiles, { col: 3, row: 1 }, { col: 8, row: 1 });
    this.appendPathSegment(tiles, { col: 8, row: 1 }, { col: 8, row: 6 });
    this.appendPathSegment(tiles, { col: 8, row: 6 }, { col: 13, row: 6 });

    this.pathTileKeys.clear();
    this.waypoints = [];

    for (const tile of tiles) {
      this.pathTileKeys.add(this.tileKey(tile.col, tile.row));
      this.waypoints.push(new Phaser.Math.Vector2(tile.col + 0.5, tile.row + 0.5));
    }
  }

  private appendPathSegment(tiles: GridTile[], from: GridTile, to: GridTile): void {
    const stepCol = Math.sign(to.col - from.col);
    const stepRow = Math.sign(to.row - from.row);
    let col = from.col;
    let row = from.row;

    if (tiles.length === 0 || tiles[tiles.length - 1].col !== col || tiles[tiles.length - 1].row !== row) {
      tiles.push({ col, row });
    }

    while (col !== to.col || row !== to.row) {
      if (col !== to.col) {
        col += stepCol;
      }
      if (row !== to.row) {
        row += stepRow;
      }
      tiles.push({ col, row });
    }
  }

  private drawBoard(): void {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const center = this.gridToScreen(col + 0.5, row + 0.5);
        const key = this.tileKey(col, row);
        const isPath = this.pathTileKeys.has(key);
        const isTurn = isPath && this.isPathTurn(col, row);

        const tileTexture = isPath ? (isTurn ? ISO_CROSSROAD_TEXTURE_KEY : ISO_ROAD_TEXTURE_KEY) : ISO_GRASS_TEXTURE_KEY;
        const tile = this.trackWorld(this.add.image(center.x, center.y, tileTexture));
        tile.setDisplaySize(ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
        tile.setDepth(center.y);
        if (!isPath) {
          tile.setTint((col + row) % 2 === 0 ? 0xc9f0c7 : 0xbce7b8);
        } else {
          tile.setTint(0xf7f2e6);
        }

        if (!isPath && (col + row) % 11 === 0 && row > 1) {
          const tree = this.trackWorld(this.add.image(center.x, center.y - 18, ISO_TREE_TEXTURE_KEY));
          tree.setDisplaySize(44, 44);
          tree.setDepth(center.y + 16);
          tree.setAlpha(0.28);
        }
      }
    }
  }

  private isPathTurn(col: number, row: number): boolean {
    const left = this.hasPathAt(col - 1, row);
    const right = this.hasPathAt(col + 1, row);
    const up = this.hasPathAt(col, row - 1);
    const down = this.hasPathAt(col, row + 1);
    const horizontal = left || right;
    const vertical = up || down;
    return horizontal && vertical;
  }

  private hasPathAt(col: number, row: number): boolean {
    if (!this.isInsideGrid(col, row)) {
      return false;
    }
    return this.pathTileKeys.has(this.tileKey(col, row));
  }

  private createPlacementPreview(): void {
    this.hoverTile = this.trackWorld(
      this.add
      .image(0, 0, ISO_CROSSROAD_TEXTURE_KEY)
      .setDisplaySize(ISO_TILE_WIDTH, ISO_TILE_HEIGHT)
      .setAlpha(0.42)
      .setVisible(false)
      .setDepth(2100),
    );

    this.rangePreviewGraphics = this.trackWorld(this.add.graphics().setDepth(2050));
  }

  private createHud(): void {
    const panelTop = this.trackUi(this.add
      .image(GAME_WIDTH / 2, 42, 'ui-panel-main')
      .setDisplaySize(1220, 84)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH));
    panelTop.setAlpha(0.96);

    const panelBottom = this.trackUi(this.add
      .image(GAME_WIDTH / 2, 678, 'ui-panel-alt')
      .setDisplaySize(1220, 74)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH));
    panelBottom.setAlpha(0.95);

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Kenney Future", "Space Grotesk", sans-serif',
      fontSize: '20px',
      color: '#eef6ff',
      stroke: '#10213a',
      strokeThickness: 2,
    };

    this.goldText = this.trackUi(this.add.text(84, 26, '', textStyle).setScrollFactor(0).setDepth(UI_DEPTH + 3));
    this.healthText = this.trackUi(this.add.text(252, 26, '', textStyle).setScrollFactor(0).setDepth(UI_DEPTH + 3));
    this.waveText = this.trackUi(this.add.text(434, 26, '', textStyle).setScrollFactor(0).setDepth(UI_DEPTH + 3));
    this.speedText = this.trackUi(this.add.text(628, 26, '', textStyle).setScrollFactor(0).setDepth(UI_DEPTH + 3));
    this.zoomText = this.trackUi(this.add.text(778, 26, '', textStyle).setScrollFactor(0).setDepth(UI_DEPTH + 3));

    this.hpBar = this.createUiBar(106, 53, 170, 14);
    this.bossBar = this.createUiBar(640, 95, 360, 12);
    this.setBarVisible(this.bossBar, false);

    this.bossText = this.trackUi(this.add
      .text(640, 80, '', {
        fontFamily: '"Kenney Future Narrow", "Kenney Future", sans-serif',
        fontSize: '18px',
        color: '#ffe6c3',
        stroke: '#261525',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 3)
      .setVisible(false));

    this.waveButton = this.createImageButton({
      x: 1088,
      y: 42,
      width: 236,
      height: 62,
      normalKey: 'ui-button-green',
      pressedKey: 'ui-button-green-pressed',
      disabledKey: 'ui-button-disabled',
      labelText: 'SPACE DALGA',
      iconKey: 'ui-icon-play',
      onPress: () => this.startNextWave(),
    });

    this.zoomInButton = this.createImageButton({
      x: 955,
      y: 42,
      width: 72,
      height: 54,
      normalKey: 'ui-button-blue',
      pressedKey: 'ui-button-blue-pressed',
      disabledKey: 'ui-button-disabled',
      iconKey: 'ui-icon-zoom-in',
      onPress: () => this.setZoom(this.cameraZoom + 0.1),
    });

    this.zoomOutButton = this.createImageButton({
      x: 885,
      y: 42,
      width: 72,
      height: 54,
      normalKey: 'ui-button-blue',
      pressedKey: 'ui-button-blue-pressed',
      disabledKey: 'ui-button-disabled',
      iconKey: 'ui-icon-zoom-out',
      onPress: () => this.setZoom(this.cameraZoom - 0.1),
    });

    this.messageText = this.trackUi(this.add
      .text(GAME_WIDTH / 2, 132, '', {
        fontFamily: '"Kenney Future", "Space Grotesk", sans-serif',
        fontSize: '24px',
        color: '#ffe8c8',
        stroke: '#1b1120',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 10));

    this.helpText = this.trackUi(this.add
      .text(
        84,
        632,
        'Kule 1/2/3  SolTik kur  SPACE dalga  F hiz  +/- zoom  Fare teker zoom  R restart',
        {
          fontFamily: '"Kenney Future Narrow", "Kenney Future", sans-serif',
          fontSize: '17px',
          color: '#e5f1ff',
          stroke: '#11253f',
          strokeThickness: 2,
        },
      )
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 3));

    this.towerButtons = [];
    for (let index = 0; index < towerOrder.length; index += 1) {
      const towerId = towerOrder[index];
      const def = towers[towerId];
      const x = 228 + index * 266;
      const y = 678;

      const button = this.createImageButton({
        x,
        y,
        width: 248,
        height: 62,
        normalKey: 'ui-button-blue',
        pressedKey: 'ui-button-blue-pressed',
        disabledKey: 'ui-button-disabled',
        labelText: `${index + 1} ${def.name} ${def.cost}`,
        onPress: () => this.selectTower(towerId),
      });

      const icon = this.trackUi(this.add
        .image(x - 94, y, towerTextureKeyById[towerId])
        .setDisplaySize(40, 40)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 4));

      button.icon = icon;
      this.towerButtons.push({ id: towerId, button });
    }

    this.refreshTowerButtons();
  }

  private createUiBar(x: number, y: number, width: number, height: number): UiBar {
    const back = this.trackUi(this.add
      .image(x, y, 'ui-bar-back')
      .setOrigin(0, 0.5)
      .setDisplaySize(width, height)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 2));

    const fill = this.trackUi(this.add
      .image(x, y, 'ui-bar-fill')
      .setOrigin(0, 0.5)
      .setDisplaySize(width, height)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 3));

    return { back, fill, width, height };
  }

  private setBarValue(bar: UiBar, ratio: number): void {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    bar.fill.displayWidth = Math.max(0.01, bar.width * clamped);
    bar.fill.displayHeight = bar.height;
  }

  private setBarVisible(bar: UiBar, visible: boolean): void {
    bar.back.setVisible(visible);
    bar.fill.setVisible(visible);
  }

  private createImageButton(options: {
    x: number;
    y: number;
    width: number;
    height: number;
    normalKey: string;
    pressedKey: string;
    disabledKey: string;
    labelText?: string;
    iconKey?: string;
    onPress: () => void;
  }): UIButton {
    const bg = this.trackUi(this.add
      .image(options.x, options.y, options.normalKey)
      .setDisplaySize(options.width, options.height)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 2)
      .setInteractive({ useHandCursor: true }));

    const label = options.labelText
        ? this.trackUi(this.add
          .text(options.x + (options.iconKey ? 10 : 0), options.y, options.labelText, {
            fontFamily: '"Kenney Future Narrow", "Kenney Future", sans-serif',
            fontSize: '20px',
            color: '#f3f8ff',
            stroke: '#11253f',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(UI_DEPTH + 3))
      : undefined;

    const icon = options.iconKey
      ? this.trackUi(this.add
          .image(options.x - options.width / 2 + 24, options.y, options.iconKey)
          .setDisplaySize(18, 18)
          .setScrollFactor(0)
          .setDepth(UI_DEPTH + 4))
      : undefined;

    const button: UIButton = {
      bg,
      label,
      icon,
      normalKey: options.normalKey,
      pressedKey: options.pressedKey,
      disabledKey: options.disabledKey,
      enabled: true,
      width: options.width,
      height: options.height,
      onPress: options.onPress,
    };

    const applyTexture = (textureKey: string): void => {
      button.bg.setTexture(textureKey);
      button.bg.setDisplaySize(button.width, button.height);
    };

    bg.on('pointerover', () => {
      if (!button.enabled) {
        return;
      }
      bg.setScale(1.03);
    });

    bg.on('pointerout', () => {
      bg.setScale(1);
      if (!button.enabled) {
        return;
      }
      applyTexture(button.normalKey);
    });

    bg.on('pointerdown', () => {
      if (!button.enabled) {
        return;
      }
      applyTexture(button.pressedKey);
      button.onPress();
      this.time.delayedCall(100, () => {
        if (button.enabled) {
          applyTexture(button.normalKey);
        }
      });
    });

    return button;
  }

  private setButtonEnabled(button: UIButton, enabled: boolean): void {
    button.enabled = enabled;
    if (enabled) {
      button.bg.setTexture(button.normalKey);
      button.bg.setDisplaySize(button.width, button.height);
      button.bg.setInteractive({ useHandCursor: true });
      button.bg.setAlpha(1);
      button.label?.setAlpha(1);
      button.icon?.setAlpha(1);
      return;
    }

    button.bg.disableInteractive();
    button.bg.setTexture(button.disabledKey);
    button.bg.setDisplaySize(button.width, button.height);
    button.bg.setAlpha(0.78);
    button.label?.setAlpha(0.7);
    button.icon?.setAlpha(0.7);
  }

  private setButtonVariant(button: UIButton, normalKey: string, pressedKey: string): void {
    button.normalKey = normalKey;
    button.pressedKey = pressedKey;
    button.bg.setTexture(button.enabled ? normalKey : button.disabledKey);
    button.bg.setDisplaySize(button.width, button.height);
  }

  private registerInputs(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updatePlacementPreview(pointer.worldX, pointer.worldY);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) {
        return;
      }
      this.tryPlaceTowerAt(pointer.worldX, pointer.worldY);
    });

    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        this.setZoom(this.cameraZoom - deltaY * 0.0015);
      },
    );

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        this.startNextWave();
        return;
      }
      if (event.code === 'Digit1') {
        this.selectTower(towerOrder[0]);
        return;
      }
      if (event.code === 'Digit2') {
        this.selectTower(towerOrder[1]);
        return;
      }
      if (event.code === 'Digit3') {
        this.selectTower(towerOrder[2]);
        return;
      }
      if (event.code === 'KeyF') {
        this.toggleSpeed();
        return;
      }
      if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        this.setZoom(this.cameraZoom - 0.1);
        return;
      }
      if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        this.setZoom(this.cameraZoom + 0.1);
        return;
      }
      if (event.code === 'KeyR') {
        this.scene.restart();
      }
    });
  }

  private selectTower(towerId: TowerId): void {
    this.selectedTowerId = towerId;
    this.refreshTowerButtons();
  }

  private updatePlacementPreview(worldX: number, worldY: number): void {
    const tile = this.worldToTile(worldX, worldY);
    if (!tile) {
      this.hoverTile.setVisible(false);
      this.rangePreviewGraphics.clear();
      return;
    }

    const screen = this.tileCenterScreen(tile.col, tile.row);
    const canBuild = this.canBuildOnTile(tile.col, tile.row);

    this.hoverTile.setPosition(screen.x, screen.y);
      this.hoverTile.setTint(canBuild ? 0x86d6ff : 0xff9ca0);
    this.hoverTile.setVisible(true);

    const centerGrid = this.tileCenterGrid(tile.col, tile.row);
    const rangeCells = towers[this.selectedTowerId].range / 48;
    this.drawRangePreview(centerGrid.x, centerGrid.y, rangeCells, canBuild);
  }

  private drawRangePreview(centerGridX: number, centerGridY: number, radiusCells: number, canBuild: boolean): void {
    this.rangePreviewGraphics.clear();
    this.rangePreviewGraphics.lineStyle(2, canBuild ? 0x82cbff : 0xff9ca0, 0.8);
    this.rangePreviewGraphics.fillStyle(canBuild ? 0x86d6ff : 0xff9ca0, 0.1);

    for (let index = 0; index <= 28; index += 1) {
      const angle = (index / 28) * Math.PI * 2;
      const gx = centerGridX + Math.cos(angle) * radiusCells;
      const gy = centerGridY + Math.sin(angle) * radiusCells;
      const screen = this.gridToScreen(gx, gy);

      if (index === 0) {
        this.rangePreviewGraphics.beginPath();
        this.rangePreviewGraphics.moveTo(screen.x, screen.y);
      } else {
        this.rangePreviewGraphics.lineTo(screen.x, screen.y);
      }
    }

    this.rangePreviewGraphics.closePath();
    this.rangePreviewGraphics.fillPath();
    this.rangePreviewGraphics.strokePath();
  }

  private tryPlaceTowerAt(worldX: number, worldY: number): void {
    if (this.gameEnded) {
      return;
    }

    const tile = this.worldToTile(worldX, worldY);
    if (!tile) {
      return;
    }

    if (!this.canBuildOnTile(tile.col, tile.row)) {
      this.showMessage('Bu kareye kule kurulamaz.', 900);
      return;
    }

    const towerDef = towers[this.selectedTowerId];
    if (this.gold < towerDef.cost) {
      this.showMessage('Yetersiz altin.', 900);
      return;
    }

    const centerGrid = this.tileCenterGrid(tile.col, tile.row);
    const centerScreen = this.gridToScreen(centerGrid.x, centerGrid.y);

    const shadow = this.trackWorld(this.add.ellipse(0, 8, 42, 16, 0x000000, 0.35));
    const sprite = this.trackWorld(this.add
      .image(0, -18, towerTextureKeyById[this.selectedTowerId])
      .setDisplaySize(66, 66)
      .setTint(towerDef.color));

    const body = this.trackWorld(
      this.add.container(centerScreen.x, centerScreen.y, [shadow, sprite]).setDepth(centerScreen.y + 90),
    );

    this.tweens.add({
      targets: body,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Back.Out',
      from: 0.7,
    });

    this.tweens.add({
      targets: sprite,
      y: sprite.y - towerDef.idleBobbingPx,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.towers.push({
      def: towerDef,
      tileCol: tile.col,
      tileRow: tile.row,
      gridX: centerGrid.x,
      gridY: centerGrid.y,
      body,
      sprite,
      cooldownMs: 140,
      disabledUntil: 0,
    });

    this.occupiedTileKeys.add(this.tileKey(tile.col, tile.row));
    this.gold -= towerDef.cost;

    this.sound.play('sfx-place', {
      volume: 0.34,
      rate: Phaser.Math.FloatBetween(0.93, 1.08),
    });

    this.refreshHud();
    this.refreshTowerButtons();
  }

  private startNextWave(): void {
    if (this.gameEnded || this.waveInProgress) {
      return;
    }

    const nextWaveIndex = this.currentWaveIndex + 1;
    if (nextWaveIndex >= waves.length) {
      this.showMessage('Tum dalgalar tamamlandi.', 1000);
      return;
    }

    this.currentWaveIndex = nextWaveIndex;
    this.waveInProgress = true;
    this.pendingSpawns = [];

    const selectedWave = waves[this.currentWaveIndex];
    for (const group of selectedWave.groups) {
      for (let count = 0; count < group.count; count += 1) {
        this.pendingSpawns.push({ enemyId: group.enemyId, delayMs: group.spawnIntervalMs });
      }
    }

    this.spawnCooldownMs = 0;
    if (this.pendingSpawns.some((spawn) => spawn.enemyId === 'spoonBoss')) {
      this.showMessage('Boss dalgasi geliyor: THE SILVER LADLE!', 2200);
    } else {
      this.showMessage(`Dalga ${this.currentWaveIndex + 1} basladi!`, 1200);
    }
  }

  private updateSpawning(delta: number): void {
    if (!this.waveInProgress || this.pendingSpawns.length === 0) {
      return;
    }

    this.spawnCooldownMs -= delta;
    while (this.pendingSpawns.length > 0 && this.spawnCooldownMs <= 0) {
      const next = this.pendingSpawns.shift();
      if (!next) {
        break;
      }
      this.spawnEnemy(next.enemyId);
      this.spawnCooldownMs += next.delayMs;
    }
  }

  private spawnEnemy(
    enemyId: EnemyId,
    override?: {
      gridX: number;
      gridY: number;
      waypointIndex: number;
    },
  ): void {
    const def = enemies[enemyId];
    const start = this.waypoints[0];

    const gridX = override?.gridX ?? start.x;
    const gridY = override?.gridY ?? start.y;
    const waypointIndex = override?.waypointIndex ?? 1;

    const screen = this.gridToScreen(gridX, gridY);
    const sprite = this.trackWorld(this.add.image(screen.x, screen.y, enemyTextureKeyById[enemyId]).setDepth(screen.y + 120));
    sprite.setOrigin(0.5, 0.86);

    const enemySize = Phaser.Math.Clamp(def.bodyRadius * 4.2 * def.spriteScale + 24, 44, def.isBoss ? 170 : 120);
    sprite.setDisplaySize(enemySize, enemySize);
    sprite.setTint(def.color);

    const hpWidth = enemySize * 0.9;
    const hpBack = this.trackWorld(this.add
      .rectangle(screen.x, screen.y - enemySize * 0.78, hpWidth, 6, 0x1a1223, 0.96)
      .setDepth(screen.y + 150));

    const hpFill = this.trackWorld(this.add
      .rectangle(screen.x - hpWidth / 2, screen.y - enemySize * 0.78, hpWidth, 6, 0x85f29b, 1)
      .setOrigin(0, 0.5)
      .setDepth(screen.y + 151));

    const enemy: EnemyInstance = {
      def,
      hp: def.maxHp,
      sprite,
      hpBack,
      hpFill,
      waypointIndex,
      gridX,
      gridY,
      slowFactor: 1,
      slowUntil: 0,
    };

    if (def.isBoss && def.boss) {
      enemy.bossRuntime = {
        nextVortexAt: this.time.now + 2600,
        nextSlamAt: this.time.now + 4300,
        nextSplinterAt: this.time.now + 6200,
      };
      this.showMessage('Spoon Boss sahada!', 1200);
    }

    this.tweens.add({
      targets: sprite,
      alpha: 1,
      duration: 240,
      ease: 'Quad.Out',
      from: 0,
    });

    this.enemies.push(enemy);
  }

  private updateEnemies(delta: number): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];

      if (enemy.slowUntil <= this.time.now) {
        enemy.slowFactor = 1;
        enemy.sprite.setTint(enemy.def.color);
      }

      const target = this.waypoints[enemy.waypointIndex];
      if (!target) {
        this.handleEnemyLeak(index);
        continue;
      }

      const dx = target.x - enemy.gridX;
      const dy = target.y - enemy.gridY;
      const distance = Math.hypot(dx, dy);
      const speedCells = (enemy.def.speed / 120) * enemy.slowFactor;
      const step = (speedCells * delta) / 1000;

      if (distance <= step) {
        enemy.gridX = target.x;
        enemy.gridY = target.y;
        enemy.waypointIndex += 1;
      } else if (distance > 0) {
        enemy.gridX += (dx / distance) * step;
        enemy.gridY += (dy / distance) * step;
      }

      this.updateEnemyRender(enemy);

      if (enemy.def.isBoss) {
        this.updateBossAbilities(enemy);
      }
    }
  }

  private updateEnemyRender(enemy: EnemyInstance): void {
    const screen = this.gridToScreen(enemy.gridX, enemy.gridY);
    const bob = Math.sin((this.time.now + screen.x * 0.3) / 150) * 1.6;

    enemy.sprite.setPosition(screen.x, screen.y - 8 + bob);
    enemy.sprite.setDepth(screen.y + 120);

    const hpY = enemy.sprite.y - enemy.sprite.displayHeight * 0.72;
    enemy.hpBack.setPosition(screen.x, hpY);
    enemy.hpBack.setDepth(screen.y + 150);
    enemy.hpFill.setPosition(screen.x - enemy.hpBack.width / 2, hpY);
    enemy.hpFill.setDepth(screen.y + 151);
  }

  private updateBossAbilities(enemy: EnemyInstance): void {
    if (!enemy.bossRuntime || !enemy.def.boss) {
      return;
    }

    const now = this.time.now;
    const boss = enemy.def.boss;

    if (now >= enemy.bossRuntime.nextVortexAt) {
      enemy.bossRuntime.nextVortexAt = now + boss.vortexCooldownMs;
      this.castBossVortex(enemy);
    }

    if (now >= enemy.bossRuntime.nextSlamAt) {
      enemy.bossRuntime.nextSlamAt = now + boss.slamCooldownMs;
      this.castBossSlam(enemy);
    }

    if (now >= enemy.bossRuntime.nextSplinterAt) {
      enemy.bossRuntime.nextSplinterAt = now + boss.splinterCooldownMs;
      this.castBossSplinter(enemy);
    }
  }

  private castBossVortex(enemy: EnemyInstance): void {
    const bossCfg = enemy.def.boss;
    if (!bossCfg) {
      return;
    }

    const x = enemy.sprite.x;
    const y = enemy.sprite.y - 8;

    const ring = this.trackWorld(this.add
      .circle(x, y, 18)
      .setStrokeStyle(3, 0x9ce8ff, 0.95)
      .setFillStyle(0x79bbff, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(y + 180));

    this.tweens.add({
      targets: ring,
      radius: bossCfg.vortexRange,
      alpha: 0.25,
      duration: bossCfg.vortexDurationMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
    });

    this.bossVortexes.push({
      x,
      y,
      radius: bossCfg.vortexRange,
      endAt: this.time.now + bossCfg.vortexDurationMs,
      nextTickAt: this.time.now + 200,
      ring,
    });

    this.showMessage('Spoon Boss: Stirring Vortex!', 900);
  }

  private castBossSlam(enemy: EnemyInstance): void {
    const bossCfg = enemy.def.boss;
    if (!bossCfg) {
      return;
    }

    const targetTower = this.getNearestTower(enemy.sprite.x, enemy.sprite.y, bossCfg.slamRange);
    if (!targetTower) {
      return;
    }

    const line = this.trackWorld(this.add.graphics().setDepth(targetTower.body.y + 220));
    line.lineStyle(4, 0xffd39a, 0.96);
    line.beginPath();
    line.moveTo(enemy.sprite.x, enemy.sprite.y - 30);
    line.lineTo(targetTower.body.x, targetTower.body.y - 20);
    line.strokePath();

    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 680,
      ease: 'Quad.Out',
      onComplete: () => {
        line.destroy();
      },
    });

    this.time.delayedCall(520, () => {
      targetTower.disabledUntil = this.time.now + 2200;
      targetTower.cooldownMs = Math.max(targetTower.cooldownMs, 1100);
      this.spawnBossBurst(targetTower.body.x, targetTower.body.y - 10, 0xffb87f);
    });

    this.showMessage('Spoon Boss: Ladle Slam!', 850);
  }

  private castBossSplinter(enemy: EnemyInstance): void {
    const bossCfg = enemy.def.boss;
    if (!bossCfg) {
      return;
    }

    const centerX = enemy.sprite.x;
    const centerY = enemy.sprite.y - 14;

    for (let index = 0; index < bossCfg.splinterCount; index += 1) {
      const angle = (Math.PI * 2 * index) / bossCfg.splinterCount;
      const targetX = centerX + Math.cos(angle) * 96;
      const targetY = centerY + Math.sin(angle) * 56;

      const shard = this.trackWorld(this.add
        .image(centerX, centerY, PROJECTILE_TEXTURE_KEY)
        .setDisplaySize(16, 16)
        .setTint(0xd9ecff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(centerY + 210));

      this.tweens.add({
        targets: shard,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.35,
        rotation: Phaser.Math.FloatBetween(-1.2, 1.2),
        duration: 420,
        ease: 'Quad.Out',
        onComplete: () => {
          shard.destroy();
        },
      });
    }

    const spawnCount = Phaser.Math.Clamp(Math.floor(bossCfg.splinterCount / 2), 2, 4);
    for (let index = 0; index < spawnCount; index += 1) {
      const offsetX = Phaser.Math.FloatBetween(-0.2, 0.2);
      const offsetY = Phaser.Math.FloatBetween(-0.2, 0.2);
      this.spawnEnemy('scout', {
        gridX: enemy.gridX + offsetX,
        gridY: enemy.gridY + offsetY,
        waypointIndex: enemy.waypointIndex,
      });
    }

    this.showMessage('Spoon Boss: Silver Splinter Burst!', 950);
  }

  private updateBossVortexes(): void {
    for (let index = this.bossVortexes.length - 1; index >= 0; index -= 1) {
      const vortex = this.bossVortexes[index];

      if (this.time.now >= vortex.endAt) {
        this.tweens.killTweensOf(vortex.ring);
        vortex.ring.destroy();
        this.bossVortexes.splice(index, 1);
        continue;
      }

      const pulse = 0.95 + Math.sin(this.time.now / 110) * 0.08;
      vortex.ring.setScale(pulse);

      if (this.time.now >= vortex.nextTickAt) {
        vortex.nextTickAt += 220;
        for (const tower of this.towers) {
          const dx = tower.body.x - vortex.x;
          const dy = tower.body.y - vortex.y;
          if (dx * dx + dy * dy <= vortex.radius * vortex.radius) {
            tower.cooldownMs += 280;
            if (Math.random() < 0.3) {
              this.spawnBossBurst(tower.body.x, tower.body.y - 12, 0x8ecbff);
            }
          }
        }
      }
    }
  }

  private spawnBossBurst(x: number, y: number, tint: number): void {
    const burst = this.trackWorld(this.add.image(x, y, HIT_TEXTURE_KEY).setDepth(y + 240));
    burst.setDisplaySize(70, 70);
    burst.setTint(tint);
    burst.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 0.25,
      duration: 240,
      ease: 'Quad.Out',
      onComplete: () => {
        burst.destroy();
      },
    });
  }

  private getNearestTower(worldX: number, worldY: number, rangePx: number): TowerInstance | null {
    let selected: TowerInstance | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const tower of this.towers) {
      const distance = Phaser.Math.Distance.Between(worldX, worldY, tower.body.x, tower.body.y);
      if (distance > rangePx) {
        continue;
      }
      if (distance < bestDist) {
        selected = tower;
        bestDist = distance;
      }
    }

    return selected;
  }

  private handleEnemyLeak(enemyIndex: number): void {
    const enemy = this.enemies[enemyIndex];
    this.baseHealth -= enemy.def.baseDamage;
    this.removeEnemy(enemyIndex);

    if (this.baseHealth <= 0) {
      this.endGame(false);
    }
  }

  private updateTowers(delta: number): void {
    for (const tower of this.towers) {
      if (tower.disabledUntil > this.time.now) {
        tower.body.alpha = 0.46;
        continue;
      }

      const suppression = this.getTowerSuppression(tower.body.x, tower.body.y);
      tower.body.alpha = suppression < 1 ? 0.72 : 1;
      tower.cooldownMs -= delta * suppression;

      if (tower.cooldownMs > 0) {
        continue;
      }

      const target = this.getBestTargetForTower(tower);
      if (!target) {
        continue;
      }

      const angle = Phaser.Math.Angle.Between(tower.body.x, tower.body.y, target.sprite.x, target.sprite.y);
      tower.body.rotation = angle * 0.12;

      this.spawnProjectile(tower, target);
      this.tweens.add({
        targets: tower.sprite,
        scaleX: tower.def.firePulseScale,
        scaleY: tower.def.firePulseScale,
        duration: 90,
        yoyo: true,
        ease: 'Quad.Out',
      });

      tower.cooldownMs = 1000 / tower.def.fireRate;
    }
  }

  private getTowerSuppression(worldX: number, worldY: number): number {
    for (const vortex of this.bossVortexes) {
      const dx = worldX - vortex.x;
      const dy = worldY - vortex.y;
      if (dx * dx + dy * dy <= vortex.radius * vortex.radius) {
        return 0.38;
      }
    }
    return 1;
  }

  private getBestTargetForTower(tower: TowerInstance): EnemyInstance | null {
    let chosen: EnemyInstance | null = null;
    let minRemainingDistance = Number.POSITIVE_INFINITY;
    const rangeCells = (tower.def.range + 16) / 48; // +16px tolerance for isometric feel

    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(tower.gridX, tower.gridY, enemy.gridX, enemy.gridY);
      if (distance > rangeCells) {
        continue;
      }

      const remainingDistance = this.getRemainingDistance(enemy);
      if (remainingDistance < minRemainingDistance) {
        minRemainingDistance = remainingDistance;
        chosen = enemy;
      }
    }

    return chosen;
  }

  private getRemainingDistance(enemy: EnemyInstance): number {
    const nextWaypoint = this.waypoints[enemy.waypointIndex];
    if (!nextWaypoint) {
      return 0;
    }

    let remaining = Phaser.Math.Distance.Between(enemy.gridX, enemy.gridY, nextWaypoint.x, nextWaypoint.y);
    for (let index = enemy.waypointIndex; index < this.waypoints.length - 1; index += 1) {
      remaining += Phaser.Math.Distance.Between(
        this.waypoints[index].x,
        this.waypoints[index].y,
        this.waypoints[index + 1].x,
        this.waypoints[index + 1].y,
      );
    }

    return remaining;
  }

  private spawnProjectile(tower: TowerInstance, target: EnemyInstance): void {
    const sprite = this.trackWorld(this.add
      .image(tower.body.x, tower.body.y - tower.sprite.displayHeight * 0.25, PROJECTILE_TEXTURE_KEY)
      .setDepth(tower.body.y + 130)
      .setBlendMode(Phaser.BlendModes.ADD));
    sprite.setDisplaySize(tower.def.splashRadius > 0 ? 20 : 15, tower.def.splashRadius > 0 ? 20 : 15);
    sprite.setTint(tower.def.projectileColor);

    this.projectiles.push({
      sprite,
      target,
      damage: tower.def.damage,
      speed: tower.def.projectileSpeed,
      splashRadius: tower.def.splashRadius,
      slowPct: tower.def.slowPct,
      slowDurationMs: tower.def.slowDurationMs,
    });
  }

  private updateProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const target = projectile.target;

      if (!target || !target.sprite.active) {
        this.removeProjectile(index);
        continue;
      }

      const dx = target.sprite.x - projectile.sprite.x;
      const dy = target.sprite.y - projectile.sprite.y;
      const distance = Math.hypot(dx, dy);
      const step = (projectile.speed * delta) / 1000;
      projectile.sprite.rotation += 0.28;

      if (distance <= step + 2) {
        this.onProjectileHit(projectile);
        this.removeProjectile(index);
        continue;
      }

      projectile.sprite.x += (dx / distance) * step;
      projectile.sprite.y += (dy / distance) * step;
      projectile.sprite.setDepth(projectile.sprite.y + 160);
    }
  }

  private onProjectileHit(projectile: ProjectileInstance): void {
    this.spawnHitEffect(projectile.sprite.x, projectile.sprite.y);

    if (this.time.now - this.lastHitSfxAt > 90) {
      this.lastHitSfxAt = this.time.now;
      this.sound.play('sfx-hit', {
        volume: 0.24,
        rate: Phaser.Math.FloatBetween(0.9, 1.08),
      });
    }

    if (projectile.splashRadius > 0) {
      const radius = projectile.splashRadius * 1.25;
      const radiusSquared = radius * radius;
      for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = this.enemies[index];
        const dx = enemy.sprite.x - projectile.sprite.x;
        const dy = enemy.sprite.y - projectile.sprite.y;
        if (dx * dx + dy * dy <= radiusSquared) {
          this.applyHit(enemy, projectile.damage, projectile.slowPct, projectile.slowDurationMs);
        }
      }
      return;
    }

    if (projectile.target) {
      this.applyHit(projectile.target, projectile.damage, projectile.slowPct, projectile.slowDurationMs);
    }
  }

  private applyHit(enemy: EnemyInstance, damage: number, slowPct: number, slowDurationMs: number): void {
    if (!enemy.sprite.active) {
      return;
    }

    const reducedDamage = enemy.def.isBoss ? damage * 0.8 : damage;
    enemy.hp -= reducedDamage;

    if (slowPct > 0) {
      const factor = Math.max(0.25, 1 - slowPct);
      enemy.slowFactor = Math.min(enemy.slowFactor, factor);
      enemy.slowUntil = Math.max(enemy.slowUntil, this.time.now + slowDurationMs);
      enemy.sprite.setTint(0x90dcff);
    }

    const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.def.maxHp, 0, 1);
    enemy.hpFill.width = enemy.hpBack.width * hpRatio;

    if (enemy.hp <= 0) {
      const enemyIndex = this.enemies.indexOf(enemy);
      if (enemyIndex >= 0) {
        this.gold += enemy.def.reward;
        if (enemy.def.isBoss) {
          this.showMessage('Spoon Boss dustu! Son savunma kirildi.', 1800);
          this.spawnBossBurst(enemy.sprite.x, enemy.sprite.y - 20, 0xffe7b7);
        }
        this.removeEnemy(enemyIndex);
      }
    }
  }

  private spawnHitEffect(x: number, y: number): void {
    const spark = this.trackWorld(this.add.image(x, y, HIT_TEXTURE_KEY).setDepth(y + 220));
    spark.setTint(0xfff3c7);
    spark.setBlendMode(Phaser.BlendModes.ADD);
    spark.setDisplaySize(48, 48);

    this.tweens.add({
      targets: spark,
      scale: 0.26,
      alpha: 0,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () => {
        spark.destroy();
      },
    });
  }

  private removeEnemy(enemyIndex: number): void {
    const enemy = this.enemies[enemyIndex];
    enemy.sprite.destroy();
    enemy.hpBack.destroy();
    enemy.hpFill.destroy();
    this.enemies.splice(enemyIndex, 1);
  }

  private removeProjectile(projectileIndex: number): void {
    const projectile = this.projectiles[projectileIndex];
    projectile.sprite.destroy();
    this.projectiles.splice(projectileIndex, 1);
  }

  private checkWaveState(): void {
    if (!this.waveInProgress) {
      return;
    }

    if (this.pendingSpawns.length === 0 && this.enemies.length === 0) {
      this.waveInProgress = false;
      if (this.currentWaveIndex >= waves.length - 1) {
        this.endGame(true);
      } else {
        this.showMessage('Dalga temizlendi. SPACE ile devam.', 1500);
      }
    }
  }

  private endGame(win: boolean): void {
    this.gameEnded = true;
    this.waveInProgress = false;

    const resultText = win ? 'Kazandin! Isometric spoon savasi tamamlandi.' : 'Kaybettin! R ile tekrar dene.';
    this.showMessage(resultText);
    this.refreshHud();
  }

  private toggleSpeed(): void {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.refreshHud();
  }

  private setZoom(zoom: number): void {
    this.cameraZoom = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.cameras.main.setZoom(this.cameraZoom);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    if (this.uiCamera) {
      this.uiCamera.setZoom(1);
      this.uiCamera.setScroll(0, 0);
    }
    this.refreshHud();
  }

  private setupCameras(): void {
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT, false, 'ui');
    this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');
    this.uiCamera.setZoom(1);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.ignore(this.worldObjects);
    this.cameras.main.ignore(this.uiObjects);
  }

  private trackWorld<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.worldObjects.push(object);
    if (this.uiCamera) {
      this.uiCamera.ignore(object);
    }
    return object;
  }

  private trackUi<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.uiObjects.push(object);
    this.cameras.main.ignore(object);
    return object;
  }

  private refreshHud(): void {
    this.goldText.setText(`Altin ${Math.floor(this.gold)}`);
    this.healthText.setText(`Us ${Math.max(0, this.baseHealth)}`);

    const waveNumber = this.gameEnded
      ? Math.max(1, this.currentWaveIndex + 1)
      : this.waveInProgress
        ? this.currentWaveIndex + 1
        : Math.min(this.currentWaveIndex + 2, waves.length);
    this.waveText.setText(`Dalga ${waveNumber}/${waves.length}`);

    this.speedText.setText(`Hiz ${this.speedMultiplier}x`);
    this.zoomText.setText(`Zoom ${this.cameraZoom.toFixed(2)}x`);
    this.helpText.setVisible(!this.gameEnded);

    this.setBarValue(this.hpBar, this.baseHealth / BASE_HEALTH_START);

    const boss = this.enemies.find((enemy) => enemy.def.isBoss);
    if (boss) {
      this.setBarVisible(this.bossBar, true);
      this.bossText.setVisible(true);
      this.bossText.setText(`BOSS: ${boss.def.name}`);
      this.setBarValue(this.bossBar, boss.hp / boss.def.maxHp);
    } else {
      this.setBarVisible(this.bossBar, false);
      this.bossText.setVisible(false);
    }

    const canStartWave = !this.gameEnded && !this.waveInProgress && this.currentWaveIndex < waves.length - 1;
    this.setButtonEnabled(this.waveButton, canStartWave);

    this.setButtonEnabled(this.zoomInButton, this.cameraZoom < MAX_ZOOM - 0.01);
    this.setButtonEnabled(this.zoomOutButton, this.cameraZoom > MIN_ZOOM + 0.01);

    this.refreshTowerButtons();
  }

  private refreshTowerButtons(): void {
    for (const towerButton of this.towerButtons) {
      const def = towers[towerButton.id];
      const selected = towerButton.id === this.selectedTowerId;
      const affordable = this.gold >= def.cost;

      if (selected) {
        this.setButtonVariant(towerButton.button, 'ui-button-green', 'ui-button-green-pressed');
      } else {
        this.setButtonVariant(towerButton.button, 'ui-button-blue', 'ui-button-blue-pressed');
      }

      this.setButtonEnabled(towerButton.button, true);
      if (!affordable && !selected) {
        this.setButtonEnabled(towerButton.button, false);
      }

      if (towerButton.button.label) {
        towerButton.button.label.setText(`${def.name} ${def.cost}`);
      }
    }
  }

  private showMessage(text: string, durationMs?: number): void {
    this.messageText.setText(text);

    if (this.messageTimer) {
      this.messageTimer.remove(false);
      this.messageTimer = undefined;
    }

    if (!durationMs) {
      return;
    }

    this.messageTimer = this.time.delayedCall(durationMs, () => {
      this.messageText.setText('');
      this.messageTimer = undefined;
    });
  }

  private worldToTile(worldX: number, worldY: number): GridTile | null {
    const grid = this.screenToGrid(worldX, worldY);
    const col = Math.floor(grid.x);
    const row = Math.floor(grid.y);

    if (!this.isInsideGrid(col, row)) {
      return null;
    }

    return { col, row };
  }

  private tileCenterGrid(col: number, row: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(col + 0.5, row + 0.5);
  }

  private tileCenterScreen(col: number, row: number): Phaser.Math.Vector2 {
    const centerGrid = this.tileCenterGrid(col, row);
    return this.gridToScreen(centerGrid.x, centerGrid.y);
  }

  private gridToScreen(gridX: number, gridY: number): Phaser.Math.Vector2 {
    const x = (gridX - gridY) * (ISO_TILE_WIDTH / 2) + ISO_ORIGIN_X;
    const y = (gridX + gridY) * (ISO_TILE_HEIGHT / 2) + ISO_ORIGIN_Y;
    return new Phaser.Math.Vector2(x, y);
  }

  private screenToGrid(screenX: number, screenY: number): Phaser.Math.Vector2 {
    const dx = screenX - ISO_ORIGIN_X;
    const dy = screenY - ISO_ORIGIN_Y;

    const gridX = (dy / (ISO_TILE_HEIGHT / 2) + dx / (ISO_TILE_WIDTH / 2)) / 2;
    const gridY = (dy / (ISO_TILE_HEIGHT / 2) - dx / (ISO_TILE_WIDTH / 2)) / 2;
    return new Phaser.Math.Vector2(gridX, gridY);
  }

  private canBuildOnTile(col: number, row: number): boolean {
    const key = this.tileKey(col, row);
    return this.isInsideGrid(col, row) && !this.pathTileKeys.has(key) && !this.occupiedTileKeys.has(key);
  }

  private isInsideGrid(col: number, row: number): boolean {
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
  }

  private tileKey(col: number, row: number): string {
    return `${col}:${row}`;
  }
}
