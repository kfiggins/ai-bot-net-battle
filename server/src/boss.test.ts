import { describe, it, expect, beforeEach } from "vitest";
import { BossManager } from "./boss.js";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import { MOTHERSHIP_HP, ENEMY_TEAM, WORLD_WIDTH, WORLD_HEIGHT } from "shared";

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

    it("places mothership on the right side", () => {
      const entity = boss.spawnMothership(sim);
      expect(entity.pos.x).toBeGreaterThan(WORLD_WIDTH / 2);
      expect(entity.pos.y).toBeCloseTo(WORLD_HEIGHT / 2, 0);
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
    it("match ends when mothership HP reaches 0", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3; // make vulnerable

      mothership.hp = 0;
      boss.update(sim);

      expect(boss.phaseState.matchOver).toBe(true);
      expect(boss.phaseState.winner).toBe("players");
    });

    it("mothership entity is removed on death", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      boss.update(sim);

      expect(sim.entities.has(mothership.id)).toBe(false);
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
      const mothership = boss.spawnMothership(sim);
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
