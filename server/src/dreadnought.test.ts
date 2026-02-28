import { describe, it, expect, beforeEach } from "vitest";
import { Simulation, entityRadius, applyDirectionalArmor } from "./sim.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import {
  DREADNOUGHT_HP,
  DREADNOUGHT_RADIUS,
  DREADNOUGHT_KILL_XP,
  DREADNOUGHT_BODY_COLLISION_DAMAGE,
  DREADNOUGHT_FRONT_ARMOR,
  DREADNOUGHT_FRONT_ARC,
  MINE_HP,
  MINE_RADIUS,
  MINE_DAMAGE,
  MINE_TTL_TICKS,
  MINE_TRIGGER_RADIUS,
  ENEMY_TEAM,
  PLAYER_HP,
  PLAYER_RADIUS,
  BULLET_DAMAGE,
  UNIT_COSTS,
  UNIT_CAPS,
  BODY_COLLISION_COOLDOWN_TICKS,
  Entity,
  xpForLevel,
} from "shared";

describe("Dreadnought", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe("spawnEnemy", () => {
    it("creates a dreadnought with correct HP, team, and kind", () => {
      const entity = sim.spawnEnemy("dreadnought", 100, 200);
      expect(entity.kind).toBe("dreadnought");
      expect(entity.hp).toBe(DREADNOUGHT_HP);
      expect(entity.team).toBe(ENEMY_TEAM);
      expect(entity.pos.x).toBe(100);
      expect(entity.pos.y).toBe(200);
    });
  });

  describe("entityRadius", () => {
    it("returns correct radius for dreadnought", () => {
      expect(entityRadius("dreadnought")).toBe(DREADNOUGHT_RADIUS);
    });

    it("returns correct radius for mine", () => {
      expect(entityRadius("mine")).toBe(MINE_RADIUS);
    });
  });

  describe("body collision", () => {
    it("dreadnought deals DREADNOUGHT_BODY_COLLISION_DAMAGE on contact", () => {
      const player = sim.addPlayer("p1");
      const dread = sim.spawnEnemy("dreadnought", player.pos.x, player.pos.y);

      // Move them on top of each other
      dread.pos.x = player.pos.x;
      dread.pos.y = player.pos.y;

      sim.update();

      expect(player.hp).toBe(PLAYER_HP - DREADNOUGHT_BODY_COLLISION_DAMAGE);
    });
  });

  describe("kill XP", () => {
    it("awards DREADNOUGHT_KILL_XP when killed by a player", () => {
      const player = sim.addPlayer("p1");
      const playerEntity = sim.entities.get(player.id)!;
      const ps = sim.players.get("p1")!;

      // Pre-level to 5 so xpToNext=111, safely above DREADNOUGHT_KILL_XP (100)
      sim.awardXP(ps, xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + xpForLevel(4));
      expect(ps.level).toBe(5);

      // Position: player at (100,300), dread at (160,300)
      // Distance=60 > PLAYER_RADIUS+DREADNOUGHT_RADIUS=52 (no body collision)
      // Bullet spawns at ~(122,300), after 1 tick moves to ~(135,300)
      // 135 to 160 = 25 < DREADNOUGHT_RADIUS+BULLET_RADIUS = 40 (collision!)
      playerEntity.pos = { x: 100, y: 300 };

      const dread = sim.spawnEnemy("dreadnought", 160, 300);
      dread.aimAngle = 0; // facing right — bullet from left hits the BACK (no armor)

      sim.spawnBullet(playerEntity, "p1", 0, dread.hp);
      sim.update();

      expect(sim.entities.has(dread.id)).toBe(false);
      expect(ps.xp).toBe(DREADNOUGHT_KILL_XP);
    });
  });
});

