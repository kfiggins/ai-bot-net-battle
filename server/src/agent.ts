import {
  AgentCommand,
  AgentCommandSchema,
} from "shared";
import {
  AGENT_BUDGET_MAX,
  AGENT_BUDGET_RESET_TICKS,
  UNIT_COSTS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "shared";
import { Simulation } from "./sim.js";
import { Economy } from "./economy.js";

export interface AgentCommandResult {
  ok: boolean;
  applied_at_tick?: number;
  cost?: number;
  remaining_balance?: number;
  remaining_budget?: number;
  error?: string;
  detail?: string;
}

export class AgentAPI {
  private budgetRemaining = AGENT_BUDGET_MAX;
  private budgetResetAtTick = AGENT_BUDGET_RESET_TICKS;
  strategy: "aggressive" | "defensive" | "balanced" = "balanced";

  update(sim: Simulation): void {
    if (sim.tick >= this.budgetResetAtTick) {
      this.budgetRemaining = AGENT_BUDGET_MAX;
      this.budgetResetAtTick = sim.tick + AGENT_BUDGET_RESET_TICKS;
    }
  }

  processCommand(
    raw: unknown,
    sim: Simulation,
    economy: Economy,
    mothershipPos?: { x: number; y: number }
  ): AgentCommandResult {
    // Validate schema
    const parsed = AgentCommandSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "invalid_command",
        detail: parsed.error.message,
      };
    }

    // Check budget
    if (this.budgetRemaining <= 0) {
      return {
        ok: false,
        error: "rate_limited",
        detail: `Budget exhausted. Resets at tick ${this.budgetResetAtTick}`,
        remaining_budget: 0,
      };
    }

    const cmd = parsed.data;
    let result: AgentCommandResult;

    switch (cmd.command) {
      case "spawn_ship":
        result = this.handleSpawnShip(cmd, sim, economy, mothershipPos);
        break;
      case "build_tower":
        result = this.handleBuildTower(cmd, sim, economy, mothershipPos);
        break;
      case "set_strategy":
        result = this.handleSetStrategy(cmd, sim);
        break;
    }

    if (result.ok) {
      this.budgetRemaining--;
      result.remaining_budget = this.budgetRemaining;
      result.applied_at_tick = sim.tick;
    }

    return result;
  }

  private handleSpawnShip(
    cmd: Extract<AgentCommand, { command: "spawn_ship" }>,
    sim: Simulation,
    economy: Economy,
    mothershipPos?: { x: number; y: number }
  ): AgentCommandResult {
    const { kind, count, lane } = cmd.params;
    let totalCost = 0;

    const anchorX = mothershipPos ? mothershipPos.x - 120 : WORLD_WIDTH - 80;
    const laneBaseY = this.laneToY(lane, mothershipPos);

    for (let i = 0; i < count; i++) {
      const spread = 18 + i * 9;
      const y = Math.max(40, Math.min(WORLD_HEIGHT - 40, laneBaseY + (Math.random() * 2 - 1) * spread));
      const x = Math.max(40, Math.min(WORLD_WIDTH - 40, anchorX - i * 8 + (Math.random() * 10 - 5)));
      const buildResult = economy.requestBuild(
        { unitKind: kind, x, y },
        sim,
        mothershipPos
      );
      if (!buildResult.ok) {
        return {
          ok: false,
          error: buildResult.error,
          detail: buildResult.detail,
        };
      }
      totalCost += UNIT_COSTS[kind] || 0;
    }

    return {
      ok: true,
      cost: totalCost,
      remaining_balance: Math.floor(economy.balance),
    };
  }

  private handleBuildTower(
    cmd: Extract<AgentCommand, { command: "build_tower" }>,
    sim: Simulation,
    economy: Economy,
    mothershipPos?: { x: number; y: number }
  ): AgentCommandResult {
    const { x, y } = cmd.params;

    // Clamp to world bounds
    const cx = Math.max(0, Math.min(WORLD_WIDTH, x));
    const cy = Math.max(0, Math.min(WORLD_HEIGHT, y));

    const buildResult = economy.requestBuild(
      { unitKind: "tower", x: cx, y: cy },
      sim,
      mothershipPos
    );

    if (!buildResult.ok) {
      return {
        ok: false,
        error: buildResult.error,
        detail: buildResult.detail,
      };
    }

    return {
      ok: true,
      cost: UNIT_COSTS.tower,
      remaining_balance: Math.floor(economy.balance),
    };
  }

  private handleSetStrategy(
    cmd: Extract<AgentCommand, { command: "set_strategy" }>,
    sim: Simulation
  ): AgentCommandResult {
    this.strategy = cmd.params.mode;
    return {
      ok: true,
      cost: 0,
      remaining_balance: undefined,
    };
  }

  private laneToY(lane?: "top" | "mid" | "bottom", mothershipPos?: { x: number; y: number }): number {
    if (mothershipPos) {
      // Near mothership: use small fixed offsets for formation
      switch (lane) {
        case "top":    return mothershipPos.y - 220;
        case "bottom": return mothershipPos.y + 220;
        default:       return mothershipPos.y;
      }
    }
    // No anchor: spread lanes across the full world height
    switch (lane) {
      case "top":    return WORLD_HEIGHT * 0.25;
      case "bottom": return WORLD_HEIGHT * 0.75;
      default:       return WORLD_HEIGHT * 0.5;
    }
  }

  getBudgetInfo() {
    return {
      remaining: this.budgetRemaining,
      max: AGENT_BUDGET_MAX,
      resetAtTick: this.budgetResetAtTick,
    };
  }
}
