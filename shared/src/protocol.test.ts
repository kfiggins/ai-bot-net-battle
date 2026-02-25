import { describe, it, expect } from "vitest";
import {
  PlayerInputMessageSchema,
  SnapshotMessageSchema,
  EntitySchema,
  Vec2Schema,
  ClientMessageSchema,
  ServerMessageSchema,
  AgentCommandSchema,
  StartGameMessageSchema,
  LobbyUpdateMessageSchema,
  MatchStartMessageSchema,
  AgentControlModeSchema,
} from "./protocol.js";

describe("Vec2Schema", () => {
  it("accepts valid vectors", () => {
    expect(Vec2Schema.parse({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(Vec2Schema.parse({ x: -1.5, y: 100 })).toEqual({ x: -1.5, y: 100 });
  });

  it("rejects invalid vectors", () => {
    expect(() => Vec2Schema.parse({ x: "a", y: 0 })).toThrow();
    expect(() => Vec2Schema.parse({ x: 0 })).toThrow();
    expect(() => Vec2Schema.parse(null)).toThrow();
  });
});

describe("EntitySchema", () => {
  it("accepts valid entities", () => {
    const entity = {
      id: "test-1",
      kind: "player_ship",
      pos: { x: 100, y: 200 },
      vel: { x: 0, y: 0 },
      hp: 100,
      team: 1,
    };
    expect(EntitySchema.parse(entity)).toEqual(entity);
  });

  it("accepts bullet entities", () => {
    const bullet = {
      id: "b-1",
      kind: "bullet",
      pos: { x: 50, y: 50 },
      vel: { x: 10, y: 0 },
      hp: 1,
      team: 1,
    };
    expect(EntitySchema.parse(bullet)).toEqual(bullet);
  });

  it("rejects unknown entity kinds", () => {
    const invalid = {
      id: "test-1",
      kind: "unknown_thing",
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      hp: 100,
      team: 1,
    };
    expect(() => EntitySchema.parse(invalid)).toThrow();
  });

  it("rejects entities with missing fields", () => {
    expect(() => EntitySchema.parse({ id: "test-1" })).toThrow();
  });

  it("accepts aimAngle as optional number", () => {
    const entity = {
      id: "test-1",
      kind: "player_ship",
      pos: { x: 100, y: 200 },
      vel: { x: 0, y: 0 },
      hp: 100,
      team: 1,
      aimAngle: 1.57,
    };
    const parsed = EntitySchema.parse(entity);
    expect(parsed.aimAngle).toBeCloseTo(1.57, 5);
  });

  it("validates without aimAngle (backward compat)", () => {
    const entity = {
      id: "test-1",
      kind: "bullet",
      pos: { x: 50, y: 50 },
      vel: { x: 10, y: 0 },
      hp: 1,
      team: 1,
    };
    const parsed = EntitySchema.parse(entity);
    expect(parsed.aimAngle).toBeUndefined();
  });
});

describe("PlayerInputMessageSchema", () => {
  it("accepts valid player input messages", () => {
    const msg = {
      v: 1,
      type: "player_input",
      input: {
        up: true,
        down: false,
        left: false,
        right: true,
        fire: false,
        aimAngle: 1.57,
      },
    };
    expect(PlayerInputMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects wrong version", () => {
    const msg = {
      v: 2,
      type: "player_input",
      input: {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
      },
    };
    expect(() => PlayerInputMessageSchema.parse(msg)).toThrow();
  });

  it("rejects wrong type", () => {
    const msg = {
      v: 1,
      type: "wrong_type",
      input: {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
      },
    };
    expect(() => PlayerInputMessageSchema.parse(msg)).toThrow();
  });

  it("rejects missing input fields", () => {
    const msg = {
      v: 1,
      type: "player_input",
      input: { up: true },
    };
    expect(() => PlayerInputMessageSchema.parse(msg)).toThrow();
  });
});

describe("SnapshotMessageSchema", () => {
  it("accepts valid snapshots", () => {
    const snapshot = {
      v: 1,
      type: "snapshot",
      tick: 42,
      botResources: 123,
      entities: [
        {
          id: "p1",
          kind: "player_ship",
          pos: { x: 100, y: 200 },
          vel: { x: 0, y: 0 },
          hp: 100,
          team: 1,
        },
      ],
    };
    expect(SnapshotMessageSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts empty entity list", () => {
    const snapshot = {
      v: 1,
      type: "snapshot",
      tick: 0,
      entities: [],
    };
    expect(SnapshotMessageSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("rejects non-integer tick", () => {
    const snapshot = {
      v: 1,
      type: "snapshot",
      tick: 1.5,
      entities: [],
    };
    expect(() => SnapshotMessageSchema.parse(snapshot)).toThrow();
  });

  it("rejects wrong type", () => {
    const snapshot = {
      v: 1,
      type: "player_input",
      tick: 0,
      entities: [],
    };
    expect(() => SnapshotMessageSchema.parse(snapshot)).toThrow();
  });
});

describe("ClientMessageSchema", () => {
  it("validates player_input as a client message", () => {
    const msg = {
      v: 1,
      type: "player_input",
      input: {
        up: false, down: false, left: false, right: false,
        fire: false, aimAngle: 0,
      },
    };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe("StartGameMessageSchema", () => {
  it("accepts valid start_game message without mode", () => {
    const msg = { v: 1, type: "start_game" };
    expect(StartGameMessageSchema.parse(msg)).toEqual(msg);
  });

  it("accepts valid start_game message with mode", () => {
    const msg = { v: 1, type: "start_game", mode: "external_agent" };
    expect(StartGameMessageSchema.parse(msg)).toEqual(msg);
  });

  it("is accepted as a client message", () => {
    const msg = { v: 1, type: "start_game", mode: "builtin_fake_ai" };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe("LobbyUpdateMessageSchema", () => {
  it("accepts valid lobby_update message", () => {
    const msg = {
      v: 1,
      type: "lobby_update",
      players: [
        { name: "Player 1", playerIndex: 1 },
        { name: "Player 2", playerIndex: 2 },
      ],
      mode: "builtin_fake_ai",
    };
    expect(LobbyUpdateMessageSchema.parse(msg)).toEqual(msg);
  });

  it("accepts empty player list", () => {
    const msg = { v: 1, type: "lobby_update", players: [], mode: "external_agent" };
    expect(LobbyUpdateMessageSchema.parse(msg)).toEqual(msg);
  });

  it("is accepted as a server message", () => {
    const msg = { v: 1, type: "lobby_update", players: [], mode: "builtin_fake_ai" };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe("MatchStartMessageSchema", () => {
  it("accepts valid match_start message", () => {
    const msg = { v: 1, type: "match_start" };
    expect(MatchStartMessageSchema.parse(msg)).toEqual(msg);
  });

  it("is accepted as a server message", () => {
    const msg = { v: 1, type: "match_start" };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe("AgentControlModeSchema", () => {
  it("accepts valid control modes", () => {
    expect(AgentControlModeSchema.parse("external_agent")).toBe("external_agent");
    expect(AgentControlModeSchema.parse("builtin_fake_ai")).toBe("builtin_fake_ai");
  });

  it("rejects invalid control modes", () => {
    expect(() => AgentControlModeSchema.parse("bad_mode")).toThrow();
  });
});

describe("AgentCommandSchema", () => {
  it("accepts spawn_ship command", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "spawn_ship",
      params: { kind: "minion_ship", count: 2, lane: "top" },
    };
    expect(AgentCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("accepts build_tower command", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "build_tower",
      params: { x: 500, y: 300 },
    };
    expect(AgentCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("accepts set_strategy command", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "set_strategy",
      params: { mode: "aggressive" },
    };
    expect(AgentCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("rejects unknown command", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "unknown",
      params: {},
    };
    expect(() => AgentCommandSchema.parse(cmd)).toThrow();
  });

  it("rejects spawn count over max", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "spawn_ship",
      params: { kind: "minion_ship", count: 10 },
    };
    expect(() => AgentCommandSchema.parse(cmd)).toThrow();
  });

  it("rejects invalid strategy mode", () => {
    const cmd = {
      v: 1,
      type: "agent_command",
      command: "set_strategy",
      params: { mode: "invalid_mode" },
    };
    expect(() => AgentCommandSchema.parse(cmd)).toThrow();
  });
});
