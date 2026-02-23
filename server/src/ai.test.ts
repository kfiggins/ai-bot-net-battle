import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import {
  MINION_SPEED,
  MINION_FIRE_RANGE,
  MINION_FIRE_COOLDOWN_TICKS,
  TOWER_FIRE_RANGE,
  TOWER_FIRE_COOLDOWN_TICKS,
  MINION_HP,
  TOWER_HP,
  ENEMY_TEAM,
  TICK_RATE,
  BULLET_DAMAGE,
  ENEMY_AGGRO_RANGE,
  ENEMY_DEAGGRO_RANGE,
  ENEMY_PATROL_SPEED,
} from "shared";

/** Helper: register entity with AI and force fire cooldown to 0 for deterministic tests */
function registerReady(ai: AIManager, entityId: string): void {
  ai.registerEntity(entityId);
  ai.aiStates.get(entityId)!.fireCooldown = 0;
}

describe("AIManager", () => {
  let sim: Simulation;
  let ai: AIManager;

  beforeEach(() => {
    sim = new Simulation();
    ai = new AIManager();
  });

  describe("minion_ship AI", () => {
    it("moves toward nearest player", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;

      const minion = sim.spawnEnemy("minion_ship", 500, 300);
      registerReady(ai, minion.id);

      const startX = minion.pos.x;

      sim.update();
      ai.update(sim);

      // Minion should move left toward player
      expect(minion.pos.x).toBeLessThan(startX);
    });

    it("orbits/strafes when close enough to fire (not chasing)", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;

      // Place minion within 70% of fire range
      const closeRange = MINION_FIRE_RANGE * 0.5;
      const minion = sim.spawnEnemy("minion_ship", 100 + closeRange, 300);
      registerReady(ai, minion.id);

      const startX = minion.pos.x;

      sim.update();
      ai.update(sim);

      // Minion should not be chasing (moving significantly toward player)
      // It strafes with small velocity — the forward component should be near 0
      const dx = minion.pos.x - startX;
      // Should not have moved more than a few pixels toward player
      expect(Math.abs(dx)).toBeLessThan(MINION_SPEED / TICK_RATE);
    });

    it("fires at player when in range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;

      const minion = sim.spawnEnemy("minion_ship", 200, 300);
      registerReady(ai, minion.id);

      const bulletsBefore = sim.bullets.size;

      sim.update();
      ai.update(sim);

      expect(sim.bullets.size).toBe(bulletsBefore + 1);
    });

    it("respects fire cooldown", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;
      player.team = 1;

      const minion = sim.spawnEnemy("minion_ship", 200, 300);
      registerReady(ai, minion.id);

      // First update: fires
      sim.update();
      ai.update(sim);
      const aiState = ai.aiStates.get(minion.id)!;
      expect(aiState.fireCooldown).toBe(MINION_FIRE_COOLDOWN_TICKS);

      // Second update: cooldown decrements
      sim.update();
      ai.update(sim);
      expect(aiState.fireCooldown).toBe(MINION_FIRE_COOLDOWN_TICKS - 1);
    });

    it("patrols when no players exist", () => {
      const minion = sim.spawnEnemy("minion_ship", 500, 300);
      registerReady(ai, minion.id);

      sim.update();
      ai.update(sim);

      // Should be in patrol mode, moving toward a waypoint
      const state = ai.aiStates.get(minion.id)!;
      expect(state.aiMode).toBe("patrol");
      // Velocity should be non-zero (patrolling)
      const speed = Math.sqrt(minion.vel.x ** 2 + minion.vel.y ** 2);
      expect(speed).toBeGreaterThan(0);
    });

    it("targets nearest player when multiple exist", () => {
      const farPlayer = sim.addPlayer("p1");
      farPlayer.pos.x = 50;
      farPlayer.pos.y = 300;

      const nearPlayer = sim.addPlayer("p2");
      nearPlayer.pos.x = 200;
      nearPlayer.pos.y = 300;

      // Place minion far enough away that it needs to move
      const minion = sim.spawnEnemy("minion_ship", 700, 300);
      registerReady(ai, minion.id);

      sim.update();
      ai.update(sim);

      // Minion should move toward near player (left)
      expect(minion.vel.x).toBeLessThan(0);
    });

    it("switches to chase when player enters aggro range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 500;
      player.pos.y = 300;

      // Place minion just inside aggro range
      const minion = sim.spawnEnemy("minion_ship", 500 + ENEMY_AGGRO_RANGE - 50, 300);
      registerReady(ai, minion.id);

      const state = ai.aiStates.get(minion.id)!;
      expect(state.aiMode).toBe("patrol");

      sim.update();
      ai.update(sim);

      expect(state.aiMode).toBe("chase");
    });

    it("switches back to patrol when player leaves deaggro range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 500;
      player.pos.y = 300;

      const minion = sim.spawnEnemy("minion_ship", 500 + ENEMY_AGGRO_RANGE - 50, 300);
      registerReady(ai, minion.id);

      const state = ai.aiStates.get(minion.id)!;

      // First: enter chase
      sim.update();
      ai.update(sim);
      expect(state.aiMode).toBe("chase");

      // Move player far away beyond deaggro range
      player.pos.x = minion.pos.x + ENEMY_DEAGGRO_RANGE + 100;

      sim.update();
      ai.update(sim);
      expect(state.aiMode).toBe("patrol");
    });

    it("does not aggro when player is outside aggro range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 500;
      player.pos.y = 300;

      // Place minion well outside aggro range
      const minion = sim.spawnEnemy("minion_ship", 500 + ENEMY_AGGRO_RANGE + 200, 300);
      registerReady(ai, minion.id);

      sim.update();
      ai.update(sim);

      const state = ai.aiStates.get(minion.id)!;
      expect(state.aiMode).toBe("patrol");
    });

    it("does not fire while patrolling", () => {
      // No players — minion stays in patrol mode
      const minion = sim.spawnEnemy("minion_ship", 500, 300);
      registerReady(ai, minion.id);

      sim.update();
      ai.update(sim);

      expect(sim.bullets.size).toBe(0);
    });
  });

  describe("tower AI", () => {
    it("does not move", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;

      const tower = sim.spawnEnemy("tower", 500, 300);
      registerReady(ai, tower.id);

      sim.update();
      ai.update(sim);

      expect(tower.vel.x).toBe(0);
      expect(tower.vel.y).toBe(0);
      expect(tower.pos.x).toBe(500);
      expect(tower.pos.y).toBe(300);
    });

    it("fires at player when in range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 400;
      player.pos.y = 300;

      const tower = sim.spawnEnemy("tower", 500, 300);
      registerReady(ai, tower.id);

      sim.update();
      ai.update(sim);

      expect(sim.bullets.size).toBe(1);
    });

    it("does not fire at player out of range", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 100;
      player.pos.y = 300;

      const tower = sim.spawnEnemy("tower", 100 + TOWER_FIRE_RANGE + 100, 300);
      registerReady(ai, tower.id);

      sim.update();
      ai.update(sim);

      expect(sim.bullets.size).toBe(0);
    });

    it("respects fire cooldown", () => {
      const player = sim.addPlayer("p1");
      player.pos.x = 400;
      player.pos.y = 300;

      const tower = sim.spawnEnemy("tower", 500, 300);
      registerReady(ai, tower.id);

      // First update: fires
      sim.update();
      ai.update(sim);
      expect(sim.bullets.size).toBe(1);

      // Second update: cooldown
      sim.update();
      ai.update(sim);
      expect(sim.bullets.size).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("removes AI state when entity is destroyed", () => {
      const minion = sim.spawnEnemy("minion_ship", 500, 300);
      ai.registerEntity(minion.id);
      expect(ai.aiStates.size).toBe(1);

      // Kill entity
      sim.entities.delete(minion.id);

      ai.update(sim);
      expect(ai.aiStates.size).toBe(0);
    });
  });
});

