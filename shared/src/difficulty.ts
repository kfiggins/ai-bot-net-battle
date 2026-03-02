import type { GameDifficulty } from "./protocol.js";

export interface DifficultyProfile {
  key: GameDifficulty;
  label: string;
  playerBaseHpMult: number;
  enemyIncomeMult: number;
  enemyBuildCooldownMult: number;
  subBaseMaxTowers: number;
  enemyCapMult: number;
  enemyRangeMult: number;
  enemyFireRateMult: number;
  enemyMoveSpeedMult: number;
  enemyAccelMult: number;
  enemyAggroMult: number;
  allowMissileTowers: boolean;
  allowPhantoms: boolean;
  allowDreadnought: boolean;
  allowGrenader: boolean;
  allowInterceptor: boolean;
  dreadnoughtPerPlayer?: boolean;
  phantomPerPlayer?: boolean;
  grenaderPerPlayer?: boolean;
  interceptorPerPlayer?: boolean;
  perPlayerIncomeMult?: number; // extra income fraction per additional player (e.g. 0.15 = +15%/player)
  nemesisHpMult?: number; // base Nemesis HP multiplier (e.g. 1.25 = 1500 HP)
  nemesisPerPlayerHpMult?: number; // extra HP fraction per additional player (e.g. 0.25 = +300 HP/player)
  perUnitCapMult?: Partial<Record<"minion_ship" | "tower" | "missile_tower" | "phantom_ship" | "dreadnought" | "grenader" | "interceptor", number>>;
  initialSpawns: {
    minions: number;
    towers: number;
    missileTowers: number;
    phantoms: number;
    dreadnought?: number;
    grenader?: number;
    interceptor?: number;
  };
}

export const DIFFICULTY_PROFILES: Record<GameDifficulty, DifficultyProfile> = {
  beginner: {
    key: "beginner",
    label: "Beginner",
    playerBaseHpMult: 1.4,
    enemyIncomeMult: 0.5,
    enemyBuildCooldownMult: 1.4,
    subBaseMaxTowers: 1,
    enemyCapMult: 0.5,
    enemyRangeMult: 0.75,
    enemyFireRateMult: 0.75,
    enemyMoveSpeedMult: 0.8,
    enemyAccelMult: 0.8,
    enemyAggroMult: 0.8,
    allowMissileTowers: true,
    allowPhantoms: false,
    allowDreadnought: false,
    allowGrenader: false,
    allowInterceptor: false,
    perUnitCapMult: {
      minion_ship: 0.5,
      tower: 0.5,
      missile_tower: 0.4,
      phantom_ship: 0,
      dreadnought: 0,
      grenader: 0,
      interceptor: 0,
    },
    initialSpawns: {
      minions: 1,
      towers: 1,
      missileTowers: 0,
      phantoms: 0,
    },
  },
  normal: {
    key: "normal",
    label: "Normal",
    playerBaseHpMult: 1.15,
    enemyIncomeMult: 0.85,
    enemyBuildCooldownMult: 1.15,
    subBaseMaxTowers: 2,
    enemyCapMult: 0.8,
    enemyRangeMult: 0.9,
    enemyFireRateMult: 0.9,
    enemyMoveSpeedMult: 0.9,
    enemyAccelMult: 0.9,
    enemyAggroMult: 0.9,
    allowMissileTowers: true,
    allowPhantoms: true,
    allowDreadnought: true,
    allowGrenader: true,
    allowInterceptor: false,
    perUnitCapMult: {
      minion_ship: 0.75,
      tower: 0.8,
      missile_tower: 0.6,
      phantom_ship: 0.4,
      dreadnought: 1,
      grenader: 0.5,
      interceptor: 0,
    },
    initialSpawns: {
      minions: 2,
      towers: 2,
      missileTowers: 1,
      phantoms: 1,
      grenader: 1,
    },
  },
  hard: {
    key: "hard",
    label: "Hard",
    playerBaseHpMult: 0.85,
    enemyIncomeMult: 1,
    enemyBuildCooldownMult: 1,
    subBaseMaxTowers: 2,
    enemyCapMult: 1.3,
    enemyRangeMult: 1.15,
    enemyFireRateMult: 1.2,
    enemyMoveSpeedMult: 1.1,
    enemyAccelMult: 1,
    enemyAggroMult: 1.25,
    allowMissileTowers: true,
    allowPhantoms: true,
    allowDreadnought: true,
    allowGrenader: true,
    allowInterceptor: true,
    dreadnoughtPerPlayer: true,
    phantomPerPlayer: true,
    grenaderPerPlayer: true,
    interceptorPerPlayer: true,
    perPlayerIncomeMult: 0.15,
    nemesisHpMult: 1.25,
    nemesisPerPlayerHpMult: 0.25,
    perUnitCapMult: {
      minion_ship: 1,
      tower: 1,
      missile_tower: 1,
      phantom_ship: 1,
      dreadnought: 1,
      grenader: 1,
      interceptor: 1,
    },
    initialSpawns: {
      minions: 4,
      towers: 2,
      missileTowers: 1,
      phantoms: 1,
      dreadnought: 1,
      grenader: 1,
      interceptor: 1,
    },
  },
};

export function getDifficultyProfile(difficulty: GameDifficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty] ?? DIFFICULTY_PROFILES.hard;
}