describe("Mine", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe("spawnMine", () => {
    it("creates a mine at owner position", () => {
      const dread = sim.spawnEnemy("dreadnought", 300, 400);
      const mine = sim.spawnMine(dread, dread.id);

      expect(mine.kind).toBe("mine");
      expect(mine.hp).toBe(MINE_HP);
      expect(mine.team).toBe(ENEMY_TEAM);
      expect(mine.pos.x).toBe(300);
      expect(mine.pos.y).toBe(400);
      expect(mine.vel.x).toBe(0);
      expect(mine.vel.y).toBe(0);
    });

    it("registers mine in mines map", () => {
      const dread = sim.spawnEnemy("dreadnought", 300, 400);
      const mine = sim.spawnMine(dread, dread.id);

      expect(sim.mines.has(mine.id)).toBe(true);
      const state = sim.mines.get(mine.id)!;
      expect(state.ttl).toBe(MINE_TTL_TICKS);
      expect(state.damage).toBe(MINE_DAMAGE);
    });
  });

  describe("TTL", () => {
    it("mine expires after MINE_TTL_TICKS", () => {
      const dread = sim.spawnEnemy("dreadnought", 300, 400);
      const mine = sim.spawnMine(dread, dread.id);

      // Run for TTL ticks
      for (let i = 0; i < MINE_TTL_TICKS + 1; i++) {
        sim.update();
      }

      expect(sim.entities.has(mine.id)).toBe(false);
      expect(sim.mines.has(mine.id)).toBe(false);
    });
  });

  describe("detonation", () => {
    it("deals MINE_DAMAGE to player on contact", () => {
      const player = sim.addPlayer("p1");
      const dread = sim.spawnEnemy("dreadnought", 2000, 2000);
      const mine = sim.spawnMine(dread, dread.id);

      // Place mine right on top of player
      mine.pos.x = player.pos.x;
      mine.pos.y = player.pos.y;

      sim.update();

      expect(player.hp).toBe(PLAYER_HP - MINE_DAMAGE);
      // Mine should be destroyed
      expect(sim.entities.has(mine.id)).toBe(false);
    });

    it("does not trigger on same-team entities", () => {
      // Mines are team 2, dreadnought is team 2 — should not detonate
      const dread = sim.spawnEnemy("dreadnought", 300, 400);
      const mine = sim.spawnMine(dread, dread.id);
      const minion = sim.spawnEnemy("minion_ship", 300, 400);
      minion.pos.x = mine.pos.x;
      minion.pos.y = mine.pos.y;

      sim.update();

      // Mine should still exist (didn't trigger on same-team minion)
      expect(mine.hp).toBe(MINE_HP);
    });

    it("does not trigger on non-player entities", () => {
      // Even an enemy-team entity that's not a player_ship shouldn't trigger mines
      // (Mines only trigger on player_ship)
      const dread = sim.spawnEnemy("dreadnought", 2000, 2000);
      const mine = sim.spawnMine(dread, dread.id);

      // Mines are team 2, place a team 2 tower at same spot — should not trigger
      const tower = sim.spawnEnemy("tower", mine.pos.x, mine.pos.y);

      sim.update();

      // Mine still alive
      expect(mine.hp).toBe(MINE_HP);
    });
  });

  describe("cleanup", () => {
    it("mine removed from mines map on death", () => {
      const dread = sim.spawnEnemy("dreadnought", 300, 400);
      const mine = sim.spawnMine(dread, dread.id);

      mine.hp = 0;
      sim.update();

      expect(sim.mines.has(mine.id)).toBe(false);
      expect(sim.entities.has(mine.id)).toBe(false);
    });
  });
});

describe("Directional Armor", () => {
  it("bullet hitting front of dreadnought deals 25% damage", () => {
    const target: Entity = {
      id: "d1",
      kind: "dreadnought",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: DREADNOUGHT_HP,
      team: ENEMY_TEAM,
      aimAngle: 0, // facing right
    };

    // Bullet coming from the right (hitting the front)
    const bulletPos = { x: 200, y: 100 };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE * DREADNOUGHT_FRONT_ARMOR);
  });

  it("bullet hitting back of dreadnought deals full damage", () => {
    const target: Entity = {
      id: "d1",
      kind: "dreadnought",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: DREADNOUGHT_HP,
      team: ENEMY_TEAM,
      aimAngle: 0, // facing right
    };

    // Bullet coming from the left (hitting the back)
    const bulletPos = { x: 0, y: 100 };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE);
  });

  it("bullet hitting side of dreadnought deals full damage", () => {
    const target: Entity = {
      id: "d1",
      kind: "dreadnought",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: DREADNOUGHT_HP,
      team: ENEMY_TEAM,
      aimAngle: 0, // facing right
    };

    // Bullet coming from above (hitting the side — 90° from facing)
    const bulletPos = { x: 100, y: 0 };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE);
  });

  it("applies armor correctly at exact front arc boundary", () => {
    const target: Entity = {
      id: "d1",
      kind: "dreadnought",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: DREADNOUGHT_HP,
      team: ENEMY_TEAM,
      aimAngle: 0,
    };

    // Bullet at exactly FRONT_ARC angle from front — should still get armor
    const angle = DREADNOUGHT_FRONT_ARC; // ±60° boundary
    const bulletPos = {
      x: 100 + Math.cos(angle) * 50,
      y: 100 + Math.sin(angle) * 50,
    };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE * DREADNOUGHT_FRONT_ARMOR);
  });

  it("does not apply armor to non-dreadnought entities", () => {
    const target: Entity = {
      id: "t1",
      kind: "tower",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: 100,
      team: ENEMY_TEAM,
    };

    const bulletPos = { x: 200, y: 100 };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE); // full damage, no armor
  });

  it("handles angle normalization across -PI/PI boundary", () => {
    const target: Entity = {
      id: "d1",
      kind: "dreadnought",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      hp: DREADNOUGHT_HP,
      team: ENEMY_TEAM,
      aimAngle: Math.PI * 0.95, // facing almost directly left
    };

    // Bullet from directly left (front hit, angle wraps around -PI/PI)
    const bulletPos = { x: 0, y: 100 };
    const result = applyDirectionalArmor(target, bulletPos, BULLET_DAMAGE);
    expect(result).toBe(BULLET_DAMAGE * DREADNOUGHT_FRONT_ARMOR);
  });
});