describe("Simulation.spawnEnemy", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("spawns a minion_ship with correct properties", () => {
    const minion = sim.spawnEnemy("minion_ship", 300, 400);
    expect(minion.kind).toBe("minion_ship");
    expect(minion.hp).toBe(MINION_HP);
    expect(minion.team).toBe(ENEMY_TEAM);
    expect(minion.pos).toEqual({ x: 300, y: 400 });
    expect(sim.entities.has(minion.id)).toBe(true);
  });

  it("spawns a tower with correct properties", () => {
    const tower = sim.spawnEnemy("tower", 600, 200);
    expect(tower.kind).toBe("tower");
    expect(tower.hp).toBe(TOWER_HP);
    expect(tower.team).toBe(ENEMY_TEAM);
    expect(tower.pos).toEqual({ x: 600, y: 200 });
    expect(sim.entities.has(tower.id)).toBe(true);
  });

  it("getEntitiesByKind returns correct entities", () => {
    sim.spawnEnemy("minion_ship", 100, 100);
    sim.spawnEnemy("minion_ship", 200, 200);
    sim.spawnEnemy("tower", 300, 300);

    expect(sim.getEntitiesByKind("minion_ship")).toHaveLength(2);
    expect(sim.getEntitiesByKind("tower")).toHaveLength(1);
    expect(sim.getEntitiesByKind("player_ship")).toHaveLength(0);
  });

  it("getEntitiesByTeam returns correct entities", () => {
    sim.addPlayer("p1");
    sim.spawnEnemy("minion_ship", 100, 100);
    sim.spawnEnemy("tower", 200, 200);

    expect(sim.getEntitiesByTeam(1)).toHaveLength(1);
    expect(sim.getEntitiesByTeam(ENEMY_TEAM)).toHaveLength(2);
  });
});

describe("combat integration", () => {
  it("player bullets can destroy minions", () => {
    const sim = new Simulation();
    const ai = new AIManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = 300;

    const minion = sim.spawnEnemy("minion_ship", 140, 300);
    ai.registerEntity(minion.id);

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, aimAngle: 0,
    });

    // Run until minion is destroyed
    for (let i = 0; i < 60; i++) {
      sim.update();
      ai.update(sim);
    }

    expect(sim.entities.has(minion.id)).toBe(false);
  });

  it("player bullets can destroy towers", () => {
    const sim = new Simulation();
    const ai = new AIManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = 300;

    const tower = sim.spawnEnemy("tower", 140, 300);
    ai.registerEntity(tower.id);

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, aimAngle: 0,
    });

    // Run until tower is destroyed (tower has more HP)
    for (let i = 0; i < 200; i++) {
      sim.update();
      ai.update(sim);
    }

    expect(sim.entities.has(tower.id)).toBe(false);
  });

  it("enemy bullets can damage players", () => {
    const sim = new Simulation();
    const ai = new AIManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 400;
    player.pos.y = 300;

    const tower = sim.spawnEnemy("tower", 500, 300);
    registerReady(ai, tower.id);

    const startHp = player.hp;

    // Run ticks - tower should fire and hit player
    for (let i = 0; i < 30; i++) {
      sim.update();
      ai.update(sim);
    }

    expect(player.hp).toBeLessThan(startHp);
  });
});
