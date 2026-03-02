import { describe, it, expect, beforeEach } from "vitest";
import { Simulation, entityRadius } from "./sim.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import {
  INTERCEPTOR_HP,
  INTERCEPTOR_RADIUS,
  INTERCEPTOR_FIRE_RANGE,
  INTERCEPTOR_BURST_SIZE,
  INTERCEPTOR_KILL_XP,
  INTERCEPTOR_SPEED,
  INTERCEPTOR_BODY_COLLISION_DAMAGE,
  INTERCEPTOR_DODGE_SCAN_RADIUS,
  BULLET_SPEED,
  UNIT_COSTS,
  UNIT_CAPS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENEMY_TEAM,
  TICK_RATE,
  getDifficultyProfile,
  DIFFICULTY_PROFILES,
  xpForLevel,
} from "shared";

// Baseline profile with 1.0x multipliers for mechanic tests
const baselineProfile = {
  ...getDifficultyProfile("hard"),
  enemyCapMult: 1,
  enemyFireRateMult: 1,
  enemyRangeMult: 1,
  enemyMoveSpeedMult: 1,
  enemyAccelMult: 1,
  enemyAggroMult: 1,
};

function makeSimWithInterceptor(x = 2000, y = 2000) {
  const sim = new Simulation();
  const ai = new AIManager(baselineProfile);
  ai.setPatrolCenter({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const entity = sim.spawnEnemy("interceptor", x, y);
  ai.registerEntity(entity.id);
  // Reset fire cooldown for deterministic tests
  ai.aiStates.get(entity.id)!.fireCooldown = 0;
  return { sim, ai, entity };
}

function spawnPlayer(sim: Simulation, x: number, y: number, id = "test-player") {
  sim.addPlayer(id, "TestPlayer", 1);
  const player = sim.players.get(id)!;
  const entity = sim.entities.get(player.entityId)!;
  entity.pos = { x, y };
  return { playerId: id, entity, player };
}

// ---------------------------------------------------------------------------
// Spawning and basic properties
// ---------------------------------------------------------------------------

describe("Interceptor — spawning", () => {
  it("spawns with correct HP", () => {
    const { entity } = makeSimWithInterceptor();
    expect(entity.hp).toBe(INTERCEPTOR_HP);
    expect(entity.hp).toBe(45);
  });

  it("spawns on the enemy team", () => {
    const { entity } = makeSimWithInterceptor();
    expect(entity.team).toBe(ENEMY_TEAM);
  });

  it("entityRadius returns INTERCEPTOR_RADIUS", () => {
    expect(entityRadius("interceptor")).toBe(INTERCEPTOR_RADIUS);
    expect(entityRadius("interceptor")).toBe(11);
  });

  it("has correct cost and cap in constants", () => {
    expect(UNIT_COSTS.interceptor).toBe(90);
    expect(UNIT_CAPS.interceptor).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Target assignment (per-player)
// ---------------------------------------------------------------------------

describe("Interceptor — target assignment", () => {
  it("assigns interceptor to a player via assignInterceptorTargets", () => {
    const { sim, ai, entity } = makeSimWithInterceptor();
    const { playerId, entity: playerEntity } = spawnPlayer(sim, 1000, 1000);

    ai.assignInterceptorTargets(sim);
    const state = ai.aiStates.get(entity.id)!;
    expect(state.assignedPlayerId).toBe(playerEntity.id);
  });

  it("round-robin assigns multiple interceptors to multiple players", () => {
    const sim = new Simulation();
    const ai = new AIManager(baselineProfile);

    const i1 = sim.spawnEnemy("interceptor", 2000, 2000);
    ai.registerEntity(i1.id);
    const i2 = sim.spawnEnemy("interceptor", 2000, 2100);
    ai.registerEntity(i2.id);

    const { entity: p1 } = spawnPlayer(sim, 1000, 1000, "p1");
    const { entity: p2 } = spawnPlayer(sim, 1000, 1200, "p2");

    ai.assignInterceptorTargets(sim);

    expect(ai.aiStates.get(i1.id)!.assignedPlayerId).toBe(p1.id);
    expect(ai.aiStates.get(i2.id)!.assignedPlayerId).toBe(p2.id);
  });

  it("clears assignments when no players alive", () => {
    const { sim, ai, entity } = makeSimWithInterceptor();
    const { entity: playerEntity } = spawnPlayer(sim, 1000, 1000);

    ai.assignInterceptorTargets(sim);
    expect(ai.aiStates.get(entity.id)!.assignedPlayerId).toBe(playerEntity.id);

    // Kill player
    playerEntity.hp = 0;
    ai.assignInterceptorTargets(sim);
    expect(ai.aiStates.get(entity.id)!.assignedPlayerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Chase behavior
// ---------------------------------------------------------------------------

describe("Interceptor — chase", () => {
  it("moves toward assigned player when outside fire range", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(2000, 2000);
    // Player far away
    spawnPlayer(sim, 500, 500);
    ai.assignInterceptorTargets(sim);

    const startX = entity.pos.x;
    const startY = entity.pos.y;

    // Run a few ticks
    for (let i = 0; i < 30; i++) {
      ai.update(sim);
      sim.update();
    }

    // Should have moved toward player (500,500) - lower x and y
    expect(entity.pos.x).toBeLessThan(startX);
    expect(entity.pos.y).toBeLessThan(startY);
  });

  it("does not exceed max speed (with overspeed margin)", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(2000, 2000);
    spawnPlayer(sim, 500, 500);
    ai.assignInterceptorTargets(sim);

    // Run many ticks to reach max speed
    for (let i = 0; i < 60; i++) {
      ai.update(sim);
      sim.update();
    }

    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    // Allow 20% overspeed for dodge + moveSpeedScale variance
    const maxAllowed = INTERCEPTOR_SPEED * 1.3 * 1.2;
    expect(speed).toBeLessThanOrEqual(maxAllowed);
  });
});

// ---------------------------------------------------------------------------
// Orbit behavior
// ---------------------------------------------------------------------------

describe("Interceptor — orbit", () => {
  it("orbits around target when within fire range", () => {
    // Place interceptor within fire range of player
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    spawnPlayer(sim, 1000 + INTERCEPTOR_FIRE_RANGE * 0.5, 1000);
    ai.assignInterceptorTargets(sim);

    // Run ticks to enter orbit mode
    for (let i = 0; i < 60; i++) {
      ai.update(sim);
      sim.update();
    }

    const state = ai.aiStates.get(entity.id)!;
    expect(state.aiMode).toBe("chase"); // "chase" mode = orbiting
  });
});

// ---------------------------------------------------------------------------
// Burst fire
// ---------------------------------------------------------------------------

describe("Interceptor — burst fire", () => {
  it("fires exactly 3 bullets in a burst when target in range", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    // Player within fire range
    spawnPlayer(sim, 1000 + 200, 1000);
    ai.assignInterceptorTargets(sim);

    const bulletsBefore = sim.bullets.size;

    // Run enough ticks for a burst to complete (cooldown 0 + 3 shots with delays)
    for (let i = 0; i < 20; i++) {
      ai.update(sim);
    }

    const bulletsAfter = sim.bullets.size;
    expect(bulletsAfter - bulletsBefore).toBe(INTERCEPTOR_BURST_SIZE);
    expect(bulletsAfter - bulletsBefore).toBe(3);
  });

  it("does not fire when target is outside fire range", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    // Player far away
    spawnPlayer(sim, 1000 + INTERCEPTOR_FIRE_RANGE + 500, 1000);
    ai.assignInterceptorTargets(sim);

    const bulletsBefore = sim.bullets.size;

    for (let i = 0; i < 20; i++) {
      ai.update(sim);
    }

    expect(sim.bullets.size).toBe(bulletsBefore);
  });

  it("burst bullets have angular spread", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    // Player directly to the right
    spawnPlayer(sim, 1000 + 200, 1000);
    ai.assignInterceptorTargets(sim);

    // Collect bullet angles
    const bulletAngles: number[] = [];

    for (let i = 0; i < 20; i++) {
      ai.update(sim);
      // Check for new bullets
      for (const [id, bullet] of sim.entities) {
        if (bullet.kind === "bullet" && bullet.team === ENEMY_TEAM && !bulletAngles.includes(Math.atan2(bullet.vel.y, bullet.vel.x))) {
          bulletAngles.push(Math.atan2(bullet.vel.y, bullet.vel.x));
        }
      }
    }

    expect(bulletAngles.length).toBe(3);
    // Bullets should not all have the exact same angle (spread)
    const unique = new Set(bulletAngles.map(a => a.toFixed(3)));
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Bullet dodging
// ---------------------------------------------------------------------------

describe("Interceptor — bullet dodging", () => {
  it("dodges laterally when a player bullet is heading toward it", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    entity.vel = { x: 0, y: 0 };

    // Need a player target so the interceptor doesn't just brake to zero
    spawnPlayer(sim, 1000, 500);
    ai.assignInterceptorTargets(sim);

    // Spawn a player bullet heading straight at the interceptor from the left
    const bulletEntity = {
      id: "test-bullet",
      kind: "bullet" as const,
      pos: { x: 1000 - 100, y: 1000 },
      vel: { x: BULLET_SPEED, y: 0 }, // heading right, straight at interceptor
      hp: 1,
      team: 1, // player team
    };
    sim.entities.set("test-bullet", bulletEntity);
    sim.bullets.set("test-bullet", {
      entityId: "test-bullet",
      ownerId: "player",
      ttl: 120,
      originPos: { x: bulletEntity.pos.x, y: bulletEntity.pos.y },
      damage: 10,
    });

    // Run AI tick — the dodge should add lateral velocity
    ai.update(sim);

    // The interceptor should have gained lateral (y) velocity from dodging
    // (perpendicular to the bullet's x-axis travel)
    expect(Math.abs(entity.vel.y)).toBeGreaterThan(0);
  });

  it("ignores friendly bullets (same team)", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    entity.vel = { x: 0, y: 0 };

    // Spawn an enemy bullet heading at the interceptor
    const bulletEntity = {
      id: "friendly-bullet",
      kind: "bullet" as const,
      pos: { x: 1000 - 200, y: 1000 },
      vel: { x: BULLET_SPEED, y: 0 },
      hp: 1,
      team: ENEMY_TEAM, // same team
    };
    sim.entities.set("friendly-bullet", bulletEntity);
    sim.bullets.set("friendly-bullet", {
      entityId: "friendly-bullet",
      ownerId: "enemy",
      ttl: 120,
      originPos: { x: bulletEntity.pos.x, y: bulletEntity.pos.y },
      damage: 10,
    });

    ai.update(sim);

    // No dodge — velocity should remain near zero (only chase/orbit forces apply)
    // Since there's no player target, it should just brake
    expect(Math.abs(entity.vel.y)).toBeLessThan(1);
  });

  it("ignores bullets that are too far away", () => {
    const { sim, ai, entity } = makeSimWithInterceptor(1000, 1000);
    entity.vel = { x: 0, y: 0 };

    // Spawn a player bullet far away
    const bulletEntity = {
      id: "far-bullet",
      kind: "bullet" as const,
      pos: { x: 1000 - INTERCEPTOR_DODGE_SCAN_RADIUS - 100, y: 1000 },
      vel: { x: BULLET_SPEED, y: 0 },
      hp: 1,
      team: 1,
    };
    sim.entities.set("far-bullet", bulletEntity);
    sim.bullets.set("far-bullet", {
      entityId: "far-bullet",
      ownerId: "player",
      ttl: 120,
      originPos: { x: bulletEntity.pos.x, y: bulletEntity.pos.y },
      damage: 10,
    });

    ai.update(sim);

    // No dodge — should brake
    expect(Math.abs(entity.vel.y)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

describe("Interceptor — economy", () => {
  it("can be built via economy with correct cost", () => {
    const sim = new Simulation();
    const economy = new Economy(baselineProfile);
    economy.balance = 1000;

    const before = economy.balance;
    const result = economy.requestBuild({ unitKind: "interceptor" }, sim);
    expect(result.ok).toBe(true);
    expect(economy.balance).toBe(before - UNIT_COSTS.interceptor);
  });

  it("respects the unit cap", () => {
    const sim = new Simulation();
    const ai = new AIManager(baselineProfile);
    const economy = new Economy(baselineProfile);
    economy.balance = 100000;

    // Spawn up to cap
    for (let i = 0; i < UNIT_CAPS.interceptor; i++) {
      sim.spawnEnemy("interceptor", 2000 + i * 50, 2000);
    }

    const result = economy.requestBuild({ unitKind: "interceptor" }, sim);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("cap_reached");
  });
});

// ---------------------------------------------------------------------------
// XP award
// ---------------------------------------------------------------------------

describe("Interceptor — XP", () => {
  it("awards INTERCEPTOR_KILL_XP on kill", () => {
    const sim = new Simulation();

    const playerEntity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;

    // Pre-level to 3 so xpToNext=51, safely above INTERCEPTOR_KILL_XP (30)
    sim.awardXP(ps, xpForLevel(1) + xpForLevel(2));
    expect(ps.level).toBe(3);

    // Position player and interceptor close together, bullet aimed right
    playerEntity.pos = { x: 100, y: 300 };
    const interceptor = sim.spawnEnemy("interceptor", 140, 300);

    // One-shot: spawn bullet with enough damage to kill
    sim.spawnBullet(playerEntity, "p1", 0, interceptor.hp);
    sim.update();

    expect(sim.entities.has(interceptor.id)).toBe(false); // dead
    expect(ps.xp).toBe(INTERCEPTOR_KILL_XP);
  });
});

// ---------------------------------------------------------------------------
// Hard mode only
// ---------------------------------------------------------------------------

describe("Interceptor — difficulty gating", () => {
  it("is disabled on beginner difficulty", () => {
    const beginner = getDifficultyProfile("beginner");
    expect(beginner.allowInterceptor).toBe(false);
  });

  it("is disabled on normal difficulty", () => {
    const normal = getDifficultyProfile("normal");
    expect(normal.allowInterceptor).toBe(false);
  });

  it("is enabled on hard difficulty", () => {
    const hard = getDifficultyProfile("hard");
    expect(hard.allowInterceptor).toBe(true);
    expect(hard.interceptorPerPlayer).toBe(true);
  });
});
