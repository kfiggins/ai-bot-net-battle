import { describe, it, expect } from "vitest";
import { Simulation, entityRadius, circlesOverlap, GrenadeState } from "./sim.js";
import { AIManager } from "./ai.js";
import {
  GRENADER_HP,
  GRENADER_RADIUS,
  GRENADER_KILL_XP,
  GRENADER_BODY_COLLISION_DAMAGE,
  GRENADE_HP,
  GRENADE_RADIUS,
  GRENADE_SPEED,
  GRENADE_DAMAGE,
  GRENADE_BLAST_RADIUS,
  GRENADE_FUSE_MIN_TICKS,
  GRENADE_FUSE_MAX_TICKS,
  GRENADE_TRAVEL_TTL,
  GRENADE_ARM_DISTANCE,
  GRENADER_FIRE_RANGE,
  GRENADER_FIRE_COOLDOWN,
  TICK_RATE,
  ENEMY_TEAM,
  getDifficultyProfile,
  xpForLevel,
} from "shared";

describe("Grenader", () => {
  describe("Spawn", () => {
    it("spawns with correct HP and team", () => {
      const sim = new Simulation();
      const g = sim.spawnEnemy("grenader", 500, 500);
      expect(g.kind).toBe("grenader");
      expect(g.hp).toBe(GRENADER_HP);
      expect(g.team).toBe(ENEMY_TEAM);
    });

    it("has correct radius", () => {
      expect(entityRadius("grenader")).toBe(GRENADER_RADIUS);
    });
  });

  describe("Grenade", () => {
    describe("Spawn", () => {
      it("spawns grenade with correct properties", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        const targetPos = { x: 700, y: 500 };
        const aimAngle = 0; // facing right
        const grenade = sim.spawnGrenade(owner, owner.id, aimAngle, targetPos);

        expect(grenade.kind).toBe("grenade");
        expect(grenade.hp).toBe(GRENADE_HP);
        expect(grenade.team).toBe(owner.team);
        expect(entityRadius("grenade")).toBe(GRENADE_RADIUS);
      });

      it("stores grenade state correctly", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        const targetPos = { x: 700, y: 500 };
        const grenade = sim.spawnGrenade(owner, owner.id, 0, targetPos);

        const state = sim.grenades.get(grenade.id);
        expect(state).toBeDefined();
        expect(state!.armed).toBe(false);
        expect(state!.damage).toBe(GRENADE_DAMAGE);
        expect(state!.blastRadius).toBe(GRENADE_BLAST_RADIUS);
        expect(state!.targetPos).toEqual(targetPos);
        expect(state!.travelTtl).toBe(GRENADE_TRAVEL_TTL);
        expect(state!.fuseTicks).toBeGreaterThanOrEqual(GRENADE_FUSE_MIN_TICKS);
        expect(state!.fuseTicks).toBeLessThanOrEqual(GRENADE_FUSE_MAX_TICKS);
      });

      it("grenade has correct velocity toward target", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 700, y: 500 });

        // Facing right (aimAngle=0), so vel.x should be positive, vel.y ~0
        expect(grenade.vel.x).toBeCloseTo(GRENADE_SPEED, 0);
        expect(grenade.vel.y).toBeCloseTo(0, 0);
      });
    });

    describe("Travel", () => {
      it("moves toward target position", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 700, y: 500 });
        const startX = grenade.pos.x;

        sim.update(); // 1 tick

        expect(grenade.pos.x).toBeGreaterThan(startX);
      });

      it("arms when close to target position", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        // Target very close so it arms quickly
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 500 + GRENADE_RADIUS + 5, y: 500 });

        // Tick enough for grenade to reach target
        for (let i = 0; i < 30; i++) sim.update();

        const state = sim.grenades.get(grenade.id);
        if (state && grenade.hp > 0) {
          expect(state.armed).toBe(true);
          expect(grenade.vel.x).toBe(0);
          expect(grenade.vel.y).toBe(0);
        }
      });

      it("auto-arms when travel TTL expires", () => {
        const sim = new Simulation();
        const owner = sim.spawnEnemy("grenader", 500, 500);
        // Target far away so it never reaches
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 5000, y: 500 });

        // Tick for full travel TTL
        for (let i = 0; i < GRENADE_TRAVEL_TTL + 1; i++) sim.update();

        const state = sim.grenades.get(grenade.id);
        if (state && grenade.hp > 0) {
          expect(state.armed).toBe(true);
        }
      });
    });

    describe("Explosion", () => {
      it("explodes after fuse expires when armed", () => {
        const sim = new Simulation();
        const player = sim.addPlayer("p1", "Player", 1);
        // Place player far from grenade so they don't touch it
        const playerEntity = sim.entities.get(player.id)!;
        playerEntity.pos = { x: 2000, y: 2000 };

        const owner = sim.spawnEnemy("grenader", 500, 500);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 505, y: 500 });

        // Force arm immediately
        const state = sim.grenades.get(grenade.id)!;
        state.armed = true;
        state.fuseTicks = 5;
        grenade.vel = { x: 0, y: 0 };

        // Tick 5 times for fuse
        for (let i = 0; i < 6; i++) sim.update();

        // Grenade should be destroyed (hp <= 0 and removed)
        expect(sim.entities.has(grenade.id)).toBe(false);
      });

      it("damages players in blast radius", () => {
        const sim = new Simulation();
        const player = sim.addPlayer("p1", "Player", 1);
        const playerEntity = sim.entities.get(player.id)!;
        playerEntity.pos = { x: 530, y: 500 };
        const initialHp = playerEntity.hp;

        const owner = sim.spawnEnemy("grenader", 200, 200);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 500, y: 500 });
        grenade.pos = { x: 500, y: 500 };

        // Force arm with 1 tick fuse
        const state = sim.grenades.get(grenade.id)!;
        state.armed = true;
        state.fuseTicks = 1;
        grenade.vel = { x: 0, y: 0 };

        sim.update();

        // Player is within blast radius (30px < 80px blast radius)
        expect(playerEntity.hp).toBe(initialHp - GRENADE_DAMAGE);
      });

      it("does not damage players outside blast radius", () => {
        const sim = new Simulation();
        const player = sim.addPlayer("p1", "Player", 1);
        const playerEntity = sim.entities.get(player.id)!;
        playerEntity.pos = { x: 700, y: 500 }; // 200px away
        const initialHp = playerEntity.hp;

        const owner = sim.spawnEnemy("grenader", 200, 200);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 500, y: 500 });
        grenade.pos = { x: 500, y: 500 };

        // Force arm with 1 tick fuse
        const state = sim.grenades.get(grenade.id)!;
        state.armed = true;
        state.fuseTicks = 1;
        grenade.vel = { x: 0, y: 0 };

        sim.update();

        expect(playerEntity.hp).toBe(initialHp);
      });

      it("instant explodes on direct player contact when armed", () => {
        const sim = new Simulation();
        const player = sim.addPlayer("p1", "Player", 1);
        const playerEntity = sim.entities.get(player.id)!;
        playerEntity.pos = { x: 500, y: 500 };
        const initialHp = playerEntity.hp;

        const owner = sim.spawnEnemy("grenader", 200, 200);
        const grenade = sim.spawnGrenade(owner, owner.id, 0, { x: 500, y: 500 });
        grenade.pos = { x: 500, y: 500 }; // Same position as player

        // Force arm
        const state = sim.grenades.get(grenade.id)!;
        state.armed = true;
        state.fuseTicks = 100; // Long fuse — should still explode on contact
        grenade.vel = { x: 0, y: 0 };

        sim.update();

        // Player should take damage
        expect(playerEntity.hp).toBeLessThan(initialHp);
        // Grenade should be destroyed
        expect(sim.entities.has(grenade.id)).toBe(false);
      });
    });
  });

  describe("Body Collision", () => {
    it("grenader deals body collision damage", () => {
      const sim = new Simulation();
      const player = sim.addPlayer("p1", "Player", 1);
      const playerEntity = sim.entities.get(player.id)!;
      playerEntity.pos = { x: 100, y: 100 };
      const initialHp = playerEntity.hp;

      const g = sim.spawnEnemy("grenader", 100, 100);

      sim.update();

      // Player should take body collision damage
      expect(playerEntity.hp).toBe(initialHp - GRENADER_BODY_COLLISION_DAMAGE);
    });
  });

  describe("Kill XP", () => {
    it("awards XP when killed by player bullet", () => {
      const sim = new Simulation();
      const player = sim.addPlayer("p1", "Player", 1);
      const playerEntity = sim.entities.get(player.id)!;
      const playerState = sim.players.get("p1")!;

      // Pre-level to 3 so xpToNext=51, safely above GRENADER_KILL_XP (40)
      sim.awardXP(playerState, xpForLevel(1) + xpForLevel(2));
      expect(playerState.level).toBe(3);

      // Place close enough for bullet to hit in 1 tick
      playerEntity.pos = { x: 100, y: 300 };
      const g = sim.spawnEnemy("grenader", 150, 300);
      g.hp = 1; // low HP so one bullet kills

      // Fire bullet rightward with enough damage to kill
      sim.spawnBullet(playerEntity, "p1", 0, g.hp);
      sim.update();

      expect(playerState.xp).toBe(GRENADER_KILL_XP);
    });
  });
});

