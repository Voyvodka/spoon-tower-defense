export type EnemyId = 'scout' | 'raider' | 'brute' | 'spoonBoss';

export interface BossAbilityConfig {
  vortexCooldownMs: number;
  vortexDurationMs: number;
  vortexRange: number;
  slamCooldownMs: number;
  slamRange: number;
  splinterCooldownMs: number;
  splinterCount: number;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  maxHp: number;
  speed: number;
  reward: number;
  baseDamage: number;
  bodyRadius: number;
  color: number;
  spriteScale: number;
  isBoss?: boolean;
  boss?: BossAbilityConfig;
}

export const enemies: Record<EnemyId, EnemyDefinition> = {
  scout: {
    id: 'scout',
    name: 'Tiny Bowl',
    maxHp: 58,
    speed: 120,
    reward: 8,
    baseDamage: 1,
    bodyRadius: 9,
    color: 0x79d17f,
    spriteScale: 0.72,
  },
  raider: {
    id: 'raider',
    name: 'Flying Plate',
    maxHp: 130,
    speed: 84,
    reward: 12,
    baseDamage: 1,
    bodyRadius: 11,
    color: 0xf3b77b,
    spriteScale: 0.84,
  },
  brute: {
    id: 'brute',
    name: 'Big Bowl',
    maxHp: 295,
    speed: 56,
    reward: 22,
    baseDamage: 2,
    bodyRadius: 14,
    color: 0xf07a7a,
    spriteScale: 1,
  },
  spoonBoss: {
    id: 'spoonBoss',
    name: 'The Silver Ladle',
    maxHp: 4200,
    speed: 42,
    reward: 180,
    baseDamage: 8,
    bodyRadius: 24,
    color: 0xffe2b6,
    spriteScale: 2.6,
    isBoss: true,
    boss: {
      vortexCooldownMs: 9000,
      vortexDurationMs: 2600,
      vortexRange: 128,
      slamCooldownMs: 6500,
      slamRange: 104,
      splinterCooldownMs: 11000,
      splinterCount: 6,
    },
  },
};
