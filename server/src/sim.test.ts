import { describe, it, expect, beforeEach, vi } from "vitest";
import { Simulation, circlesOverlap, getCannonAngles, getEffectiveMaxHp } from "./sim.js";
import {
  PLAYER_HP,
  PLAYER_MAX_SPEED,
  PLAYER_ACCEL,
  PLAYER_BRAKE_FRICTION,
  PLAYER_RADIUS,
  BULLET_SPEED,
  BULLET_DAMAGE,
  BULLET_TTL_TICKS,
  BULLET_MAX_RANGE,
  FIRE_COOLDOWN_TICKS,
  MISSILE_TTL_TICKS,
  MISSILE_DAMAGE,
  MISSILE_TOWER_HP,
  ENEMY_TEAM,
  TICK_RATE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SnapshotMessageSchema,
  ORB_SPAWN_INTERVAL_TICKS,
  ORB_MAX_ON_MAP,
  ORB_XP_VALUE,
  ORB_INITIAL_COUNT,
  ORB_SPAWN_PADDING,
  MINION_ORB_RESOURCE,
  MINION_KILL_XP,
  TOWER_KILL_XP,
  MAX_LEVEL,
  xpForLevel,
  MAX_UPGRADE_PER_STAT,
  DAMAGE_PER_UPGRADE,
  SPEED_PER_UPGRADE,
  HEALTH_PER_UPGRADE,
  FIRE_RATE_PER_UPGRADE,
  CANNON_SPREAD_ANGLE,
  CANNON_MILESTONES,
  MILESTONE_LEVELS,
  BULLET_RECOIL_FORCE,
  RECOIL_REDUCTION_PER_SPEED_UPGRADE,
  ACCEL_PER_SPEED_UPGRADE,
  CANNON_OFFSET_LATERAL,
  BULLET_RADIUS,
} from "shared";

