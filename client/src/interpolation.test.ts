import { describe, it, expect, vi, beforeEach } from "vitest";
import { SnapshotInterpolator } from "./interpolation.js";
import { SnapshotMessage, SNAPSHOT_RATE } from "shared";

function makeSnapshot(
  tick: number,
  entities: Array<{ id: string; x: number; y: number; kind?: string }>
): SnapshotMessage {
  return {
    v: 1,
    type: "snapshot",
    tick,
    entities: entities.map((e) => ({
      id: e.id,
      kind: (e.kind ?? "player_ship") as any,
      pos: { x: e.x, y: e.y },
      vel: { x: 0, y: 0 },
      hp: 100,
      team: 1,
    })),
  };
}

describe("SnapshotInterpolator", () => {
  let interpolator: SnapshotInterpolator;

  beforeEach(() => {
    interpolator = new SnapshotInterpolator();
  });

  it("returns empty array with no snapshots", () => {
    expect(interpolator.getInterpolatedEntities()).toEqual([]);
  });

  it("returns current positions with only one snapshot", () => {
    interpolator.pushSnapshot(makeSnapshot(1, [{ id: "a", x: 100, y: 200 }]));
    const entities = interpolator.getInterpolatedEntities();
    expect(entities).toHaveLength(1);
    expect(entities[0].pos).toEqual({ x: 100, y: 200 });
    expect(entities[0].prevPos).toEqual({ x: 100, y: 200 });
    expect(entities[0].targetPos).toEqual({ x: 100, y: 200 });
  });

  it("interpolates between two snapshots", () => {
    const mockNow = vi.spyOn(performance, "now");
    const interval = 1000 / SNAPSHOT_RATE;

    // Push first snapshot
    mockNow.mockReturnValue(0);
    interpolator.pushSnapshot(makeSnapshot(1, [{ id: "a", x: 0, y: 0 }]));

    // Push second snapshot
    const t0 = 100;
    mockNow.mockReturnValue(t0);
    interpolator.pushSnapshot(makeSnapshot(2, [{ id: "a", x: 100, y: 200 }]));

    // At t=0 after second snapshot, position should be at prev
    mockNow.mockReturnValue(t0);
    const entities0 = interpolator.getInterpolatedEntities();
    expect(entities0[0].pos.x).toBeCloseTo(0, 0);
    expect(entities0[0].pos.y).toBeCloseTo(0, 0);

    // At t=0.5 through the interval
    mockNow.mockReturnValue(t0 + interval / 2);
    const entitiesHalf = interpolator.getInterpolatedEntities();
    expect(entitiesHalf[0].pos.x).toBeCloseTo(50, 0);
    expect(entitiesHalf[0].pos.y).toBeCloseTo(100, 0);

    // At t=1.0 (full interval elapsed)
    mockNow.mockReturnValue(t0 + interval);
    const entitiesFull = interpolator.getInterpolatedEntities();
    expect(entitiesFull[0].pos.x).toBeCloseTo(100, 0);
    expect(entitiesFull[0].pos.y).toBeCloseTo(200, 0);

    mockNow.mockRestore();
  });

  it("clamps interpolation t to 1.0 when past interval", () => {
    const mockNow = vi.spyOn(performance, "now");

    mockNow.mockReturnValue(0);
    interpolator.pushSnapshot(makeSnapshot(1, [{ id: "a", x: 0, y: 0 }]));

    mockNow.mockReturnValue(66);
    interpolator.pushSnapshot(makeSnapshot(2, [{ id: "a", x: 100, y: 0 }]));

    // Way past interval
    mockNow.mockReturnValue(66 + 200);
    const entities = interpolator.getInterpolatedEntities();
    expect(entities[0].pos.x).toBeCloseTo(100, 0);

    mockNow.mockRestore();
  });

  it("handles new entities appearing in latest snapshot", () => {
    const mockNow = vi.spyOn(performance, "now");

    mockNow.mockReturnValue(0);
    interpolator.pushSnapshot(makeSnapshot(1, [{ id: "a", x: 100, y: 100 }]));

    mockNow.mockReturnValue(66);
    interpolator.pushSnapshot(
      makeSnapshot(2, [
        { id: "a", x: 200, y: 100 },
        { id: "b", x: 50, y: 50 },
      ])
    );

    mockNow.mockReturnValue(66 + 33);
    const entities = interpolator.getInterpolatedEntities();
    expect(entities).toHaveLength(2);

    // Entity "b" is new — no interpolation, just use target pos
    const b = entities.find((e) => e.id === "b")!;
    expect(b.pos).toEqual({ x: 50, y: 50 });
    expect(b.prevPos).toEqual({ x: 50, y: 50 });
    expect(b.targetPos).toEqual({ x: 50, y: 50 });

    mockNow.mockRestore();
  });

  it("provides prevPos and targetPos for rendering helpers", () => {
    const mockNow = vi.spyOn(performance, "now");

    mockNow.mockReturnValue(0);
    interpolator.pushSnapshot(makeSnapshot(1, [{ id: "a", x: 10, y: 20 }]));

    mockNow.mockReturnValue(66);
    interpolator.pushSnapshot(makeSnapshot(2, [{ id: "a", x: 110, y: 220 }]));

    mockNow.mockReturnValue(66 + 33);
    const entities = interpolator.getInterpolatedEntities();
    expect(entities[0].prevPos).toEqual({ x: 10, y: 20 });
    expect(entities[0].targetPos).toEqual({ x: 110, y: 220 });

    mockNow.mockRestore();
  });

  it("returns phase info from current snapshot", () => {
    const snapshot = makeSnapshot(1, [{ id: "a", x: 0, y: 0 }]);
    snapshot.phase = {
      current: 2,
      objectives: ["Destroy minions"],
      remaining: { minion_ship: 5 },
      matchOver: false,
      mothershipShielded: true,
    };
    interpolator.pushSnapshot(snapshot);
    const phase = interpolator.getPhaseInfo();
    expect(phase?.current).toBe(2);
    expect(phase?.mothershipShielded).toBe(true);
  });

  it("returns undefined phase when no snapshot", () => {
    expect(interpolator.getPhaseInfo()).toBeUndefined();
  });
});
