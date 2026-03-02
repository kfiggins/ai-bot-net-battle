import { UNIT_COSTS, SUB_BASE_TOWER_RANGE, DifficultyProfile, getDifficultyProfile } from "shared";
import { Simulation } from "./sim.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";
import { BossManager } from "./boss.js";

const FAKE_AI_DECISION_INTERVAL_TICKS = 20; // ~0.67s at 30 TPS
const FAKE_AI_TOWER_COOLDOWN_TICKS = 120; // 4s
const FAKE_AI_SPAWN_COOLDOWN_TICKS = 30; // 1s

const FAKE_AI_PHANTOM_COOLDOWN_TICKS = 300; // 10 s between phantom spawns
const FAKE_AI_SUB_BASE_TOWER_COOLDOWN_TICKS = 150; // 5s between sub-base tower rebuilds
const FAKE_AI_DREADNOUGHT_COOLDOWN_TICKS = 600; // 20s between dreadnought attempts
const FAKE_AI_GRENADER_COOLDOWN_TICKS = 240; // 8s between grenader spawns

export class FakeAI {
  private nextDecisionTick = 0;
  private nextTowerTick = 0;
  private nextMissileTowerTick = 0;
  private nextSpawnTick = 0;
  private nextPhantomTick = 0;
  private nextSubBaseTowerTick = 0;
  private nextDreadnoughtTick = 0;
  private nextGrenaderTick = 0;

  constructor(private readonly profile: DifficultyProfile = getDifficultyProfile("hard")) {}

  private cooldown(baseTicks: number): number {
    return Math.max(1, Math.round(baseTicks * this.profile.enemyBuildCooldownMult));
  }

  update(sim: Simulation, economy: Economy, agent: AgentAPI, mothershipPos?: { x: number; y: number }, boss?: BossManager): void {
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

    // Priority 0: rebuild towers around sub-bases that need them
    if (boss && sim.tick >= this.nextSubBaseTowerTick) {
      const needingTowers = boss.getSubBasesNeedingTowers(sim);
      if (needingTowers.length > 0) {
        const towerCost = Math.min(UNIT_COSTS.tower, UNIT_COSTS.missile_tower);
        if (economy.balance >= towerCost) {
          const sb = needingTowers[Math.floor(Math.random() * needingTowers.length)];
          // Randomly pick regular tower or missile tower
          const kind: "tower" | "missile_tower" = Math.random() < 0.5 ? "tower" : "missile_tower";
          const angle = Math.random() * Math.PI * 2;
          const dist = 80 + Math.random() * (SUB_BASE_TOWER_RANGE - 80);
          const tx = sb.pos.x + Math.cos(angle) * dist;
          const ty = sb.pos.y + Math.sin(angle) * dist;

          const result = economy.requestBuild(
            { unitKind: kind, x: tx, y: ty },
            sim,
            mothershipPos
          );
          if (result.ok) {
            this.nextSubBaseTowerTick = sim.tick + FAKE_AI_SUB_BASE_TOWER_COOLDOWN_TICKS;
            return;
          }
        }
      }
    }

    // Priority 1: defense near mothership if low tower count.
    const desiredTowers = this.profile.key === "hard" ? 5 : this.profile.key === "normal" ? 2 : 1;
    const towers = sim.getEntitiesByKind("tower").length;
    if (towers < desiredTowers && sim.tick >= this.nextTowerTick) {
      const p = this.pickTowerPos(mothershipPos);
      const towerResult = agent.processCommand({
        v: 1,
        type: "agent_command",
        command: "build_tower",
        params: { x: p.x, y: p.y },
      }, sim, economy, mothershipPos);

      if (towerResult.ok) {
        this.nextTowerTick = sim.tick + this.cooldown(FAKE_AI_TOWER_COOLDOWN_TICKS);
        return;
      }
    }

    // Priority 2: build a missile tower if we can afford one and don't have one yet.
    const maxMissileTowers = this.profile.key === "hard" ? 3 : this.profile.key === "normal" ? 1 : 0;
    const missileTowers = sim.getEntitiesByKind("missile_tower").length;
    if (this.profile.allowMissileTowers && missileTowers < maxMissileTowers && economy.balance >= UNIT_COSTS.missile_tower && sim.tick >= this.nextMissileTowerTick) {
      const p = this.pickTowerPos(mothershipPos);
      const result = economy.requestBuild(
        { unitKind: "missile_tower", x: p.x, y: p.y },
        sim,
        mothershipPos
      );
      if (result.ok) {
        this.nextMissileTowerTick = sim.tick + this.cooldown(300); // don't spam
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
        this.nextSpawnTick = sim.tick + this.cooldown(FAKE_AI_SPAWN_COOLDOWN_TICKS);
      }
    }

    // Priority 4: deploy a phantom if the mothership is alive and we can afford one.
    const maxPhantoms = this.profile.key === "hard" ? 7 : this.profile.key === "normal" ? 2 : 0;
    const phantoms = sim.getEntitiesByKind("phantom_ship").length;
    if (this.profile.allowPhantoms && phantoms < maxPhantoms && economy.balance >= UNIT_COSTS.phantom_ship && sim.tick >= this.nextPhantomTick) {
      const result = economy.requestBuild(
        { unitKind: "phantom_ship" },
        sim,
        mothershipPos
      );
      if (result.ok) {
        this.nextPhantomTick = sim.tick + this.cooldown(FAKE_AI_PHANTOM_COOLDOWN_TICKS);
      }
    }

    // Priority 5: deploy a dreadnought if we can afford one (economy cap enforces limit).
    if (this.profile.allowDreadnought && economy.balance >= UNIT_COSTS.dreadnought && sim.tick >= this.nextDreadnoughtTick) {
      const result = economy.requestBuild(
        { unitKind: "dreadnought" },
        sim,
        mothershipPos
      );
      if (result.ok) {
        this.nextDreadnoughtTick = sim.tick + this.cooldown(FAKE_AI_DREADNOUGHT_COOLDOWN_TICKS);
      }
    }

    // Priority 6: deploy grenaders if allowed.
    if (this.profile.allowGrenader && economy.balance >= UNIT_COSTS.grenader && sim.tick >= this.nextGrenaderTick) {
      const result = economy.requestBuild(
        { unitKind: "grenader" },
        sim,
        mothershipPos
      );
      if (result.ok) {
        this.nextGrenaderTick = sim.tick + this.cooldown(FAKE_AI_GRENADER_COOLDOWN_TICKS);
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