describe("Simulation", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe("initialization", () => {
    it("starts at tick 0 with no entities", () => {
      expect(sim.tick).toBe(0);
      expect(sim.entities.size).toBe(0);
      expect(sim.players.size).toBe(0);
    });
  });

  describe("addPlayer", () => {
    it("creates a player entity", () => {
      const entity = sim.addPlayer("p1");
      expect(entity.kind).toBe("player_ship");
      expect(entity.hp).toBe(PLAYER_HP);
      expect(entity.team).toBe(1);
      expect(sim.entities.size).toBe(1);
      expect(sim.players.size).toBe(1);
    });

    it("assigns different entity IDs to different players", () => {
      const e1 = sim.addPlayer("p1");
      const e2 = sim.addPlayer("p2");
      expect(e1.id).not.toBe(e2.id);
      expect(sim.entities.size).toBe(2);
      expect(sim.players.size).toBe(2);
    });

    it("spawns players within world bounds", () => {
      for (let i = 0; i < 20; i++) {
        const entity = sim.addPlayer(`p${i}`);
        expect(entity.pos.x).toBeGreaterThanOrEqual(0);
        expect(entity.pos.x).toBeLessThanOrEqual(WORLD_WIDTH);
        expect(entity.pos.y).toBeGreaterThanOrEqual(0);
        expect(entity.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT);
      }
    });

    it("initializes fire cooldown to 0", () => {
      sim.addPlayer("p1");
      expect(sim.players.get("p1")!.fireCooldown).toBe(0);
    });

    it("stores playerIndex on entity and player record", () => {
      const entity = sim.addPlayer("p1", "Alice", 2);
      expect(entity.playerIndex).toBe(2);
      expect(sim.players.get("p1")!.playerIndex).toBe(2);
    });

    it("preserves distinct playerIndex values for all four players", () => {
      const e1 = sim.addPlayer("p1", "Alice", 1);
      const e2 = sim.addPlayer("p2", "Bob", 2);
      const e3 = sim.addPlayer("p3", "Charlie", 3);
      const e4 = sim.addPlayer("p4", "Dave", 4);
      expect(e1.playerIndex).toBe(1);
      expect(e2.playerIndex).toBe(2);
      expect(e3.playerIndex).toBe(3);
      expect(e4.playerIndex).toBe(4);
    });

    it("includes playerIndex in snapshot entities", () => {
      sim.addPlayer("p1", "Alice", 3);
      const snapshot = sim.getSnapshot();
      const playerEntity = snapshot.entities.find((e) => e.kind === "player_ship");
      expect(playerEntity?.playerIndex).toBe(3);
    });
  });

  describe("removePlayer", () => {
    it("removes player and their entity", () => {
      sim.addPlayer("p1");
      expect(sim.entities.size).toBe(1);
      sim.removePlayer("p1");
      expect(sim.entities.size).toBe(0);
      expect(sim.players.size).toBe(0);
    });

    it("does nothing for non-existent player", () => {
      sim.removePlayer("nonexistent");
      expect(sim.entities.size).toBe(0);
    });
  });

  describe("setInput", () => {
    it("updates player input state", () => {
      sim.addPlayer("p1");
      const input = {
        up: true, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      };
      sim.setInput("p1", input);
      const player = sim.players.get("p1");
      expect(player!.input).toEqual(input);
    });

    it("does nothing for non-existent player", () => {
      const input = {
        up: true, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      };
      sim.setInput("nonexistent", input);
    });
  });

  describe("movement", () => {
    it("accelerates player from rest when input is pressed", () => {
      const entity = sim.addPlayer("p1");
      const startX = entity.pos.x;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: true,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      // After one tick from rest: vel.x = PLAYER_ACCEL * dt, pos moves by vel * dt
      const dt = 1 / TICK_RATE;
      const expectedVel = PLAYER_ACCEL * dt;
      expect(entity.vel.x).toBeCloseTo(expectedVel, 3);
      expect(entity.pos.x).toBeCloseTo(startX + expectedVel * dt, 3);
    });

    it("approaches max speed after enough ticks", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: true,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      // Need ceil(PLAYER_MAX_SPEED / (PLAYER_ACCEL / TICK_RATE)) ticks to reach max speed
      for (let i = 0; i < 20; i++) sim.update();

      expect(entity.vel.x).toBeCloseTo(PLAYER_MAX_SPEED, 1);
    });

    it("does not move player with no input", () => {
      const entity = sim.addPlayer("p1");
      const startX = entity.pos.x;
      const startY = entity.pos.y;

      sim.update();

      expect(entity.pos.x).toBeCloseTo(startX, 5);
      expect(entity.pos.y).toBeCloseTo(startY, 5);
    });

    it("brakes to zero when input is released after moving", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      // Accelerate to near max speed
      sim.setInput("p1", {
        up: false, down: false, left: false, right: true,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      for (let i = 0; i < 20; i++) sim.update();
      expect(entity.vel.x).toBeGreaterThan(0);

      // Release input — brake applies
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      for (let i = 0; i < 60; i++) sim.update();

      expect(entity.vel.x).toBeCloseTo(0, 1);
    });

    it("normalizes diagonal movement direction at max speed", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: true, down: false, left: false, right: true,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      // Run enough ticks to reach max speed diagonally
      for (let i = 0; i < 20; i++) sim.update();

      // At max speed, each diagonal component = PLAYER_MAX_SPEED / sqrt(2)
      const expectedComponent = PLAYER_MAX_SPEED / Math.sqrt(2);
      expect(entity.vel.x).toBeCloseTo(expectedComponent, 1);
      expect(entity.vel.y).toBeCloseTo(-expectedComponent, 1);
    });

    it("clamps position to world bounds", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 5;
      entity.pos.y = 5;

      sim.setInput("p1", {
        up: true, down: false, left: true, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });

      for (let i = 0; i < 100; i++) sim.update();

      expect(entity.pos.x).toBeGreaterThanOrEqual(0);
      expect(entity.pos.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe("bullet spawning", () => {
    it("spawns a bullet when fire is pressed", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 400;
      entity.pos.y = 300;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const bullets = Array.from(sim.entities.values()).filter(
        (e) => e.kind === "bullet"
      );
      expect(bullets).toHaveLength(1);
      expect(bullets[0].team).toBe(entity.team);
      expect(sim.bullets.size).toBe(1);
    });

    it("spawns bullet in the direction of aimAngle", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 400;
      entity.pos.y = 300;

      // Aim right (angle = 0)
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const bullet = Array.from(sim.entities.values()).find(
        (e) => e.kind === "bullet"
      )!;
      expect(bullet.vel.x).toBeCloseTo(BULLET_SPEED, 1);
      expect(bullet.vel.y).toBeCloseTo(0, 1);
      expect(bullet.pos.x).toBeGreaterThan(entity.pos.x);
    });

    it("respects fire cooldown", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 400;
      entity.pos.y = 300;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });

      // First tick: bullet spawns
      sim.update();
      expect(sim.bullets.size).toBe(1);

      // Next few ticks during cooldown: no new bullets
      sim.update();
      sim.update();
      expect(sim.bullets.size).toBe(1);

      // After cooldown expires: another bullet spawns
      for (let i = 0; i < FIRE_COOLDOWN_TICKS; i++) sim.update();
      expect(sim.bullets.size).toBe(2);
    });

    it("does not spawn bullet when fire is false", () => {
      sim.addPlayer("p1");

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      expect(sim.bullets.size).toBe(0);
    });
  });

  describe("bullet movement", () => {
    it("moves bullets each tick", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 400;
      entity.pos.y = 300;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const bullet = Array.from(sim.entities.values()).find(
        (e) => e.kind === "bullet"
      )!;
      const bulletX = bullet.pos.x;

      // Stop firing, advance a tick
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const dt = 1 / TICK_RATE;
      expect(bullet.pos.x).toBeCloseTo(bulletX + BULLET_SPEED * dt, 1);
    });

    it("removes bullets after TTL expires", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: Math.PI / 2, // aim down to stay in bounds longer
      });
      sim.update();
      expect(sim.bullets.size).toBe(1);

      // Stop firing
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });

      // Advance past TTL (bullet may also go OOB, which is also removal)
      for (let i = 0; i < BULLET_TTL_TICKS + 1; i++) sim.update();

      expect(sim.bullets.size).toBe(0);
    });

    it("removes bullets that leave world bounds", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH - 10;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0, // aim right, toward edge
      });
      sim.update();

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });

      // Advance until bullet exits
      for (let i = 0; i < 10; i++) sim.update();

      expect(sim.bullets.size).toBe(0);
    });

    it("removes bullets that exceed max range", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0, // aim right
      });
      sim.update();
      expect(sim.bullets.size).toBe(1);

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });

      // Calculate ticks needed to exceed max range
      const ticksToExceedRange = Math.ceil(BULLET_MAX_RANGE / (BULLET_SPEED / TICK_RATE)) + 1;
      for (let i = 0; i < ticksToExceedRange; i++) sim.update();

      expect(sim.bullets.size).toBe(0);
    });

    it("bullet origin position is recorded at spawn", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 500;
      entity.pos.y = 600;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const bulletState = Array.from(sim.bullets.values())[0];
      // Origin is where the bullet spawns (slightly offset from player by radius)
      expect(Math.abs(bulletState.originPos.x - 500)).toBeLessThan(30);
      expect(Math.abs(bulletState.originPos.y - 600)).toBeLessThan(30);
    });
  });

  describe("collisions", () => {
    it("bullet damages enemy entity on collision", () => {
      // Create two players on different teams
      const p1Entity = sim.addPlayer("p1");
      p1Entity.pos.x = 100;
      p1Entity.pos.y = 300;
      p1Entity.team = 1;

      const p2Entity = sim.addPlayer("p2");
      p2Entity.pos.x = 130; // close enough for bullet to hit quickly
      p2Entity.pos.y = 300;
      p2Entity.team = 2;

      const startHp = p2Entity.hp;

      // Fire once then stop
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0, // aim right toward p2
      });
      sim.update();
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, fireMissile: false, aimAngle: 0,
      });

      // Run ticks until collision
      for (let i = 0; i < 10; i++) sim.update();

      expect(p2Entity.hp).toBe(startHp - BULLET_DAMAGE);
    });

    it("bullet does not damage same-team entities", () => {
      const p1Entity = sim.addPlayer("p1");
      p1Entity.pos.x = 100;
      p1Entity.pos.y = 300;
      p1Entity.team = 1;

      const p2Entity = sim.addPlayer("p2");
      p2Entity.pos.x = 130;
      p2Entity.pos.y = 300;
      p2Entity.team = 1; // same team

      const startHp = p2Entity.hp;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });

      for (let i = 0; i < 10; i++) sim.update();

      expect(p2Entity.hp).toBe(startHp);
    });

    it("bullet is destroyed on hit", () => {
      const p1Entity = sim.addPlayer("p1");
      p1Entity.pos.x = 100;
      p1Entity.pos.y = 300;
      p1Entity.team = 1;

      const p2Entity = sim.addPlayer("p2");
      p2Entity.pos.x = 130;
      p2Entity.pos.y = 300;
      p2Entity.team = 2;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });

      // Run until collision
      for (let i = 0; i < 10; i++) sim.update();

      // Bullet should be gone after hitting
      expect(sim.bullets.size).toBe(0);
    });

    it("player entity is respawned with full HP when killed", () => {
      const p1Entity = sim.addPlayer("p1");
      p1Entity.pos.x = 100;
      p1Entity.pos.y = 300;
      p1Entity.team = 1;

      const p2Entity = sim.addPlayer("p2");
      p2Entity.pos.x = 130;
      p2Entity.pos.y = 300;
      p2Entity.team = 2;
      p2Entity.hp = BULLET_DAMAGE; // will die in one hit

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });

      for (let i = 0; i < 10; i++) sim.update();

      // p2's entity should be respawned (same ID, full HP, new position)
      expect(sim.entities.has(p2Entity.id)).toBe(true);
      const respawned = sim.entities.get(p2Entity.id)!;
      expect(respawned.hp).toBe(PLAYER_HP);
    });

    it("non-player entity is removed when HP reaches 0", () => {
      const p1Entity = sim.addPlayer("p1");
      p1Entity.pos.x = 100;
      p1Entity.pos.y = 300;

      const enemy = sim.spawnEnemy("minion_ship", 130, 300);
      enemy.hp = BULLET_DAMAGE; // will die in one hit

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });

      for (let i = 0; i < 10; i++) sim.update();

      expect(sim.entities.has(enemy.id)).toBe(false);
    });
  });

  describe("getSnapshot", () => {
    it("returns valid snapshot schema", () => {
      sim.addPlayer("p1");
      sim.update();

      const snapshot = sim.getSnapshot();
      const result = SnapshotMessageSchema.safeParse(snapshot);
      expect(result.success).toBe(true);
    });

    it("includes all entities including bullets", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 400;
      entity.pos.y = 300;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: true, fireMissile: false, aimAngle: 0,
      });
      sim.update();

      const snapshot = sim.getSnapshot();
      expect(snapshot.entities).toHaveLength(2); // player + bullet
    });

    it("includes correct tick", () => {
      sim.update();
      sim.update();
      sim.update();
      expect(sim.getSnapshot().tick).toBe(3);
    });

    it("has correct message type and version", () => {
      const snapshot = sim.getSnapshot();
      expect(snapshot.v).toBe(1);
      expect(snapshot.type).toBe("snapshot");
    });
  });
});

