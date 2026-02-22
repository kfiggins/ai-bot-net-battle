import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "./sim.js";
import {
  PLAYER_HP,
  PLAYER_SPEED,
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
      // Should not throw
    });
  });

  describe("update", () => {
    it("increments tick", () => {
      sim.update();
      expect(sim.tick).toBe(1);
      sim.update();
      expect(sim.tick).toBe(2);
    });

    it("moves player when input is pressed", () => {
      const entity = sim.addPlayer("p1");
      const startX = entity.pos.x;
      const startY = entity.pos.y;

      sim.setInput("p1", {
        up: false, down: false, left: false, right: true,
        fire: false, aimAngle: 0,
      });

      sim.update();

      const dt = 1 / TICK_RATE;
      expect(entity.pos.x).toBeCloseTo(startX + PLAYER_SPEED * dt, 5);
      expect(entity.pos.y).toBeCloseTo(startY, 5);
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
      // Place at center to avoid clamping
      entity.pos.x = WORLD_WIDTH / 2;
      entity.pos.y = WORLD_HEIGHT / 2;

      sim.setInput("p1", {
        up: true, down: false, left: false, right: true,
        fire: false, aimAngle: 0,
      });

      sim.update();

      const dt = 1 / TICK_RATE;
      const diag = PLAYER_SPEED * dt / Math.sqrt(2);
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

      // Run enough ticks to push past boundary
      for (let i = 0; i < 100; i++) {
        sim.update();
      }

      expect(entity.pos.x).toBeGreaterThanOrEqual(0);
      expect(entity.pos.y).toBeGreaterThanOrEqual(0);
    });

    it("clamps to max world bounds", () => {
      const entity = sim.addPlayer("p1");
      entity.pos.x = WORLD_WIDTH - 5;
      entity.pos.y = WORLD_HEIGHT - 5;

      sim.setInput("p1", {
        up: false, down: true, left: false, right: true,
        fire: false, aimAngle: 0,
      });

      for (let i = 0; i < 100; i++) {
        sim.update();
      }

      expect(entity.pos.x).toBeLessThanOrEqual(WORLD_WIDTH);
      expect(entity.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT);
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

    it("includes all entities", () => {
      sim.addPlayer("p1");
      sim.addPlayer("p2");

      const snapshot = sim.getSnapshot();
      expect(snapshot.entities).toHaveLength(2);
    });

    it("includes correct tick", () => {
      sim.update();
      sim.update();
      sim.update();

      const snapshot = sim.getSnapshot();
      expect(snapshot.tick).toBe(3);
    });

    it("has correct message type and version", () => {
      const snapshot = sim.getSnapshot();
      expect(snapshot.v).toBe(1);
      expect(snapshot.type).toBe("snapshot");
    });
  });
});
