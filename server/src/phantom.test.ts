import { describe, it, expect, beforeEach } from "vitest";
import { Simulation, entityRadius } from "./sim.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import {
  PHANTOM_HP,
  PHANTOM_RADIUS,
  PHANTOM_FIRE_RANGE,
  PHANTOM_GUARD_RADIUS,
  PHANTOM_ORBIT_RADIUS,
  PHANTOM_BURST_SIZE,
  PHANTOM_KILL_XP,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENEMY_TEAM,
} from "shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimWithMothership(): { sim: Simulation; ai: AIManager } {
  const sim = new Simulation();
  const ai = new AIManager();
  const msX = WORLD_WIDTH / 2;
  const msY = WORLD_HEIGHT / 2;
  // Simulate mothership at center so patrol center is set
  ai.setPatrolCenter({ x: msX, y: msY });
  return { sim, ai };
}

function spawnPhantom(sim: Simulation, ai: AIManager, x: number, y: number) {
  const entity = sim.spawnEnemy("phantom_ship", x, y);
  ai.registerEntity(entity.id);
  return entity;
}

function spawnPlayer(sim: Simulation, x: number, y: number) {
  const playerId = "test-player";
  sim.addPlayer(playerId, "TestPlayer", 1);
  const player = sim.players.get(playerId)!;
  const entity = sim.entities.get(player.entityId)!;
  entity.pos = { x, y };
  return { playerId, entity, player };
}

// ---------------------------------------------------------------------------
// Spawning and basic properties
// ---------------------------------------------------------------------------

describe("Phantom Ship — spawning", () => {
  it("spawns with correct HP", () => {
    const { sim, ai } = makeSimWithMothership();
    const e = spawnPhantom(sim, ai, 2000, 2000);
    expect(e.hp).toBe(PHANTOM_HP);
    expect(e.hp).toBe(20);
  });

  it("spawns on the enemy team", () => {
    const { sim, ai } = makeSimWithMothership();
    const e = spawnPhantom(sim, ai, 2000, 2000);
    expect(e.team).toBe(ENEMY_TEAM);
  });

  it("entityRadius returns PHANTOM_RADIUS", () => {
    expect(entityRadius("phantom_ship")).toBe(PHANTOM_RADIUS);
    expect(entityRadius("phantom_ship")).toBe(10);
  });

  it("registers in AI manager state map", () => {
    const { sim, ai } = makeSimWithMothership();
    const e = spawnPhantom(sim, ai, 2000, 2000);
    expect(ai.aiStates.has(e.id)).toBe(true);
  });

  it("initial AI mode is patrol", () => {
    const { sim, ai } = makeSimWithMothership();
    const e = spawnPhantom(sim, ai, 2000, 2000);
    expect(ai.aiStates.get(e.id)!.aiMode).toBe("patrol");
  });
});

// ---------------------------------------------------------------------------
// Patrol / orbit behaviour (no players)
// ---------------------------------------------------------------------------

describe("Phantom Ship — patrol when no players", () => {
  it("stays near mothership when there are no players", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    // Spawn near mothership
    spawnPhantom(sim, ai, msX + 50, msY);

    // Run 60 ticks (~2 s) without any players
    for (let i = 0; i < 60; i++) {
      ai.update(sim);
      sim.tick++;
    }

    for (const e of sim.entities.values()) {
      if (e.kind !== "phantom_ship") continue;
      const dx = e.pos.x - msX;
      const dy = e.pos.y - msY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Phantom should stay within orbit radius + some tolerance
      expect(dist).toBeLessThan(PHANTOM_ORBIT_RADIUS * 2.5);
    }
  });

  it("does not fire when no players are present", () => {
    const { sim, ai } = makeSimWithMothership();
    spawnPhantom(sim, ai, 2000, 2000);

    const bulletsBefore = sim.bullets.size;
    for (let i = 0; i < 30; i++) {
      ai.update(sim);
      sim.tick++;
    }

    // Bullets fired by phantoms would have team === ENEMY_TEAM
    const newEnemyBullets = Array.from(sim.entities.values()).filter(
      (e) => e.kind === "bullet" && e.team === ENEMY_TEAM
    );
    expect(newEnemyBullets.length).toBe(bulletsBefore);
  });
});

// ---------------------------------------------------------------------------
// Guard zone activation
// ---------------------------------------------------------------------------

