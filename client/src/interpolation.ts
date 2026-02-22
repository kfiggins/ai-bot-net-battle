import { Entity, SnapshotMessage } from "shared";

export interface InterpolatedEntity extends Entity {
  prevPos: { x: number; y: number };
  targetPos: { x: number; y: number };
}

export class SnapshotInterpolator {
  private prev: SnapshotMessage | null = null;
  private current: SnapshotMessage | null = null;
  private snapshotTime = 0;
  private snapshotInterval = 1000 / 15; // ~66ms at 15Hz snapshot rate

  pushSnapshot(snapshot: SnapshotMessage): void {
    this.prev = this.current;
    this.current = snapshot;
    this.snapshotTime = performance.now();
  }

  getInterpolatedEntities(): InterpolatedEntity[] {
    if (!this.current) return [];
    if (!this.prev) {
      return this.current.entities.map((e) => ({
        ...e,
        prevPos: { ...e.pos },
        targetPos: { ...e.pos },
      }));
    }

    const elapsed = performance.now() - this.snapshotTime;
    const t = Math.min(elapsed / this.snapshotInterval, 1);

    const prevMap = new Map<string, Entity>();
    for (const e of this.prev.entities) {
      prevMap.set(e.id, e);
    }

    return this.current.entities.map((entity) => {
      const prev = prevMap.get(entity.id);
      if (!prev) {
        return {
          ...entity,
          prevPos: { ...entity.pos },
          targetPos: { ...entity.pos },
        };
      }

      return {
        ...entity,
        prevPos: { ...prev.pos },
        targetPos: { ...entity.pos },
        pos: {
          x: lerp(prev.pos.x, entity.pos.x, t),
          y: lerp(prev.pos.y, entity.pos.y, t),
        },
      };
    });
  }

  getPhaseInfo() {
    return this.current?.phase;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