describe("Grenader AI", () => {
  it("fires grenades at players with predictive aim", () => {
    const profile = getDifficultyProfile("hard");
    const ai = new AIManager(profile);
    const sim = new Simulation();

    const grenader = sim.spawnEnemy("grenader", 500, 500);
    ai.registerEntity(grenader.id);

    // Add a player within fire range
    const player = sim.addPlayer("p1", "Player", 1);
    const playerEntity = sim.entities.get(player.id)!;
    playerEntity.pos = { x: 800, y: 500 }; // 300px away, within range
    playerEntity.vel = { x: 100, y: 0 }; // moving right

    // Set fire cooldown to 0 so it fires immediately
    const aiState = ai.aiStates.get(grenader.id)!;
    aiState.fireCooldown = 0;

    ai.update(sim);

    // Should have spawned a grenade
    const grenades = Array.from(sim.grenades.values());
    expect(grenades.length).toBeGreaterThanOrEqual(1);

    // The grenade's target position should be ahead of the player (predictive)
    const grenadeState = grenades[0];
    expect(grenadeState.targetPos.x).toBeGreaterThan(playerEntity.pos.x);
  });

  it("keeps distance from players", () => {
    const profile = getDifficultyProfile("hard");
    const ai = new AIManager(profile);
    const sim = new Simulation();

    const grenader = sim.spawnEnemy("grenader", 500, 500);
    ai.registerEntity(grenader.id);

    // Place player very close
    const player = sim.addPlayer("p1", "Player", 1);
    const playerEntity = sim.entities.get(player.id)!;
    playerEntity.pos = { x: 510, y: 500 }; // very close

    ai.update(sim);

    // Grenader should be moving away (negative x velocity)
    expect(grenader.vel.x).toBeLessThan(0);
  });
});
