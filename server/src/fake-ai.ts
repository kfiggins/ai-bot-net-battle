import { Simulation } from "./sim.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";

const FAKE_AI_DECISION_INTERVAL_TICKS = 20; // ~0.67s at 30 TPS
const FAKE_AI_TOWER_COOLDOWN_TICKS = 120; // 4s
const FAKE_AI_SPAWN_COOLDOWN_TICKS = 30; // 1s

export class FakeAI {
  private nextDecisionTick = 0;
  private nextTowerTick = 0;
  private nextMissileTowerTick = 0;
  private nextSpawnTick = 0;

  update(sim: Simulation, economy: Economy, agent: AgentAPI, mothershipPos?: { x: number; y: number }): void {
    if (sim.tick < this.nextDecisionTick) return;
    this.nextDecisionTick = sim.tick + FAKE_AI_DECISION_INTERVAL_TICKS;

    // Keep strategy neutral for kids mode.
    if (agent.strategy !== "balanced") {
      agent.processCommand({
        v: 1,
        type: "agent_command",
        command: "set_strategy",
        params: { mode: "balanced" },
      }, sim, economy, mothershipPos);
    }

    // Priority 1: defense near mothership if low tower count.
    const towers = sim.getEntitiesByKind("tower").length;
    if (towers < 3 && sim.tick >= this.nextTowerTick) {
      const p = this.pickTowerPos(mothershipPos);
      const towerResult = agent.processCommand({
        v: 1,
        type: "agent_command",
        command: "build_tower",
        params: { x: p.x, y: p.y },
      }, sim, economy, mothershipPos);

      if (towerResult.ok) {
        this.nextTowerTick = sim.tick + FAKE_AI_TOWER_COOLDOWN_TICKS;
        return;
      }
    }

    // Priority 2: build a missile tower if we can afford one and don't have one yet.
    const missileTowers = sim.getEntitiesByKind("missile_tower").length;
    if (missileTowers < 2 && economy.balance >= 200 && sim.tick >= this.nextMissileTowerTick) {
      const p = this.pickTowerPos(mothershipPos);
      const result = economy.requestBuild(
        { unitKind: "missile_tower", x: p.x, y: p.y },
        sim,
        mothershipPos
      );
      if (result.ok) {
        this.nextMissileTowerTick = sim.tick + 300; // don't spam
        return;
      }
    }

    // Priority 3: keep pressure with minion waves.
    if (sim.tick >= this.nextSpawnTick) {
      const lanes: Array<"top" | "mid" | "bottom"> = ["top", "mid", "bottom"];
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      const spawnResult = agent.processCommand({
        v: 1,
        type: "agent_command",
        command: "spawn_ship",
        params: { kind: "minion_ship", count: 1, lane },
      }, sim, economy, mothershipPos);

      if (spawnResult.ok) {
        this.nextSpawnTick = sim.tick + FAKE_AI_SPAWN_COOLDOWN_TICKS;
      }
    }
  }

  private pickTowerPos(mothershipPos?: { x: number; y: number }): { x: number; y: number } {
    const c = mothershipPos ?? { x: 2000, y: 2000 };
    const angle = Math.random() * Math.PI * 2;
    const dist = 180 + Math.random() * 220;
    return {
      x: c.x + Math.cos(angle) * dist,
      y: c.y + Math.sin(angle) * dist,
    };
  }
}