describe("circlesOverlap", () => {
  it("returns true for overlapping circles", () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10)).toBe(true);
  });

  it("returns true for touching circles", () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 20, y: 0 }, 10)).toBe(true);
  });

  it("returns false for separated circles", () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 25, y: 0 }, 10)).toBe(false);
  });

  it("returns true for concentric circles", () => {
    expect(circlesOverlap({ x: 5, y: 5 }, 10, { x: 5, y: 5 }, 5)).toBe(true);
  });

  it("handles diagonal distance correctly", () => {
    // Distance = sqrt(10^2 + 10^2) = ~14.14, radii sum = 15
    expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 10, y: 10 }, 5)).toBe(true);
    // Distance = sqrt(20^2 + 20^2) = ~28.28, radii sum = 15
    expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 20, y: 20 }, 5)).toBe(false);
  });
});

describe("missile_tower spawnEnemy", () => {
  it("spawns a missile_tower with correct properties", () => {
    const sim = new Simulation();
    const mt = sim.spawnEnemy("missile_tower", 700, 400);
    expect(mt.kind).toBe("missile_tower");
    expect(mt.hp).toBe(MISSILE_TOWER_HP);
    expect(mt.team).toBe(ENEMY_TEAM);
    expect(mt.pos).toEqual({ x: 700, y: 400 });
    expect(sim.entities.has(mt.id)).toBe(true);
  });
});

describe("missile physics", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("spawnMissile creates a missile entity in missiles map", () => {
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    sim.spawnMissile(tower, tower.id, 0);

    expect(sim.missiles.size).toBe(1);
    const missile = Array.from(sim.entities.values()).find(e => e.kind === "missile");
    expect(missile).toBeDefined();
    expect(missile!.team).toBe(ENEMY_TEAM);
  });

  it("missile moves each tick", () => {
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    sim.spawnMissile(tower, tower.id, 0); // aim right
    const missile = Array.from(sim.entities.values()).find(e => e.kind === "missile")!;
    const startX = missile.pos.x;

    sim.update();

    expect(missile.pos.x).toBeGreaterThan(startX);
  });

  it("missile steers toward nearest enemy", () => {
    // Tower fires missile heading right (angle 0), but player is directly below
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    sim.spawnMissile(tower, tower.id, 0); // initial heading: right
    const missile = Array.from(sim.entities.values()).find(e => e.kind === "missile")!;

    // Place player far below the missile's current path
    const player = sim.addPlayer("p1");
    player.pos.x = missile.pos.x;
    player.pos.y = missile.pos.y + 800;

    const velYBefore = missile.vel.y;

    // Run a few ticks of steering
    for (let i = 0; i < 5; i++) sim.update();

    // Missile should have turned downward (positive vy) toward the player
    expect(missile.vel.y).toBeGreaterThan(velYBefore);
  });

  it("missile expires after TTL", () => {
    const tower = sim.spawnEnemy("missile_tower", WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    sim.spawnMissile(tower, tower.id, 0);
    expect(sim.missiles.size).toBe(1);

    // Advance past TTL with no target so missile flies in a straight line
    for (let i = 0; i < MISSILE_TTL_TICKS + 5; i++) sim.update();

    expect(sim.missiles.size).toBe(0);
  });

  it("missile damages player on contact", () => {
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    const player = sim.addPlayer("p1");
    // Place player far enough right to avoid body collision with the tower
    // (tower radius 24 + player radius 16 = 40; use 100px gap to be safe)
    player.pos.x = 600;
    player.pos.y = 300;

    sim.spawnMissile(tower, tower.id, 0); // aim right at player
    const startHp = player.hp;

    for (let i = 0; i < 10; i++) sim.update();

    expect(player.hp).toBe(startHp - MISSILE_DAMAGE);
  });

  it("missile is destroyed when it hits a player", () => {
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    const player = sim.addPlayer("p1");
    player.pos.x = 540;
    player.pos.y = 300;

    sim.spawnMissile(tower, tower.id, 0);

    for (let i = 0; i < 10; i++) sim.update();

    expect(sim.missiles.size).toBe(0);
  });

  it("player bullet can shoot down a missile", () => {
    const player = sim.addPlayer("p1");
    player.pos.x = 300;
    player.pos.y = 300;

    const tower = sim.spawnEnemy("missile_tower", 600, 300);
    // Spawn missile heading left toward player
    sim.spawnMissile(tower, tower.id, Math.PI);
    const missile = Array.from(sim.entities.values()).find(e => e.kind === "missile")!;

    // Fire player bullet right at the missile
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });

    for (let i = 0; i < 30; i++) sim.update();

    // Missile should be destroyed
    expect(sim.entities.has(missile.id)).toBe(false);
  });

  it("missile is cleaned up from missiles map when destroyed", () => {
    const tower = sim.spawnEnemy("missile_tower", 500, 300);
    const player = sim.addPlayer("p1");
    player.pos.x = 540;
    player.pos.y = 300;

    sim.spawnMissile(tower, tower.id, 0);
    expect(sim.missiles.size).toBe(1);

    for (let i = 0; i < 10; i++) sim.update();

    expect(sim.missiles.size).toBe(0);
    const missileEntities = Array.from(sim.entities.values()).filter(e => e.kind === "missile");
    expect(missileEntities).toHaveLength(0);
  });
});