describe("Phantom Ship — guard zone", () => {
  it("switches to flank mode when a player enters PHANTOM_GUARD_RADIUS", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    const phantom = spawnPhantom(sim, ai, msX, msY - 200);

    // Place a player close to the mothership (well within guard radius)
    spawnPlayer(sim, msX, msY - 400);

    // Run enough ticks for the state machine to react
    for (let i = 0; i < 5; i++) {
      ai.update(sim);
      sim.tick++;
    }

    const state = ai.aiStates.get(phantom.id)!;
    expect(["flank", "chase"]).toContain(state.aiMode);
  });

  it("returns to patrol/return_to_base when player moves outside guard radius", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    const phantom = spawnPhantom(sim, ai, msX, msY - 200);

    // Player starts inside guard zone
    const { entity: playerEntity } = spawnPlayer(sim, msX, msY - 400);

    for (let i = 0; i < 5; i++) {
      ai.update(sim);
      sim.tick++;
    }

    // Move player far outside guard zone
    playerEntity.pos = { x: msX, y: msY - (PHANTOM_GUARD_RADIUS + 500) };

    for (let i = 0; i < 5; i++) {
      ai.update(sim);
      sim.tick++;
    }

    const state = ai.aiStates.get(phantom.id)!;
    expect(["patrol", "return_to_base"]).toContain(state.aiMode);
  });
});

// ---------------------------------------------------------------------------
// Burst fire
// ---------------------------------------------------------------------------

