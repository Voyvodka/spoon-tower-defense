export type TowerId = 'dart' | 'cannon' | 'frost';

export interface TowerDefinition {
  id: TowerId;
  name: string;
  cost: number;
  range: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  projectileColor: number;
  color: number;
  splashRadius: number;
  slowPct: number;
  slowDurationMs: number;
  idleBobbingPx: number;
  firePulseScale: number;
}

export const towers: Record<TowerId, TowerDefinition> = {
  dart: {
    id: 'dart',
    name: 'Fork',
    cost: 90,
    range: 155,
    fireRate: 1.55,
    damage: 19,
    projectileSpeed: 370,
    projectileColor: 0x9bd5ff,
    color: 0x5fa7ff,
    splashRadius: 0,
    slowPct: 0,
    slowDurationMs: 0,
    idleBobbingPx: 2,
    firePulseScale: 1.08,
  },
  cannon: {
    id: 'cannon',
    name: 'Mega Spoon',
    cost: 160,
    range: 138,
    fireRate: 0.74,
    damage: 54,
    projectileSpeed: 255,
    projectileColor: 0xffbe5c,
    color: 0xff8b4a,
    splashRadius: 40,
    slowPct: 0,
    slowDurationMs: 0,
    idleBobbingPx: 1,
    firePulseScale: 1.14,
  },
  frost: {
    id: 'frost',
    name: 'Chopsticks',
    cost: 145,
    range: 148,
    fireRate: 1.1,
    damage: 11,
    projectileSpeed: 310,
    projectileColor: 0xb8f0ff,
    color: 0x88dfff,
    splashRadius: 0,
    slowPct: 0.35,
    slowDurationMs: 1250,
    idleBobbingPx: 3,
    firePulseScale: 1.1,
  },
};

export const towerOrder: TowerId[] = ['dart', 'cannon', 'frost'];
export const startingGold = 260;