describe("energy orbs", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("does not spawn orbs before cooldown expires", () => {
    sim.addPlayer("p1");
    // First tick should not spawn orb (cooldown starts at ORB_SPAWN_INTERVAL_TICKS)
    sim.update();
    const orbs = Array.from(sim.entities.values()).filter(e => e.kind === "energy_orb");
    expect(orbs).toHaveLength(0);
  });

  it("spawns an orb after cooldown expires", () => {
    sim.addPlayer("p1");
    for (let i = 0; i < ORB_SPAWN_INTERVAL_TICKS + 1; i++) sim.update();

    const orbs = Array.from(sim.entities.values()).filter(e => e.kind === "energy_orb");
    expect(orbs.length).toBeGreaterThanOrEqual(1);
  });

  it("orbs are neutral team 0", () => {
    sim.addPlayer("p1");
    for (let i = 0; i < ORB_SPAWN_INTERVAL_TICKS + 1; i++) sim.update();

    const orb = Array.from(sim.entities.values()).find(e => e.kind === "energy_orb");
    expect(orb).toBeDefined();
    expect(orb!.team).toBe(0);
  });

  it("does not exceed ORB_MAX_ON_MAP", () => {
    sim.addPlayer("p1");
    // Run enough ticks to potentially exceed max
    for (let i = 0; i < (ORB_MAX_ON_MAP + 50) * ORB_SPAWN_INTERVAL_TICKS; i++) {
      sim.update();
    }
    const orbs = Array.from(sim.entities.values()).filter(e => e.kind === "energy_orb");
    expect(orbs.length).toBeLessThanOrEqual(ORB_MAX_ON_MAP);
  });

  it("spawns orbs at fully random positions across the map", () => {
    // With Math.random mocked to 0.5, orb should land at map center (± padding)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      sim.addPlayer("p1");
      for (let i = 0; i < ORB_SPAWN_INTERVAL_TICKS + 1; i++) sim.update();

      const orb = Array.from(sim.entities.values()).find(e => e.kind === "energy_orb");
      expect(orb).toBeDefined();
      // pos should be near center (not biased toward player position)
      expect(orb!.pos.x).toBeGreaterThan(ORB_SPAWN_PADDING);
      expect(orb!.pos.y).toBeGreaterThan(ORB_SPAWN_PADDING);
      expect(orb!.pos.x).toBeLessThan(WORLD_WIDTH - ORB_SPAWN_PADDING);
      expect(orb!.pos.y).toBeLessThan(WORLD_HEIGHT - ORB_SPAWN_PADDING);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("player picks up orb on overlap and gains XP", () => {
    const player = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;

    // Manually place an orb at the player's position
    const orbId = "test-orb";
    sim.entities.set(orbId, {
      id: orbId,
      kind: "energy_orb",
      pos: { x: player.pos.x, y: player.pos.y },
      vel: { x: 0, y: 0 },
      hp: 1,
      team: 0,
    });

    expect(ps.xp).toBe(0);
    sim.update();

    // Orb should be collected and XP awarded
    expect(ps.xp).toBe(ORB_XP_VALUE);
    expect(sim.entities.has(orbId)).toBe(false);
  });

  it("bullets do not collide with orbs", () => {
    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = 300;

    // Place an orb in the bullet's path
    const orbId = "test-orb";
    sim.entities.set(orbId, {
      id: orbId,
      kind: "energy_orb",
      pos: { x: 140, y: 300 },
      vel: { x: 0, y: 0 },
      hp: 1,
      team: 0,
    });

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    // Orb should still be there (bullet passes through)
    // Note: orb may have been picked up by player if overlapping - move orb further
    // Check that a bullet still exists (wasn't consumed by orb)
    expect(sim.bullets.size).toBe(1);
  });
});

describe("initOrbs", () => {
  it("seeds exactly ORB_INITIAL_COUNT orbs", () => {
    const sim = new Simulation();
    sim.initOrbs();
    const orbs = Array.from(sim.entities.values()).filter(e => e.kind === "energy_orb");
    expect(orbs).toHaveLength(ORB_INITIAL_COUNT);
  });

  it("all seeded orbs are within map bounds", () => {
    const sim = new Simulation();
    sim.initOrbs();
    for (const orb of sim.entities.values()) {
      if (orb.kind !== "energy_orb") continue;
      expect(orb.pos.x).toBeGreaterThanOrEqual(ORB_SPAWN_PADDING);
      expect(orb.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - ORB_SPAWN_PADDING);
      expect(orb.pos.y).toBeGreaterThanOrEqual(ORB_SPAWN_PADDING);
      expect(orb.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT - ORB_SPAWN_PADDING);
    }
  });

  it("seeded orbs are neutral team 0 with hp 1", () => {
    const sim = new Simulation();
    sim.initOrbs();
    for (const orb of sim.entities.values()) {
      if (orb.kind !== "energy_orb") continue;
      expect(orb.team).toBe(0);
      expect(orb.hp).toBe(1);
    }
  });
});

describe("collectOrbForEnemy", () => {
  it("marks the orb dead and adds to pendingEnemyResources", () => {
    const sim = new Simulation();
    const orbId = "test-orb";
    sim.entities.set(orbId, {
      id: orbId, kind: "energy_orb",
      pos: { x: 500, y: 500 }, vel: { x: 0, y: 0 }, hp: 1, team: 0,
    });

    expect(sim.pendingEnemyResources).toBe(0);
    sim.collectOrbForEnemy(orbId);

    expect(sim.entities.get(orbId)!.hp).toBe(0);
    expect(sim.pendingEnemyResources).toBe(MINION_ORB_RESOURCE);
  });

  it("is a no-op for a dead or missing orb", () => {
    const sim = new Simulation();
    sim.collectOrbForEnemy("nonexistent");
    expect(sim.pendingEnemyResources).toBe(0);
  });
});

describe("kill XP", () => {
  let sim: Simulation;

  beforeEach(() => { sim = new Simulation(); });

  it("killing a minion awards MINION_KILL_XP to the player", () => {
    const playerEntity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    // Pre-level to 2 so xpToNext=28, safely above MINION_KILL_XP (10)
    sim.awardXP(ps, xpForLevel(1));
    expect(ps.level).toBe(2);
    playerEntity.pos = { x: 100, y: 300 };

    const minion = sim.spawnEnemy("minion_ship", 150, 300);
    sim.spawnBullet(playerEntity, "p1", 0, minion.hp);
    sim.update();

    expect(ps.xp).toBe(MINION_KILL_XP);
  });

  it("killing a tower awards TOWER_KILL_XP to the player", () => {
    const playerEntity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    // Pre-level to 3 so xpToNext=51, safely above TOWER_KILL_XP (32)
    sim.awardXP(ps, xpForLevel(1) + xpForLevel(2));
    expect(ps.level).toBe(3);
    playerEntity.pos = { x: 100, y: 300 };

    const tower = sim.spawnEnemy("tower", 120, 300);
    sim.spawnBullet(playerEntity, "p1", 0, tower.hp);
    sim.update();

    expect(ps.xp).toBe(TOWER_KILL_XP);
  });

  it("partial damage (no kill) awards no kill XP", () => {
    const playerEntity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    playerEntity.pos = { x: 100, y: 300 };

    const minion = sim.spawnEnemy("minion_ship", 150, 300);
    sim.spawnBullet(playerEntity, "p1", 0, minion.hp - 1); // leave 1 hp
    sim.update();

    expect(ps.xp).toBe(0);
  });
});

describe("XP & leveling", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("player starts at level 1 with 0 XP", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    expect(ps.level).toBe(1);
    expect(ps.xp).toBe(0);
    expect(ps.xpToNext).toBe(xpForLevel(1));
  });

  it("awardXP increases player XP", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 5);
    expect(ps.xp).toBe(5);
  });

  it("player levels up when XP exceeds threshold", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    const needed = xpForLevel(1); // XP to go from 1→2
    sim.awardXP(ps, needed);
    expect(ps.level).toBe(2);
    expect(ps.xp).toBe(0);
    expect(ps.xpToNext).toBe(xpForLevel(2));
  });

  it("handles multiple level-ups from a single large XP award", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    // Award enough for several levels
    const totalForLevel5 = xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + xpForLevel(4);
    sim.awardXP(ps, totalForLevel5);
    expect(ps.level).toBe(5);
    expect(ps.xp).toBe(0);
  });

  it("caps at MAX_LEVEL", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    // Award massive XP
    sim.awardXP(ps, 999999);
    expect(ps.level).toBe(MAX_LEVEL);
    expect(ps.xp).toBe(0);
    expect(ps.xpToNext).toBe(0);
  });

  it("does not gain XP past MAX_LEVEL", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 999999); // max out
    sim.awardXP(ps, 100); // try to award more
    expect(ps.level).toBe(MAX_LEVEL);
    expect(ps.xp).toBe(0);
  });

  it("XP scaling increases with level", () => {
    const xp1 = xpForLevel(1);
    const xp5 = xpForLevel(5);
    const xp10 = xpForLevel(10);
    expect(xp5).toBeGreaterThan(xp1);
    expect(xp10).toBeGreaterThan(xp5);
  });

  it("snapshot includes level/xp/xpToNext for player entities", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 5);
    sim.update();

    const snapshot = sim.getSnapshot();
    const playerEntity = snapshot.entities.find(e => e.kind === "player_ship");
    expect(playerEntity).toBeDefined();
    expect(playerEntity!.level).toBe(1);
    expect(playerEntity!.xp).toBe(5);
    expect(playerEntity!.xpToNext).toBe(xpForLevel(1));
  });

  it("death resets level and XP to starting values", () => {
    const player = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 200); // level up a few times

    const levelBefore = ps.level;
    expect(levelBefore).toBeGreaterThan(1);

    // Kill the player
    player.hp = 0;
    sim.update(); // removeDeadEntities + respawnDeadPlayers

    expect(ps.level).toBe(1);
    expect(ps.xp).toBe(0);
    expect(ps.xpToNext).toBe(xpForLevel(1));
  });

  it("respawned player has full HP", () => {
    const player = sim.addPlayer("p1");
    player.hp = 0;
    sim.update();

    const respawned = sim.entities.get(player.id);
    expect(respawned).toBeDefined();
    expect(respawned!.hp).toBe(PLAYER_HP);
  });

  it("snapshot validates against SnapshotMessageSchema with new fields", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 50);
    sim.update();

    const snapshot = sim.getSnapshot();
    const result = SnapshotMessageSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
  });
});

