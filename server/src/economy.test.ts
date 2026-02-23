import { describe, it, expect, beforeEach } from "vitest";
import { Economy } from "./economy.js";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import {
  STARTING_BALANCE,
  INCOME_PER_TICK,
  UNIT_COSTS,
  UNIT_CAPS,
  BUILD_COOLDOWN_TICKS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TOWER_MAX_SPAWN_DISTANCE,
} from "shared";

describe("Economy", () => {
  let economy: Economy;
  let sim: Simulation;
  let ai: AIManager;

  beforeEach(() => {
    economy = new Economy();
    sim = new Simulation();
    ai = new AIManager();
  });

  describe("initialization", () => {
    it("starts with correct balance", () => {
      expect(economy.balance).toBe(STARTING_BALANCE);
    });

    it("has empty build queue", () => {
      expect(economy.buildQueue).toHaveLength(0);
    });
  });

  describe("income", () => {
    it("accrues income each tick", () => {
      const startBalance = economy.balance;
      economy.update(sim, ai);
      expect(economy.balance).toBeCloseTo(startBalance + INCOME_PER_TICK, 5);
    });

    it("accrues correct income over 1 second (30 ticks)", () => {
      const startBalance = economy.balance;
      for (let i = 0; i < 30; i++) {
        sim.update();
        economy.update(sim, ai);
      }
      expect(economy.balance).toBeCloseTo(startBalance + 10, 1); // 10 per second
    });
  });

  describe("requestBuild", () => {
    it("accepts valid minion_ship build", () => {
      const result = economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(result.ok).toBe(true);
      expect(economy.balance).toBe(STARTING_BALANCE - UNIT_COSTS.minion_ship);
      expect(economy.buildQueue).toHaveLength(1);
    });

    it("accepts valid tower build", () => {
      const cx = WORLD_WIDTH / 2;
      const cy = WORLD_HEIGHT / 2;
      const result = economy.requestBuild(
        { unitKind: "tower", x: cx + 100, y: cy + 100 },
        sim,
        { x: cx, y: cy }
      );
      expect(result.ok).toBe(true);
      expect(economy.balance).toBe(STARTING_BALANCE - UNIT_COSTS.tower);
    });

    it("rejects build with insufficient funds", () => {
      economy.balance = 10;
      const result = economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("insufficient_funds");
      expect(economy.balance).toBe(10); // unchanged
    });

    it("rejects build when cap reached", () => {
      // Fill up to cap with actual entities
      for (let i = 0; i < UNIT_CAPS.minion_ship; i++) {
        sim.spawnEnemy("minion_ship", 100, 100);
      }
      economy.balance = 10000;

      const result = economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("cap_reached");
    });

    it("counts queued builds toward cap", () => {
      economy.balance = 10000;
      // Fill all but one slot
      for (let i = 0; i < UNIT_CAPS.minion_ship - 1; i++) {
        sim.spawnEnemy("minion_ship", 100, 100);
      }

      // Queue one more (should succeed)
      const result1 = economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(result1.ok).toBe(true);

      // Queue another (should fail - queued + existing = cap)
      const result2 = economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(result2.ok).toBe(false);
      expect(result2.error).toBe("cap_reached");
    });

    it("uses provided coordinates for tower", () => {
      const mothershipPos = { x: 123, y: 456 };
      economy.requestBuild({ unitKind: "tower", x: 123, y: 456 }, sim, mothershipPos);
      expect(economy.buildQueue[0].x).toBe(123);
      expect(economy.buildQueue[0].y).toBe(456);
    });

    it("sets readyAtTick based on cooldown", () => {
      sim.tick = 100;
      // Need to set sim.tick manually since we're not calling sim.update()
      economy.requestBuild({ unitKind: "minion_ship" }, sim);
      expect(economy.buildQueue[0].readyAtTick).toBe(100 + BUILD_COOLDOWN_TICKS);
    });

    it("rejects tower too far from mothership", () => {
      const mothershipPos = { x: 2000, y: 2000 };
      const result = economy.requestBuild(
        { unitKind: "tower", x: 2000 + TOWER_MAX_SPAWN_DISTANCE + 100, y: 2000 },
        sim,
        mothershipPos
      );
      expect(result.ok).toBe(false);
      expect(result.error).toBe("too_far");
    });

    it("accepts tower within max distance from mothership", () => {
      const mothershipPos = { x: 2000, y: 2000 };
      const result = economy.requestBuild(
        { unitKind: "tower", x: 2000 + TOWER_MAX_SPAWN_DISTANCE - 10, y: 2000 },
        sim,
        mothershipPos
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("build queue processing", () => {
    it("spawns entity when build is ready", () => {
      economy.requestBuild({ unitKind: "minion_ship", x: 500, y: 300 }, sim);
      expect(sim.getEntitiesByKind("minion_ship")).toHaveLength(0);

      // Advance past cooldown
      for (let i = 0; i < BUILD_COOLDOWN_TICKS + 1; i++) {
        sim.update();
        economy.update(sim, ai);
      }

      expect(sim.getEntitiesByKind("minion_ship")).toHaveLength(1);
      expect(economy.buildQueue).toHaveLength(0);
    });

    it("registers spawned entity with AI manager", () => {
      economy.requestBuild({ unitKind: "minion_ship" }, sim);

      for (let i = 0; i < BUILD_COOLDOWN_TICKS + 1; i++) {
        sim.update();
        economy.update(sim, ai);
      }

      expect(ai.aiStates.size).toBe(1);
    });

    it("does not spawn entity before cooldown", () => {
      economy.requestBuild({ unitKind: "minion_ship" }, sim);

      // Advance but not past cooldown
      for (let i = 0; i < BUILD_COOLDOWN_TICKS - 1; i++) {
        sim.update();
        economy.update(sim, ai);
      }

      expect(sim.getEntitiesByKind("minion_ship")).toHaveLength(0);
      expect(economy.buildQueue).toHaveLength(1);
    });
  });

  describe("getSummary", () => {
    it("returns correct balance", () => {
      const summary = economy.getSummary(sim);
      expect(summary.balance).toBe(STARTING_BALANCE);
    });

    it("returns correct unit counts", () => {
      sim.addPlayer("p1");
      sim.spawnEnemy("minion_ship", 100, 100);
      sim.spawnEnemy("minion_ship", 200, 200);
      sim.spawnEnemy("tower", 300, 300);

      const summary = economy.getSummary(sim);
      expect(summary.unitCounts.player_ship).toBe(1);
      expect(summary.unitCounts.minion_ship).toBe(2);
      expect(summary.unitCounts.tower).toBe(1);
    });

    it("returns income rate per second", () => {
      const summary = economy.getSummary(sim);
      expect(summary.incomeRate).toBeCloseTo(10, 1);
    });

    it("returns build queue info", () => {
      const cx = WORLD_WIDTH / 2;
      const cy = WORLD_HEIGHT / 2;
      economy.requestBuild({ unitKind: "tower", x: cx, y: cy }, sim, { x: cx, y: cy });

      const summary = economy.getSummary(sim);
      expect(summary.buildQueue).toHaveLength(1);
      expect(summary.buildQueue[0].kind).toBe("tower");
    });
  });
});
