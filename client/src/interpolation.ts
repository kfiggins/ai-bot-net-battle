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
    const t = elapsed / this.snapshotInterval; // no clamp — allow > 1 for extrapolation

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

      let x: number;
      let y: number;

      if (t <= 1) {
        // Normal interpolation between prev and current
        x = lerp(prev.pos.x, entity.pos.x, t);
        y = lerp(prev.pos.y, entity.pos.y, t);
      } else {
        // Extrapolate past target using entity velocity (cap at 1.5x interval)
        const tExtra = Math.min(t - 1, 0.5);
        const extraSec = tExtra * (this.snapshotInterval / 1000);
        x = entity.pos.x + entity.vel.x * extraSec;
        y = entity.pos.y + entity.vel.y * extraSec;
      }

      return {
        ...entity,
        prevPos: { ...prev.pos },
        targetPos: { ...entity.pos },
        pos: { x, y },
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