describe("stat upgrades", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("player starts with zero upgrades, 1 cannon, 0 pending", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    expect(ps.upgrades).toEqual({ damage: 0, speed: 0, health: 0, fire_rate: 0 });
    expect(ps.cannons).toBe(1);
    expect(ps.pendingUpgrades).toBe(0);
  });

  it("level-up at non-milestone grants a pending upgrade point", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    const needed = xpForLevel(1); // level 1→2
    sim.awardXP(ps, needed);
    expect(ps.level).toBe(2);
    expect(ps.pendingUpgrades).toBe(1);
    expect(ps.cannons).toBe(1); // no cannon change
  });

  it("level-up at milestone grants cannon upgrade, no pending point", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    // Level to 5 (a milestone)
    let totalXP = 0;
    for (let lvl = 1; lvl < 5; lvl++) totalXP += xpForLevel(lvl);
    sim.awardXP(ps, totalXP);
    expect(ps.level).toBe(5);
    expect(ps.cannons).toBe(2);
    // Levels 2,3,4 give pending points (3 total), level 5 gives cannon not point
    expect(ps.pendingUpgrades).toBe(3);
  });

  it("all milestone levels grant correct cannon counts", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;

    // Level to 10
    let totalXP = 0;
    for (let lvl = 1; lvl < 10; lvl++) totalXP += xpForLevel(lvl);
    sim.awardXP(ps, totalXP);
    expect(ps.level).toBe(10);
    expect(ps.cannons).toBe(3);

    // Level to 15
    let moreXP = 0;
    for (let lvl = 10; lvl < 15; lvl++) moreXP += xpForLevel(lvl);
    sim.awardXP(ps, moreXP);
    expect(ps.level).toBe(15);
    expect(ps.cannons).toBe(4);
  });

  it("total pending upgrade points across full leveling is 12", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, 999999);
    expect(ps.level).toBe(MAX_LEVEL);
    // 14 level-ups total (2-15), 3 milestones (5,10,15) → 11 stat points
    // Wait: levels 2,3,4,6,7,8,9,11,12,13,14 = 11 non-milestone levels + 3 milestones = 14 total
    // Actually: level 1→15 is 14 level-ups. Milestones at 5,10,15 = 3 auto-cannon. So 14-3=11 pending.
    // Hmm, let me recount: levels you reach = 2,3,4,5,6,7,8,9,10,11,12,13,14,15 = 14 level-ups
    // Milestones: 5,10,15 = 3 cannon upgrades (no pending point)
    // Non-milestones: 2,3,4,6,7,8,9,11,12,13,14 = 11 stat points
    expect(ps.pendingUpgrades).toBe(11);
  });

  it("applyUpgrade succeeds and increments stat", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, xpForLevel(1)); // level 2, 1 pending
    expect(ps.pendingUpgrades).toBe(1);

    const result = sim.applyUpgrade("p1", "damage");
    expect(result).toBe(true);
    expect(ps.upgrades.damage).toBe(1);
    expect(ps.pendingUpgrades).toBe(0);
  });

  it("applyUpgrade fails when no pending points", () => {
    sim.addPlayer("p1");
    const result = sim.applyUpgrade("p1", "damage");
    expect(result).toBe(false);
  });

  it("applyUpgrade fails when stat is at max", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    ps.upgrades.damage = MAX_UPGRADE_PER_STAT;
    ps.pendingUpgrades = 1;

    const result = sim.applyUpgrade("p1", "damage");
    expect(result).toBe(false);
    expect(ps.upgrades.damage).toBe(MAX_UPGRADE_PER_STAT);
    expect(ps.pendingUpgrades).toBe(1);
  });

  it("applyUpgrade fails for non-existent player", () => {
    const result = sim.applyUpgrade("nonexistent", "damage");
    expect(result).toBe(false);
  });

  it("health upgrade heals player to new max HP", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    entity.hp = 50; // damaged
    ps.pendingUpgrades = 1;

    sim.applyUpgrade("p1", "health");
    expect(entity.hp).toBe(PLAYER_HP + HEALTH_PER_UPGRADE);
  });

  it("speed upgrade raises max speed cap", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    // Run enough ticks to reach base max speed
    sim.setInput("p1", {
      up: false, down: false, left: false, right: true,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    for (let i = 0; i < 20; i++) sim.update();
    expect(entity.vel.x).toBeCloseTo(PLAYER_MAX_SPEED, 1);

    // Reset velocity and position, then apply speed upgrade and saturate again
    entity.vel.x = 0;
    entity.vel.y = 0;
    entity.pos.x = WORLD_WIDTH / 2;
    ps.upgrades.speed = 3;
    for (let i = 0; i < 25; i++) sim.update();

    const expectedMaxSpeed = PLAYER_MAX_SPEED + 3 * SPEED_PER_UPGRADE;
    expect(entity.vel.x).toBeCloseTo(expectedMaxSpeed, 1);
  });

  it("speed upgrade increases thrust acceleration per tick", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: true,
      fire: false, fireMissile: false, aimAngle: 0,
    });

    // One tick from rest with no upgrades
    sim.update();
    const velNoUpgrade = entity.vel.x;

    // Reset and apply 3 speed upgrades
    entity.vel.x = 0;
    entity.vel.y = 0;
    entity.pos.x = WORLD_WIDTH / 2;
    ps.upgrades.speed = 3;
    sim.update();

    expect(entity.vel.x).toBeGreaterThan(velNoUpgrade);
    const dt = 1 / TICK_RATE;
    expect(entity.vel.x).toBeCloseTo((PLAYER_ACCEL + 3 * ACCEL_PER_SPEED_UPGRADE) * dt, 1);
  });

  it("effective fire cooldown decreases with fire_rate upgrades", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    ps.upgrades.fire_rate = 3;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });

    // First tick fires
    sim.update();
    expect(sim.bullets.size).toBe(1);

    // Effective cooldown = FIRE_COOLDOWN_TICKS - 3 = 3
    // After 3 ticks, should fire again (ticks 2,3,4 are cooldown, tick 5 fires)
    const effectiveCooldown = FIRE_COOLDOWN_TICKS - 3 * FIRE_RATE_PER_UPGRADE;
    for (let i = 0; i < effectiveCooldown; i++) sim.update();
    expect(sim.bullets.size).toBe(2);
  });

  it("effective damage increases with damage upgrades", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    entity.pos.x = 100;
    entity.pos.y = 300;
    ps.upgrades.damage = 2;

    const enemy = sim.spawnEnemy("minion_ship", 130, 300);
    const startHp = enemy.hp;

    // Fire once, then stop
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0,
    });

    for (let i = 0; i < 10; i++) sim.update();

    const expectedDamage = BULLET_DAMAGE + 2 * DAMAGE_PER_UPGRADE;
    expect(enemy.hp).toBe(startHp - expectedDamage);
  });

  it("fire rate cooldown minimum is 1 tick", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    ps.upgrades.fire_rate = 10; // cooldown = max(1, 12 - 10*1.2) = max(1, 0) = 1 tick

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });

    // Should fire every tick
    sim.update(); // fires tick 1
    sim.update(); // fires tick 2
    sim.update(); // fires tick 3
    expect(sim.bullets.size).toBe(3);
  });
});

