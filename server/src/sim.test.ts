import { describe, it, expect, beforeEach } from "vitest";
import { Simulation, circlesOverlap } from "./sim.js";
import {
  PLAYER_HP,
  PLAYER_SPEED,
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
        fire: false, aimAngle: 0,
      };
      sim.setInput("p1", input);
      const player = sim.players.get("p1");
      expect(player!.input).toEqual(input);
    });

    it("does nothing for non-existent player", () => {
      const input = {
        up: true, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
      };
      sim.setInput("nonexistent", input);
    });
  });

  describe("movement", () => {
    it("moves player when input is pressed", () => {
      const entity = sim.addPlayer("p1");
      const startX = entity.pos.x;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: true,
        fire: false, aimAngle: 0,
      });
      sim.update();

      const dt = 1 / TICK_RATE;
      expect(entity.pos.x).toBeCloseTo(startX + PLAYER_SPEED * dt, 5);
    });

    it("does not move player with no input", () => {
      const entity = sim.addPlayer("p1");
      const startX = entity.pos.x;
      const startY = entity.pos.y;

      sim.update();

      expect(entity.pos.x).toBeCloseTo(startX, 5);
      expect(entity.pos.y).toBeCloseTo(startY, 5);
    });

    it("normalizes diagonal movement", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: true, down: false, left: false, right: true,
        fire: false, aimAngle: 0,
      });
      sim.update();

      expect(entity.vel.x).toBeCloseTo(PLAYER_SPEED / Math.sqrt(2), 5);
      expect(entity.vel.y).toBeCloseTo(-PLAYER_SPEED / Math.sqrt(2), 5);
    });

    it("clamps position to world bounds", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = 5;
      entity.pos.y = 5;

      sim.setInput("p1", {
        up: true, down: false, left: true, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0,
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
        fire: true, aimAngle: 0,
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
        fire: true, aimAngle: 0,
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
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0,
      });
      sim.update();

      const bullet = Array.from(sim.entities.values()).find(
        (e) => e.kind === "bullet"
      )!;
      const bulletX = bullet.pos.x;

      // Stop firing, advance a tick
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: Math.PI / 2, // aim down to stay in bounds longer
      });
      sim.update();
      expect(sim.bullets.size).toBe(1);

      // Stop firing
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0, // aim right, toward edge
      });
      sim.update();

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0, // aim right
      });
      sim.update();
      expect(sim.bullets.size).toBe(1);

      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0,
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
        fire: true, aimAngle: 0, // aim right toward p2
      });
      sim.update();
      sim.setInput("p1", {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
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
        fire: true, aimAngle: 0,
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
        fire: true, aimAngle: 0,
      });

      // Run until collision
      for (let i = 0; i < 10; i++) sim.update();

      // Bullet should be gone after hitting
      expect(sim.bullets.size).toBe(0);
    });

    it("entity is removed when HP reaches 0", () => {
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
        fire: true, aimAngle: 0,
      });

      for (let i = 0; i < 10; i++) sim.update();

      // p2's entity should be removed
      expect(sim.entities.has(p2Entity.id)).toBe(false);
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
        fire: true, aimAngle: 0,
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
    // Place player directly in front of the missile spawn point
    player.pos.x = 540;
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
      fire: true, aimAngle: 0,
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
