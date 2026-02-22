import { describe, it, expect } from "vitest";
import {
  PlayerInputMessageSchema,
  SnapshotMessageSchema,
  EntitySchema,
  Vec2Schema,
  ClientMessageSchema,
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