describe("multi-cannon firing", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("1 cannon fires 1 bullet", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();
    expect(sim.bullets.size).toBe(1);
  });

  it("2 cannons fire 2 bullets in spread", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;
    ps.cannons = 2;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();
    expect(sim.bullets.size).toBe(2);

    const bullets = Array.from(sim.entities.values()).filter(e => e.kind === "bullet");
    expect(bullets).toHaveLength(2);
    // One should have positive vy, one negative (spread above/below aim line)
    const vys = bullets.map(b => b.vel.y).sort((a, b) => a - b);
    expect(vys[0]).toBeLessThan(0);
    expect(vys[1]).toBeGreaterThan(0);
  });

  it("3 cannons fire 3 bullets", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;
    ps.cannons = 3;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();
    expect(sim.bullets.size).toBe(3);
  });

  it("4 cannons fire 4 bullets", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;
    ps.cannons = 4;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();
    expect(sim.bullets.size).toBe(4);
  });

  it("getCannonAngles returns correct spread for 2 cannons", () => {
    const angles = getCannonAngles(0, 2);
    expect(angles).toHaveLength(2);
    expect(angles[0]).toBeCloseTo(-CANNON_SPREAD_ANGLE / 2);
    expect(angles[1]).toBeCloseTo(CANNON_SPREAD_ANGLE / 2);
  });

  it("getCannonAngles returns center and spread for 3 cannons", () => {
    const angles = getCannonAngles(0, 3);
    expect(angles).toHaveLength(3);
    expect(angles[0]).toBeCloseTo(-CANNON_SPREAD_ANGLE);
    expect(angles[1]).toBeCloseTo(0);
    expect(angles[2]).toBeCloseTo(CANNON_SPREAD_ANGLE);
  });

  it("getCannonAngles returns 1 angle for 1 cannon", () => {
    const angles = getCannonAngles(Math.PI / 4, 1);
    expect(angles).toHaveLength(1);
    expect(angles[0]).toBeCloseTo(Math.PI / 4);
  });

  it("multi-cannon bullets use effective damage", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = 100;
    entity.pos.y = 300;
    const ps = sim.players.get("p1")!;
    ps.cannons = 2;
    ps.upgrades.damage = 3;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    // Both bullets should have effective damage
    const expectedDamage = BULLET_DAMAGE + 3 * DAMAGE_PER_UPGRADE;
    for (const bullet of sim.bullets.values()) {
      expect(bullet.damage).toBe(expectedDamage);
    }
  });
});

describe("upgrade death reset", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("death resets upgrades, cannons, and pending points", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;

    // Level up and apply upgrades
    sim.awardXP(ps, 999999);
    ps.pendingUpgrades = 3;
    sim.applyUpgrade("p1", "damage");
    sim.applyUpgrade("p1", "speed");
    sim.applyUpgrade("p1", "health");

    expect(ps.upgrades.damage).toBeGreaterThan(0);
    expect(ps.cannons).toBeGreaterThan(1);

    // Kill the player
    entity.hp = 0;
    sim.update();

    expect(ps.level).toBe(1);
    expect(ps.xp).toBe(0);
    expect(ps.upgrades).toEqual({ damage: 0, speed: 0, health: 0, fire_rate: 0 });
    expect(ps.cannons).toBe(1);
    expect(ps.pendingUpgrades).toBe(0);
  });

  it("respawned player has base HP (not upgraded max HP)", () => {
    const entity = sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    ps.upgrades.health = 3;

    entity.hp = 0;
    sim.update();

    const respawned = sim.entities.get(entity.id);
    expect(respawned).toBeDefined();
    expect(respawned!.hp).toBe(PLAYER_HP); // base HP, not upgraded
  });

  it("snapshot includes upgrade fields for player entities", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, xpForLevel(1)); // level 2
    sim.applyUpgrade("p1", "damage");
    sim.update();

    const snapshot = sim.getSnapshot();
    const playerEntity = snapshot.entities.find(e => e.kind === "player_ship");
    expect(playerEntity).toBeDefined();
    expect(playerEntity!.upgrades).toEqual({ damage: 1, speed: 0, health: 0, fire_rate: 0 });
    expect(playerEntity!.cannons).toBe(1);
    expect(playerEntity!.pendingUpgrades).toBe(0);
  });

  it("snapshot with upgrade fields validates against schema", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    sim.awardXP(ps, xpForLevel(1));
    sim.applyUpgrade("p1", "speed");
    sim.update();

    const snapshot = sim.getSnapshot();
    const result = SnapshotMessageSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
  });
});

describe("getEffectiveMaxHp", () => {
  it("returns base HP with no upgrades", () => {
    const sim = new Simulation();
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    expect(getEffectiveMaxHp(ps)).toBe(PLAYER_HP);
  });

  it("returns increased HP with health upgrades", () => {
    const sim = new Simulation();
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    ps.upgrades.health = 3;
    expect(getEffectiveMaxHp(ps)).toBe(PLAYER_HP + 3 * HEALTH_PER_UPGRADE);
  });
});

