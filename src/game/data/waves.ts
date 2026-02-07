import type { EnemyId } from './enemies';

export interface WaveGroup {
  enemyId: EnemyId;
  count: number;
  spawnIntervalMs: number;
}

export interface WaveDefinition {
  groups: WaveGroup[];
}

export const waves: WaveDefinition[] = [
  {
    groups: [
      { enemyId: 'scout', count: 10, spawnIntervalMs: 820 },
      { enemyId: 'raider', count: 4, spawnIntervalMs: 980 },
    ],
  },
  {
    groups: [
      { enemyId: 'scout', count: 12, spawnIntervalMs: 740 },
      { enemyId: 'raider', count: 8, spawnIntervalMs: 920 },
      { enemyId: 'brute', count: 2, spawnIntervalMs: 1400 },
    ],
  },
  {
    groups: [
      { enemyId: 'scout', count: 16, spawnIntervalMs: 650 },
      { enemyId: 'raider', count: 10, spawnIntervalMs: 860 },
      { enemyId: 'brute', count: 4, spawnIntervalMs: 1250 },
    ],
  },
  {
    groups: [
      { enemyId: 'scout', count: 14, spawnIntervalMs: 620 },
      { enemyId: 'raider', count: 14, spawnIntervalMs: 760 },
      { enemyId: 'brute', count: 7, spawnIntervalMs: 1120 },
    ],
  },
  {
    groups: [
      { enemyId: 'scout', count: 18, spawnIntervalMs: 570 },
      { enemyId: 'raider', count: 18, spawnIntervalMs: 690 },
      { enemyId: 'brute', count: 10, spawnIntervalMs: 980 },
    ],
  },
  {
    groups: [
      { enemyId: 'raider', count: 12, spawnIntervalMs: 620 },
      { enemyId: 'brute', count: 8, spawnIntervalMs: 920 },
      { enemyId: 'spoonBoss', count: 1, spawnIntervalMs: 1800 },
    ],
  },
];
