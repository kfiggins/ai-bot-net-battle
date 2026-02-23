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
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";

export interface BuildRequest {
  unitKind: "minion_ship" | "tower";
  x?: number;
  y?: number;
}

export interface BuildResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

export interface QueuedBuild {
  unitKind: "minion_ship" | "tower";
  readyAtTick: number;
  x: number;
  y: number;
}

export class Economy {
  balance = STARTING_BALANCE;
  incomePerTick = INCOME_PER_TICK;
  buildQueue: QueuedBuild[] = [];

  update(sim: Simulation, ai: AIManager): void {
    // Accrue income
    this.balance += this.incomePerTick;

    // Process build queue
    const ready: QueuedBuild[] = [];
    const remaining: QueuedBuild[] = [];

    for (const build of this.buildQueue) {
      if (sim.tick >= build.readyAtTick) {
        ready.push(build);
      } else {
        remaining.push(build);
      }
    }

    this.buildQueue = remaining;

    for (const build of ready) {
      const entity = sim.spawnEnemy(build.unitKind, build.x, build.y);
      ai.registerEntity(entity.id);
    }
  }

  requestBuild(
    request: BuildRequest,
    sim: Simulation,
    mothershipPos?: { x: number; y: number }
  ): BuildResult {
    const { unitKind } = request;

    // Validate unit kind
    const cost = UNIT_COSTS[unitKind];
    if (cost === undefined) {
      return { ok: false, error: "invalid_unit", detail: `Unknown unit kind: ${unitKind}` };
    }

    // Check funds
    if (this.balance < cost) {
      return {
        ok: false,
        error: "insufficient_funds",
        detail: `Need ${cost}, have ${Math.floor(this.balance)}`,
      };
    }

    // Check cap
    const cap = UNIT_CAPS[unitKind];
    if (cap !== undefined) {
      const currentCount = sim.getEntitiesByKind(unitKind as any).length;
      const queuedCount = this.buildQueue.filter((b) => b.unitKind === unitKind).length;
      if (currentCount + queuedCount >= cap) {
        return {
          ok: false,
          error: "cap_reached",
          detail: `${unitKind} cap is ${cap}, have ${currentCount} + ${queuedCount} queued`,
        };
      }
    }

    // Determine spawn position relative to mothership (or map center as fallback)
    const basePos = mothershipPos ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    let x: number;
    let y: number;
    if (request.x !== undefined && request.y !== undefined) {
      x = request.x;
      y = request.y;
    } else if (unitKind === "minion_ship") {
      // Spawn minions near mothership with some spread
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 300;
      x = basePos.x + Math.cos(angle) * dist;
      y = basePos.y + Math.sin(angle) * dist;
    } else {
      // Towers default to within allowed distance of mothership
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * (TOWER_MAX_SPAWN_DISTANCE - 100);
      x = basePos.x + Math.cos(angle) * dist;
      y = basePos.y + Math.sin(angle) * dist;
    }

    // Validate tower distance from mothership
    if (unitKind === "tower") {
      const dx = x - basePos.x;
      const dy = y - basePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > TOWER_MAX_SPAWN_DISTANCE) {
        return {
          ok: false,
          error: "too_far",
          detail: `Tower must be within ${TOWER_MAX_SPAWN_DISTANCE}px of mothership (distance: ${Math.round(dist)})`,
        };
      }
    }

    // Deduct cost and queue build
    this.balance -= cost;
    this.buildQueue.push({
      unitKind,
      readyAtTick: sim.tick + BUILD_COOLDOWN_TICKS,
      x,
      y,
    });

    return { ok: true };
  }

  getSummary(sim: Simulation) {
    const unitCounts: Record<string, number> = {};
    for (const entity of sim.entities.values()) {
      unitCounts[entity.kind] = (unitCounts[entity.kind] || 0) + 1;
    }

    return {
      balance: Math.floor(this.balance),
      incomeRate: INCOME_PER_TICK * 30, // per second
      unitCounts,
      buildQueue: this.buildQueue.map((b) => ({
        kind: b.unitKind,
        readyAtTick: b.readyAtTick,
      })),
    };
  }
}
