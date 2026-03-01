import type { GameDifficulty } from "./protocol.js";

export interface DifficultyProfile {
  key: GameDifficulty;
  label: string;
  enemyIncomeMult: number;
  enemyBuildCooldownMult: number;
  enemyCapMult: number;
  enemyRangeMult: number;
  enemyFireRateMult: number;
  enemyMoveSpeedMult: number;
  enemyAccelMult: number;
  enemyAggroMult: number;
  allowMissileTowers: boolean;
  allowPhantoms: boolean;
  allowDreadnought: boolean;
  perUnitCapMult?: Partial<Record<"minion_ship" | "tower" | "missile_tower" | "phantom_ship" | "dreadnought", number>>;
  initialSpawns: {
    minions: number;
    towers: number;
    missileTowers: number;
    phantoms: number;
  };
}

export const DIFFICULTY_PROFILES: Record<GameDifficulty, DifficultyProfile> = {
  beginner: {
    key: "beginner",
    label: "Beginner",
    enemyIncomeMult: 0.65,
    enemyBuildCooldownMult: 1.4,
    enemyCapMult: 0.5,
    enemyRangeMult: 0.75,
    enemyFireRateMult: 0.75,
    enemyMoveSpeedMult: 0.8,
    enemyAccelMult: 0.8,
    enemyAggroMult: 0.8,
    allowMissileTowers: true,
    allowPhantoms: false,
    allowDreadnought: false,
    perUnitCapMult: {
      minion_ship: 0.5,
      tower: 0.5,
      missile_tower: 0.4,
      phantom_ship: 0,
      dreadnought: 0,
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
    enemyIncomeMult: 0.85,
    enemyBuildCooldownMult: 1.15,
    enemyCapMult: 0.8,
    enemyRangeMult: 0.9,
    enemyFireRateMult: 0.9,
    enemyMoveSpeedMult: 0.9,
    enemyAccelMult: 0.9,
    enemyAggroMult: 0.9,
    allowMissileTowers: true,
    allowPhantoms: true,
    allowDreadnought: false,
    perUnitCapMult: {
      minion_ship: 0.75,
      tower: 0.8,
      missile_tower: 0.6,
      phantom_ship: 0.4,
      dreadnought: 0,
    },
    initialSpawns: {
      minions: 2,
      towers: 2,
      missileTowers: 1,
      phantoms: 1,
    },
  },
  hard: {
    key: "hard",
    label: "Hard",
    enemyIncomeMult: 1,
    enemyBuildCooldownMult: 1,
    enemyCapMult: 1,
    enemyRangeMult: 1,
    enemyFireRateMult: 1,
    enemyMoveSpeedMult: 1,
    enemyAccelMult: 1,
    enemyAggroMult: 1,
    allowMissileTowers: true,
    allowPhantoms: true,
    allowDreadnought: true,
    perUnitCapMult: {
      minion_ship: 1,
      tower: 1,
      missile_tower: 1,
      phantom_ship: 1,
      dreadnought: 1,
    },
    initialSpawns: {
      minions: 2,
      towers: 2,
      missileTowers: 1,
      phantoms: 3,
    },
  },
};

export function getDifficultyProfile(difficulty: GameDifficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty] ?? DIFFICULTY_PROFILES.hard;
}