describe("bullet recoil physics", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("entity vel starts at zero on spawn", () => {
    const entity = sim.addPlayer("p1");
    expect(entity.vel).toEqual({ x: 0, y: 0 });
  });

  it("firing adds recoil impulse to entity.vel opposite to aimAngle", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    // Aim right (angle = 0) with no movement — recoil should push vel leftward
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    expect(entity.vel.x).toBeCloseTo(-BULLET_RECOIL_FORCE, 1);
    expect(entity.vel.y).toBeCloseTo(0, 1);
  });

  it("speed upgrade reduces recoil impulse proportionally", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;
    ps.upgrades.speed = 3;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const expectedRecoil = BULLET_RECOIL_FORCE * (1 - 3 * RECOIL_REDUCTION_PER_SPEED_UPGRADE);
    expect(entity.vel.x).toBeCloseTo(-expectedRecoil, 1);
    expect(entity.vel.y).toBeCloseTo(0, 1);
  });

  it("max speed upgrade (5) reduces recoil to 25% of base", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const ps = sim.players.get("p1")!;
    ps.upgrades.speed = 5;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const expectedRecoil = BULLET_RECOIL_FORCE * (1 - 5 * RECOIL_REDUCTION_PER_SPEED_UPGRADE);
    expect(entity.vel.x).toBeCloseTo(-expectedRecoil, 1);
  });

  it("entity vel decays with PLAYER_BRAKE_FRICTION when no input held", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    // Seed a known velocity directly
    entity.vel.x = 100;
    entity.vel.y = 0;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    expect(entity.vel.x).toBeCloseTo(100 * PLAYER_BRAKE_FRICTION, 1);
  });

  it("recoil impulse can push vel beyond max speed", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    // Saturate velocity rightward first (many ticks pressing right)
    sim.setInput("p1", {
      up: false, down: false, left: false, right: true,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    for (let i = 0; i < 30; i++) sim.update();
    // Now fire leftward — recoil pushes right, past max speed
    sim.setInput("p1", {
      up: false, down: false, left: false, right: true,
      fire: true, fireMissile: false, aimAngle: Math.PI,
    });
    sim.update();

    expect(entity.vel.x).toBeGreaterThan(PLAYER_MAX_SPEED);
  });

  it("shooting opposite to movement direction boosts next-tick movement", () => {
    // Recoil is applied to vel AFTER pos is updated, so its effect on position
    // shows up in the FOLLOWING tick. We compare movement one tick after releasing
    // keys: with vs without leftward-shot recoil (which pushes vel rightward).
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    // Establish baseline: coast at max speed for one tick with no thrust
    entity.vel.x = PLAYER_MAX_SPEED;
    entity.vel.y = 0;
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: false, fireMissile: false, aimAngle: 0 });
    const baselineStart = entity.pos.x;
    sim.update();
    const distWithout = entity.pos.x - baselineStart; // = PLAYER_MAX_SPEED * BRAKE_FRICTION / TICK_RATE

    // Now fire leftward while at max speed — recoil pushes vel.x above PLAYER_MAX_SPEED
    entity.vel.x = PLAYER_MAX_SPEED;
    entity.vel.y = 0;
    entity.pos.x = baselineStart;
    // Fire tick (pos still moves at PLAYER_MAX_SPEED this tick; recoil enters vel)
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: true, fireMissile: false, aimAngle: Math.PI });
    sim.update();
    // Coast tick: no thrust — vel.x = (PLAYER_MAX_SPEED + BULLET_RECOIL_FORCE) * BRAKE_FRICTION
    const afterFireX = entity.pos.x;
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: false, fireMissile: false, aimAngle: 0 });
    sim.update();
    const distWithRecoil = entity.pos.x - afterFireX;

    expect(distWithRecoil).toBeGreaterThan(distWithout);
  });

  it("shooting in movement direction reduces next-tick movement", () => {
    // Recoil in the direction of travel reduces vel.x below PLAYER_MAX_SPEED.
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    // Establish baseline: coast at max speed for one tick with no thrust
    entity.vel.x = PLAYER_MAX_SPEED;
    entity.vel.y = 0;
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: false, fireMissile: false, aimAngle: 0 });
    const baselineStart = entity.pos.x;
    sim.update();
    const distWithout = entity.pos.x - baselineStart;

    // Fire rightward while at max speed — recoil pushes vel.x below PLAYER_MAX_SPEED
    entity.vel.x = PLAYER_MAX_SPEED;
    entity.vel.y = 0;
    entity.pos.x = baselineStart;
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: true, fireMissile: false, aimAngle: 0 });
    sim.update();
    // Coast tick: vel.x = (PLAYER_MAX_SPEED - BULLET_RECOIL_FORCE) * BRAKE_FRICTION
    const afterFireX = entity.pos.x;
    sim.setInput("p1", { up: false, down: false, left: false, right: false, fire: false, fireMissile: false, aimAngle: 0 });
    sim.update();
    const distWithRecoil = entity.pos.x - afterFireX;

    expect(distWithRecoil).toBeLessThan(distWithout);
  });

  it("entity vel resets to zero on player respawn", () => {
    const entity = sim.addPlayer("p1");
    entity.vel.x = 100;
    entity.vel.y = -50;

    // Kill the player
    entity.hp = 0;
    sim.update(); // removes dead entity and respawns

    // After respawn the new entity should have zero velocity
    const player = sim.players.get("p1")!;
    const newEntity = sim.entities.get(player.entityId)!;
    expect(newEntity.vel).toEqual({ x: 0, y: 0 });
  });

  it("entity vel snaps to zero below threshold when braking", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    entity.vel.x = 0.05;
    entity.vel.y = -0.05;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    expect(entity.vel.x).toBe(0);
    expect(entity.vel.y).toBe(0);
  });
});