describe("Dreadnought AI", () => {
  let sim: Simulation;
  let ai: AIManager;

  beforeEach(() => {
    sim = new Simulation();
    ai = new AIManager();
  });

  it("dreadnought moves toward nearest player", () => {
    const player = sim.addPlayer("p1");
    const playerEntity = sim.entities.get(player.id)!;
    playerEntity.pos.x = 1000;
    playerEntity.pos.y = 1000;

    const dread = sim.spawnEnemy("dreadnought", 500, 500);
    ai.registerEntity(dread.id);

    const startDist = Math.sqrt(
      (dread.pos.x - playerEntity.pos.x) ** 2 +
      (dread.pos.y - playerEntity.pos.y) ** 2,
    );

    // Run several AI ticks
    for (let i = 0; i < 30; i++) {
      ai.update(sim);
    }

    const endDist = Math.sqrt(
      (dread.pos.x - playerEntity.pos.x) ** 2 +
      (dread.pos.y - playerEntity.pos.y) ** 2,
    );

    expect(endDist).toBeLessThan(startDist);
  });

  it("dreadnought sets aimAngle to velocity direction", () => {
    const player = sim.addPlayer("p1");
    const playerEntity = sim.entities.get(player.id)!;
    playerEntity.pos.x = 1000;
    playerEntity.pos.y = 500;

    const dread = sim.spawnEnemy("dreadnought", 500, 500);
    ai.registerEntity(dread.id);

    for (let i = 0; i < 30; i++) {
      ai.update(sim);
    }

    // Should be facing roughly right (toward x=1000)
    expect(dread.aimAngle).toBeDefined();
    expect(Math.abs(dread.aimAngle!)).toBeLessThan(Math.PI / 4);
  });

  it("dreadnought lays mines while moving", () => {
    const player = sim.addPlayer("p1");
    const playerEntity = sim.entities.get(player.id)!;
    playerEntity.pos.x = 2000;
    playerEntity.pos.y = 2000;

    const dread = sim.spawnEnemy("dreadnought", 1000, 1000);
    ai.registerEntity(dread.id);

    // Run enough ticks for mine laying cooldown to expire and some movement
    for (let i = 0; i < 120; i++) {
      sim.update();
      ai.update(sim);
    }

    const mines = Array.from(sim.entities.values()).filter(e => e.kind === "mine");
    expect(mines.length).toBeGreaterThan(0);
  });
});

describe("Dreadnought Economy", () => {
  let economy: Economy;
  let sim: Simulation;
  let ai: AIManager;

  beforeEach(() => {
    economy = new Economy();
    sim = new Simulation();
    ai = new AIManager();
  });

  it("dreadnought costs 1000 credits", () => {
    expect(UNIT_COSTS.dreadnought).toBe(1000);
  });

  it("dreadnought cap is 1", () => {
    expect(UNIT_CAPS.dreadnought).toBe(1);
  });

  it("can build dreadnought with sufficient funds", () => {
    economy.balance = 1500;
    const msPos = { x: 2000, y: 2000 };
    const result = economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);
    expect(result.ok).toBe(true);
    expect(economy.balance).toBe(500);
  });

  it("cannot build dreadnought without sufficient funds", () => {
    economy.balance = 500;
    const msPos = { x: 2000, y: 2000 };
    const result = economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("insufficient_funds");
  });

  it("cannot build second dreadnought while one exists", () => {
    economy.balance = 3000;
    const msPos = { x: 2000, y: 2000 };

    // Build first
    economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);
    // Process the build
    sim.tick = sim.tick + 100;
    economy.update(sim, ai);

    // Try to build second
    const result = economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("cap_reached");
  });

  it("cannot build second dreadnought while one is queued", () => {
    economy.balance = 3000;
    const msPos = { x: 2000, y: 2000 };

    // Queue first
    economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);

    // Try second while first is still in queue
    const result = economy.requestBuild({ unitKind: "dreadnought" }, sim, msPos);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("cap_reached");
  });
});
