import { describe, it, expect, beforeEach } from "vitest";
import { AgentAPI } from "./agent.js";
import { Simulation } from "./sim.js";
import { Economy } from "./economy.js";
import {
  AGENT_BUDGET_MAX,
  AGENT_BUDGET_RESET_TICKS,
  UNIT_COSTS,
  STARTING_BALANCE,
  WORLD_HEIGHT,
} from "shared";

describe("AgentAPI", () => {
  let agent: AgentAPI;
  let sim: Simulation;
  let economy: Economy;

  beforeEach(() => {
    agent = new AgentAPI();
    sim = new Simulation();
    economy = new Economy();
  });

  describe("spawn_ship command", () => {
    it("successfully spawns minion ships", () => {
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 1 },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(true);
      expect(result.cost).toBe(UNIT_COSTS.minion_ship);
      expect(result.remaining_balance).toBe(
        Math.floor(STARTING_BALANCE - UNIT_COSTS.minion_ship)
      );
      expect(economy.buildQueue).toHaveLength(1);
    });

    it("spawns multiple ships", () => {
      economy.balance = 1000;
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 3 },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(true);
      expect(result.cost).toBe(UNIT_COSTS.minion_ship * 3);
      expect(economy.buildQueue).toHaveLength(3);
    });

    it("uses lane parameter for y position", () => {
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 1, lane: "top" },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(true);
      // Top lane should be in upper portion of the map
      expect(economy.buildQueue[0].y).toBeLessThan(WORLD_HEIGHT * 0.35);
    });

    it("fails with insufficient funds", () => {
      economy.balance = 10;
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 1 },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("insufficient_funds");
    });
  });

  describe("build_tower command", () => {
    it("successfully builds a tower", () => {
      const mothershipPos = { x: 500, y: 300 };
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "build_tower",
          params: { x: 500, y: 300 },
        },
        sim,
        economy,
        mothershipPos
      );

      expect(result.ok).toBe(true);
      expect(result.cost).toBe(UNIT_COSTS.tower);
      expect(economy.buildQueue).toHaveLength(1);
      expect(economy.buildQueue[0].x).toBe(500);
      expect(economy.buildQueue[0].y).toBe(300);
    });

    it("clamps coordinates to world bounds", () => {
      economy.balance = 1000;
      const mothershipPos = { x: 0, y: WORLD_HEIGHT };
      agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "build_tower",
          params: { x: -100, y: 9999 },
        },
        sim,
        economy,
        mothershipPos
      );

      expect(economy.buildQueue[0].x).toBe(0);
      expect(economy.buildQueue[0].y).toBe(WORLD_HEIGHT);
    });
  });

  describe("set_strategy command", () => {
    it("sets the strategy", () => {
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "aggressive" },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(true);
      expect(agent.strategy).toBe("aggressive");
    });

    it("costs nothing", () => {
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "defensive" },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(true);
      expect(result.cost).toBe(0);
    });
  });

  describe("rate limiting", () => {
    it("starts with full budget", () => {
      const info = agent.getBudgetInfo();
      expect(info.remaining).toBe(AGENT_BUDGET_MAX);
    });

    it("decrements budget on successful command", () => {
      agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "balanced" },
        },
        sim,
        economy
      );

      expect(agent.getBudgetInfo().remaining).toBe(AGENT_BUDGET_MAX - 1);
    });

    it("rejects when budget exhausted", () => {
      economy.balance = 100000;

      // Exhaust budget
      for (let i = 0; i < AGENT_BUDGET_MAX; i++) {
        agent.processCommand(
          {
            v: 1,
            type: "agent_command",
            command: "set_strategy",
            params: { mode: "balanced" },
          },
          sim,
          economy
        );
      }

      // Next command should fail
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "aggressive" },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("rate_limited");
    });

    it("does not decrement budget on failed command", () => {
      economy.balance = 0;

      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 1 },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(agent.getBudgetInfo().remaining).toBe(AGENT_BUDGET_MAX);
    });

    it("resets budget after reset period", () => {
      // Use some budget
      agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "balanced" },
        },
        sim,
        economy
      );
      expect(agent.getBudgetInfo().remaining).toBe(AGENT_BUDGET_MAX - 1);

      // Advance past reset
      sim.tick = AGENT_BUDGET_RESET_TICKS + 1;
      agent.update(sim);

      expect(agent.getBudgetInfo().remaining).toBe(AGENT_BUDGET_MAX);
    });
  });

  describe("validation", () => {
    it("rejects invalid command schema", () => {
      const result = agent.processCommand(
        { v: 1, type: "agent_command", command: "invalid_thing" },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_command");
    });

    it("rejects missing version", () => {
      const result = agent.processCommand(
        {
          type: "agent_command",
          command: "set_strategy",
          params: { mode: "balanced" },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_command");
    });

    it("rejects non-object input", () => {
      const result = agent.processCommand("not an object", sim, economy);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_command");
    });

    it("rejects spawn count > 5", () => {
      const result = agent.processCommand(
        {
          v: 1,
          type: "agent_command",
          command: "spawn_ship",
          params: { kind: "minion_ship", count: 10 },
        },
        sim,
        economy
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_command");
    });
  });

  describe("getBudgetInfo", () => {
    it("returns current budget state", () => {
      const info = agent.getBudgetInfo();
      expect(info.remaining).toBe(AGENT_BUDGET_MAX);
      expect(info.max).toBe(AGENT_BUDGET_MAX);
      expect(info.resetAtTick).toBe(AGENT_BUDGET_RESET_TICKS);
    });
  });
});