describe("bullet origin offset", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("single cannon bullet spawns at center (no lateral offset)", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const player = sim.players.get("p1")!;
    player.cannons = 1;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0, // aim right
    });
    sim.update();

    // Find the bullet
    const bullets = Array.from(sim.entities.values()).filter(e => e.kind === "bullet");
    expect(bullets.length).toBe(1);

    // Bullet spawns at center + radius offset, then moves one tick
    const dt = 1 / TICK_RATE;
    const spawnOffsetX = PLAYER_RADIUS + BULLET_RADIUS + 2;
    const expectedX = WORLD_WIDTH / 2 + spawnOffsetX + BULLET_SPEED * dt;
    const expectedY = WORLD_HEIGHT / 2; // no lateral offset, no vertical velocity
    expect(bullets[0].pos.x).toBeCloseTo(expectedX, 1);
    expect(bullets[0].pos.y).toBeCloseTo(expectedY, 1);
  });

  it("2-cannon bullets spawn at symmetric lateral offsets", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const player = sim.players.get("p1")!;
    player.cannons = 2;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const bullets = Array.from(sim.entities.values()).filter(e => e.kind === "bullet");
    expect(bullets.length).toBe(2);

    // With aimAngle=0, perpendicular is PI/2 (downward in screen coords)
    // Bullet 0: lateralOffset = -0.5 * CANNON_OFFSET_LATERAL (upward)
    // Bullet 1: lateralOffset = +0.5 * CANNON_OFFSET_LATERAL (downward)
    const yOffsets = bullets.map(b => b.pos.y - WORLD_HEIGHT / 2).sort((a, b) => a - b);
    expect(yOffsets[0]).toBeLessThan(0); // one above center
    expect(yOffsets[1]).toBeGreaterThan(0); // one below center
    // Symmetric
    expect(Math.abs(yOffsets[0])).toBeCloseTo(Math.abs(yOffsets[1]), 1);
  });

  it("4-cannon bullets have 4 distinct spawn positions", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;
    const player = sim.players.get("p1")!;
    player.cannons = 4;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const bullets = Array.from(sim.entities.values()).filter(e => e.kind === "bullet");
    expect(bullets.length).toBe(4);

    // All should have distinct positions
    const positions = bullets.map(b => `${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(4);
  });
});

describe("snapshot aimAngle", () => {
  it("snapshot includes aimAngle for player_ship entities", () => {
    const sim = new Simulation();
    sim.addPlayer("p1");
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 1.23,
    });

    const snapshot = sim.getSnapshot();
    const playerEntity = snapshot.entities.find(e => e.kind === "player_ship");
    expect(playerEntity).toBeDefined();
    expect(playerEntity!.aimAngle).toBeCloseTo(1.23, 5);
  });

  it("snapshot aimAngle matches most recent player input", () => {
    const sim = new Simulation();
    sim.addPlayer("p1");

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0.5,
    });
    let snapshot = sim.getSnapshot();
    expect(snapshot.entities.find(e => e.kind === "player_ship")!.aimAngle).toBeCloseTo(0.5, 5);

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: -2.1,
    });
    snapshot = sim.getSnapshot();
    expect(snapshot.entities.find(e => e.kind === "player_ship")!.aimAngle).toBeCloseTo(-2.1, 5);
  });

  it("snapshot validates against SnapshotMessageSchema with aimAngle", () => {
    const sim = new Simulation();
    sim.addPlayer("p1");
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0.75,
    });

    const snapshot = sim.getSnapshot();
    expect(() => SnapshotMessageSchema.parse(snapshot)).not.toThrow();
  });
});

describe("ownerKind on bullets", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("player bullet carries ownerKind 'player_ship'", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const bullet = Array.from(sim.entities.values()).find(e => e.kind === "bullet")!;
    expect(bullet.ownerKind).toBe("player_ship");
  });

  it("tower bullet carries ownerKind 'tower'", () => {
    const tower = sim.spawnEnemy("tower", 500, 300);
    sim.spawnBullet(tower, tower.id, 0);

    const bullet = Array.from(sim.entities.values()).find(e => e.kind === "bullet")!;
    expect(bullet.ownerKind).toBe("tower");
  });

  it("ownerKind is included in snapshot", () => {
    const entity = sim.addPlayer("p1");
    entity.pos.x = WORLD_WIDTH / 2;
    entity.pos.y = WORLD_HEIGHT / 2;

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });
    sim.update();

    const snapshot = sim.getSnapshot();
    const bullet = snapshot.entities.find(e => e.kind === "bullet");
    expect(bullet).toBeDefined();
    expect(bullet!.ownerKind).toBe("player_ship");
  });
});

describe("player right-click missile", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("fires a homing missile on right-click", () => {
    const player = sim.addPlayer("p1");
    player.pos = { x: 500, y: 500 };
    player.vel = { x: 0, y: 0 };

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();

    const missiles = Array.from(sim.entities.values()).filter(e => e.kind === "missile");
    expect(missiles.length).toBe(1);
    expect(missiles[0].team).toBe(1);
  });

  it("respects 30-second cooldown", () => {
    const player = sim.addPlayer("p1");
    player.pos = { x: 500, y: 500 };
    player.vel = { x: 0, y: 0 };

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();

    // First missile should fire
    let missiles = Array.from(sim.entities.values()).filter(e => e.kind === "missile");
    expect(missiles.length).toBe(1);

    // Second attempt immediately should not fire a new missile
    sim.update();
    missiles = Array.from(sim.entities.values()).filter(e => e.kind === "missile");
    expect(missiles.length).toBe(1);
  });

  it("missile deals 5x effective bullet damage", () => {
    const player = sim.addPlayer("p1");
    player.pos = { x: 500, y: 500 };
    player.vel = { x: 0, y: 0 };

    // Spawn an enemy directly to the right
    const enemy = sim.spawnEnemy("tower", 530, 500);
    const initialHp = enemy.hp;

    // Fire missile on first tick
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();

    // Run remaining ticks for missile to reach and hit the enemy
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    for (let i = 0; i < 30; i++) {
      sim.update();
    }

    // Expected damage = BULLET_DAMAGE * 5 = 50
    expect(enemy.hp).toBe(initialHp - BULLET_DAMAGE * 5);
  });

  it("missile damage scales with damage upgrades", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    const entity = sim.entities.get(ps.entityId)!;
    entity.pos = { x: 500, y: 500 };
    entity.vel = { x: 0, y: 0 };

    // Apply max damage upgrades
    ps.pendingUpgrades = MAX_UPGRADE_PER_STAT;
    for (let i = 0; i < MAX_UPGRADE_PER_STAT; i++) {
      sim.applyUpgrade("p1", "damage");
    }

    const enemy = sim.spawnEnemy("tower", 530, 500);
    const initialHp = enemy.hp;

    // Fire missile on first tick
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();

    // Run remaining ticks for missile to reach and hit the enemy
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: false, aimAngle: 0,
    });
    for (let i = 0; i < 30; i++) {
      sim.update();
    }

    // effectiveDamage = BULLET_DAMAGE + MAX_UPGRADE_PER_STAT * DAMAGE_PER_UPGRADE = 10 + 15 = 25
    // missileDamage = 25 * 5 = 125
    const expectedDamage = (BULLET_DAMAGE + MAX_UPGRADE_PER_STAT * DAMAGE_PER_UPGRADE) * 5;
    expect(enemy.hp).toBe(initialHp - expectedDamage);
  });

  it("includes missileCooldown in snapshot", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    const entity = sim.entities.get(ps.entityId)!;
    entity.pos = { x: 500, y: 500 };
    entity.vel = { x: 0, y: 0 };

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();

    const snapshot = sim.getSnapshot();
    const playerEntity = snapshot.entities.find(e => e.kind === "player_ship");
    expect(playerEntity).toBeDefined();
    expect(playerEntity!.missileCooldown).toBeGreaterThan(0);
  });

  it("resets missileCooldown on death/respawn", () => {
    sim.addPlayer("p1");
    const ps = sim.players.get("p1")!;
    const entity = sim.entities.get(ps.entityId)!;
    entity.pos = { x: 500, y: 500 };
    entity.vel = { x: 0, y: 0 };

    // Fire missile to start cooldown
    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: false, fireMissile: true, aimAngle: 0,
    });
    sim.update();
    expect(ps.missileCooldown).toBeGreaterThan(0);

    // Kill the player
    entity.hp = 0;
    sim.update(); // removes dead, respawns

    expect(ps.missileCooldown).toBe(0);
  });
});
