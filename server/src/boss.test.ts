import { describe, it, expect, beforeEach } from "vitest";
import { BossManager } from "./boss.js";
import { Simulation } from "./sim.js";
import { MOTHERSHIP_HP, NEMESIS_HP, NEMESIS_RADIUS, ENEMY_TEAM, WORLD_WIDTH, WORLD_HEIGHT } from "shared";

describe("BossManager", () => {
  let boss: BossManager;
  let sim: Simulation;

  beforeEach(() => {
    boss = new BossManager();
    sim = new Simulation();
  });

  describe("spawnMothership", () => {
    it("creates a mothership entity", () => {
      const entity = boss.spawnMothership(sim);
      expect(entity.kind).toBe("mothership");
      expect(entity.hp).toBe(MOTHERSHIP_HP);
      expect(entity.team).toBe(ENEMY_TEAM);
      expect(sim.entities.has(entity.id)).toBe(true);
      expect(boss.mothershipId).toBe(entity.id);
    });

    it("places mothership at center of the map", () => {
      const entity = boss.spawnMothership(sim);
      expect(entity.pos.x).toBe(WORLD_WIDTH / 2);
      expect(entity.pos.y).toBe(WORLD_HEIGHT / 2);
    });
  });

  describe("shield mechanics", () => {
    it("mothership is shielded while towers exist (phase 1)", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);

      expect(boss.isShielded(sim)).toBe(true);
    });

    it("mothership becomes unshielded when all towers destroyed (transitions to phase 2)", () => {
      boss.spawnMothership(sim);
      const tower = sim.spawnEnemy("tower", 500, 300);

      boss.update(sim);
      expect(boss.phaseState.current).toBe(1);

      // Destroy tower
      sim.entities.delete(tower.id);
      boss.update(sim);

      expect(boss.phaseState.current).toBe(2);
    });

    it("in phase 2, shielded while minions exist", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("minion_ship", 500, 300);

      // Force to phase 2 (no towers)
      boss.phaseState.current = 2;

      expect(boss.isShielded(sim)).toBe(true);
    });

    it("in phase 3, mothership is vulnerable", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      expect(boss.isShielded(sim)).toBe(false);
    });

    it("shield prevents damage to mothership", () => {
      const mothership = boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);

      // Manually damage mothership
      mothership.hp -= 50;

      boss.update(sim);

      // Shield should restore HP
      expect(mothership.hp).toBe(MOTHERSHIP_HP);
    });
  });

  describe("phase transitions", () => {
    it("starts at phase 1", () => {
      expect(boss.phaseState.current).toBe(1);
    });

    it("transitions from phase 1 to 2 when towers cleared", () => {
      boss.spawnMothership(sim);
      const tower = sim.spawnEnemy("tower", 500, 300);

      boss.update(sim);
      expect(boss.phaseState.current).toBe(1);

      sim.entities.delete(tower.id);
      boss.update(sim);
      expect(boss.phaseState.current).toBe(2);
    });

    it("transitions from phase 2 to 3 when minions cleared", () => {
      boss.spawnMothership(sim);
      const minion = sim.spawnEnemy("minion_ship", 500, 300);

      boss.phaseState.current = 2;

      boss.update(sim);
      expect(boss.phaseState.current).toBe(2);

      sim.entities.delete(minion.id);
      boss.update(sim);
      expect(boss.phaseState.current).toBe(3);
    });

    it("does not skip phases", () => {
      boss.spawnMothership(sim);
      // No towers or minions
      boss.update(sim);

      // Should go 1 → 2 (towers cleared)
      expect(boss.phaseState.current).toBe(2);

      boss.update(sim);
      // Should go 2 → 3 (minions cleared)
      expect(boss.phaseState.current).toBe(3);
    });
  });

  describe("win condition", () => {
    it("mothership death starts death sequence — entity removed immediately, phase still 3", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      boss.update(sim);

      // Entity is removed right away
      expect(sim.entities.has(mothership.id)).toBe(false);
      // But Nemesis hasn't spawned yet — still in death sequence
      expect(boss.phaseState.current).toBe(3);
      expect(boss.nemesisId).toBeNull();
    });

    it("mothership death spawns Nemesis and transitions to phase 4 after death sequence", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      // Run through the 60-tick death sequence
      for (let i = 0; i < 62; i++) {
        boss.update(sim);
      }

      expect(boss.phaseState.current).toBe(4);
      expect(boss.phaseState.matchOver).toBe(false);
      expect(boss.nemesisId).not.toBeNull();
      const nemesis = sim.entities.get(boss.nemesisId!);
      expect(nemesis?.kind).toBe("nemesis");
      expect(nemesis?.hp).toBe(NEMESIS_HP);
    });

    it("mothership entity is removed on death", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      boss.update(sim);

      expect(sim.entities.has(mothership.id)).toBe(false);
    });

    it("match ends when Nemesis HP reaches 0", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;
      const nemesis = boss.spawnNemesis(sim, { x: 2000, y: 2000 });
      boss.phaseState.current = 4;

      nemesis.hp = 0;
      boss.update(sim);

      expect(boss.phaseState.matchOver).toBe(true);
      expect(boss.phaseState.winner).toBe("players");
    });

    it("does not process further updates after match over", () => {
      boss.spawnMothership(sim);
      boss.phaseState.matchOver = true;

      // Should be a no-op
      boss.update(sim);
      expect(boss.phaseState.matchOver).toBe(true);
    });
  });

  describe("getPhaseInfo", () => {
    it("returns correct phase 1 info", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);
      sim.spawnEnemy("tower", 600, 300);

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(1);
      expect(info.objectives).toContain("Destroy all towers");
      expect(info.remaining.tower).toBe(2);
      expect(info.mothershipShielded).toBe(true);
    });

    it("returns correct phase 2 info", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("minion_ship", 500, 300);
      boss.phaseState.current = 2;

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(2);
      expect(info.objectives).toContain("Destroy all minions");
      expect(info.remaining.minion_ship).toBe(1);
    });

    it("returns correct phase 3 info", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(3);
      expect(info.objectives).toContain("Destroy the mothership");
      expect(info.remaining.mothership).toBe(MOTHERSHIP_HP);
      expect(info.mothershipShielded).toBe(false);
    });

    it("returns matchOver status", () => {
      boss.spawnMothership(sim);
      boss.phaseState.matchOver = true;

      const info = boss.getPhaseInfo(sim);
      expect(info.matchOver).toBe(true);
    });
  });

  describe("nemesis teleport", () => {
    let nemesis: ReturnType<typeof boss.spawnNemesis>;

    beforeEach(() => {
      nemesis = boss.spawnNemesis(sim, { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
      boss.phaseState.current = 4;
      // No players in sim → movement AI is a no-op, isolating teleport behaviour
    });

    it("teleports into valid world bounds when HP crosses the 80% threshold", () => {
      nemesis.hp = Math.floor(NEMESIS_HP * 0.8) - 1;
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
      expect(nemesis.pos.y).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT - NEMESIS_RADIUS);
    });

    it("zeroes velocity on teleport", () => {
      nemesis.vel.x = 200;
      nemesis.vel.y = -150;
      nemesis.hp = Math.floor(NEMESIS_HP * 0.8) - 1;
      boss.update(sim);
      expect(nemesis.vel.x).toBe(0);
      expect(nemesis.vel.y).toBe(0);
    });

    it("does not teleport when HP is above all thresholds", () => {
      const startX = nemesis.pos.x;
      const startY = nemesis.pos.y;
      nemesis.hp = NEMESIS_HP; // full HP — above all thresholds
      boss.update(sim);
      expect(nemesis.pos.x).toBe(startX);
      expect(nemesis.pos.y).toBe(startY);
    });

    it("does not teleport when HP reaches 0 — Nemesis dies instead", () => {
      nemesis.hp = 0;
      boss.update(sim);
      expect(boss.phaseState.matchOver).toBe(true);
      expect(boss.phaseState.winner).toBe("players");
    });

    it("teleports at each 20% boundary — 4 times before death", () => {
      for (const fraction of [0.79, 0.59, 0.39, 0.19]) {
        nemesis.hp = Math.floor(NEMESIS_HP * fraction);
        boss.update(sim);
        expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
        expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
        expect(nemesis.pos.y).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
        expect(nemesis.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT - NEMESIS_RADIUS);
        expect(nemesis.vel.x).toBe(0);
        expect(nemesis.vel.y).toBe(0);
      }
    });

    it("does not teleport again after all 4 thresholds are exhausted", () => {
      for (const fraction of [0.79, 0.59, 0.39, 0.19]) {
        nemesis.hp = Math.floor(NEMESIS_HP * fraction);
        boss.update(sim);
      }
      // All thresholds consumed — pin to a known in-bounds position and verify no further teleport
      nemesis.pos.x = 1234;
      nemesis.pos.y = 2345;
      nemesis.hp = 1; // barely alive
      boss.update(sim);
      expect(nemesis.pos.x).toBe(1234);
      expect(nemesis.pos.y).toBe(2345);
      expect(boss.phaseState.matchOver).toBe(false);
    });

    it("large single-tick damage spanning multiple thresholds still only teleports once", () => {
      // Drop from full to 50% — crosses both the 80% (960) and 60% (720) thresholds
      nemesis.hp = Math.floor(NEMESIS_HP * 0.5);
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);

      // Next threshold should now be at 40% (480) — verify a further drop triggers it
      nemesis.hp = Math.floor(NEMESIS_HP * 0.39);
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
    });
  });
});

describe("combat integration with boss", () => {
  it("players can damage mothership in phase 3", () => {
    const sim = new Simulation();
    const boss = new BossManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = WORLD_HEIGHT / 2;

    const mothership = boss.spawnMothership(sim);
    mothership.pos.x = 140; // close to player
    boss.phaseState.current = 3; // vulnerable

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, aimAngle: 0,
    });

    for (let i = 0; i < 30; i++) {
      sim.update();
      boss.update(sim);
    }

    expect(mothership.hp).toBeLessThan(MOTHERSHIP_HP);
  });

  it("players cannot damage mothership in phase 1 with towers alive", () => {
    const sim = new Simulation();
    const boss = new BossManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = WORLD_HEIGHT / 2;

    const mothership = boss.spawnMothership(sim);
    mothership.pos.x = 140; // close to player
    sim.spawnEnemy("tower", 800, 300); // tower keeps shield up

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, aimAngle: 0,
    });

    for (let i = 0; i < 30; i++) {
      sim.update();
      boss.update(sim);
    }

    // Shield should have restored HP each tick
    expect(mothership.hp).toBe(MOTHERSHIP_HP);
  });
});