describe("Phantom Ship — burst fire", () => {
  it("fires bullets when player is within PHANTOM_FIRE_RANGE", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    // Spawn phantom and player very close together (well within fire range)
    const phantom = spawnPhantom(sim, ai, msX, msY - 100);
    const { entity: playerEntity } = spawnPlayer(sim, msX, msY - 100 - PHANTOM_FIRE_RANGE * 0.5);

    // Ensure fire cooldown is zero so it fires on the first opportunity
    ai.aiStates.get(phantom.id)!.fireCooldown = 0;

    let firedBullets = 0;
    for (let i = 0; i < 15; i++) {
      const before = sim.bullets.size;
      ai.update(sim);
      sim.tick++;
      firedBullets += sim.bullets.size - before;
    }

    // Should have fired at least one bullet in this window
    expect(firedBullets).toBeGreaterThan(0);
    // And at most one full burst worth (3 bullets in quick succession)
    expect(firedBullets).toBeLessThanOrEqual(PHANTOM_BURST_SIZE);
  });

  it("burst produces exactly PHANTOM_BURST_SIZE bullets", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    const phantom = spawnPhantom(sim, ai, msX, msY - 100);
    spawnPlayer(sim, msX, msY - 100 - PHANTOM_FIRE_RANGE * 0.5);

    const state = ai.aiStates.get(phantom.id)!;
    state.fireCooldown = 0;
    state.burstRemaining = 0;

    // Run enough ticks to complete one full burst (burst size × burst delay + 1)
    const ticksNeeded = PHANTOM_BURST_SIZE * 5 + 5;
    let totalBullets = 0;
    for (let i = 0; i < ticksNeeded; i++) {
      const before = sim.bullets.size;
      ai.update(sim);
      sim.tick++;
      totalBullets += sim.bullets.size - before;
      // Stop after the burst cooldown before a second burst could start
      if (state.fireCooldown > 0 && state.burstRemaining === 0) break;
    }

    expect(totalBullets).toBe(PHANTOM_BURST_SIZE);
  });

  it("does not fire outside PHANTOM_FIRE_RANGE", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;
    const phantom = spawnPhantom(sim, ai, msX, msY - 100);
    spawnPlayer(sim, msX, msY - 100 - PHANTOM_FIRE_RANGE * 2);

    ai.aiStates.get(phantom.id)!.fireCooldown = 0;

    for (let i = 0; i < 10; i++) {
      ai.update(sim);
      sim.tick++;
    }

    // No bullets should have been spawned
    const enemyBullets = Array.from(sim.entities.values()).filter(
      (e) => e.kind === "bullet" && e.team === ENEMY_TEAM
    );
    expect(enemyBullets.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// XP on kill
// ---------------------------------------------------------------------------

describe("Phantom Ship — XP on kill", () => {
  it("awards PHANTOM_KILL_XP to the killing player", () => {
    const sim = new Simulation();
    const { playerId, player } = spawnPlayer(sim, 2000, 1600);

    // Put the player at level 2 where xpToNext = 28 > PHANTOM_KILL_XP (20),
    // so no level-up occurs and the full XP amount is visible in player.xp.
    player.xp = 0;
    player.level = 2;
    player.xpToNext = 28; // xpForLevel(2) = floor(10 * 2^1.5) = 28
    const xpBefore = player.xp;

    // Spawn phantom and one-shot it (damage = full phantom HP)
    const phantom = sim.spawnEnemy("phantom_ship", 2000, 1620);
    const playerEntity = sim.entities.get(player.entityId)!;
    const bullet = sim.spawnBullet(playerEntity, playerId, 0, PHANTOM_HP);
    bullet.pos = { x: phantom.pos.x, y: phantom.pos.y };

    sim.checkCollisions();

    expect(phantom.hp).toBeLessThanOrEqual(0);
    expect(player.xp - xpBefore).toBe(PHANTOM_KILL_XP);
  });
});

// ---------------------------------------------------------------------------
// Economy integration
// ---------------------------------------------------------------------------

describe("Phantom Ship — economy", () => {
  it("can be built through Economy.requestBuild", () => {
    const sim = new Simulation();
    const ai = new AIManager();
    const economy = new Economy();
    economy.balance = 1000;

    const result = economy.requestBuild({ unitKind: "phantom_ship" }, sim);
    expect(result.ok).toBe(true);
    expect(economy.buildQueue).toHaveLength(1);
    expect(economy.buildQueue[0].unitKind).toBe("phantom_ship");
  });

  it("deducts the correct cost from balance", () => {
    const sim = new Simulation();
    const economy = new Economy();
    economy.balance = 1000;

    const before = economy.balance;
    economy.requestBuild({ unitKind: "phantom_ship" }, sim);
    expect(economy.balance).toBe(before - 65); // PHANTOM cost = 65
  });

  it("respects the unit cap of 5", () => {
    const sim = new Simulation();
    const ai = new AIManager();
    const economy = new Economy();
    economy.balance = 100000;

    // Spawn 5 phantoms directly so they count toward the cap
    for (let i = 0; i < 5; i++) {
      sim.spawnEnemy("phantom_ship", 2000, 2000);
    }

    const result = economy.requestBuild({ unitKind: "phantom_ship" }, sim);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("cap_reached");
  });

  it("spawns a phantom entity when the build queue resolves", () => {
    const sim = new Simulation();
    const ai = new AIManager();
    const economy = new Economy();
    economy.balance = 1000;

    economy.requestBuild({ unitKind: "phantom_ship" }, sim);
    // Advance past the build cooldown
    sim.tick = 100;
    economy.update(sim, ai);

    const phantoms = sim.getEntitiesByKind("phantom_ship");
    expect(phantoms.length).toBe(1);
    // Entity should be registered in the AI manager
    expect(ai.aiStates.has(phantoms[0].id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Flank position calculation (unit-level check)
// ---------------------------------------------------------------------------

describe("Phantom Ship — flank geometry", () => {
  it("moves toward the far side of the mothership from the player", () => {
    const { sim, ai } = makeSimWithMothership();
    const msX = WORLD_WIDTH / 2;
    const msY = WORLD_HEIGHT / 2;

    // Player approaches from the left (600 px west of mothership — inside guard zone)
    spawnPlayer(sim, msX - 600, msY);
    // Phantom starts above the mothership, outside fire range of the player
    // (dist phantom→player = sqrt(600² + 250²) ≈ 651 px > PHANTOM_FIRE_RANGE=450)
    // so it will be in "flank" mode, not "chase" mode
    const phantom = spawnPhantom(sim, ai, msX, msY - 250);

    // Run 60 ticks (~2 s) — long enough to reach the flank position
    for (let i = 0; i < 60; i++) {
      ai.update(sim);
      sim.tick++;
    }

    // Flank position = mothership + (player→mothership direction) * PHANTOM_FLANK_DIST
    // = (2000,2000) + (1,0)*180 = (2180, 2000)
    // Phantom should have moved to the right of center (x > msX - 50)
    expect(phantom.pos.x).toBeGreaterThan(msX - 50);
  });
});
