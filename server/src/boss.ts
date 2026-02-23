import { v4 as uuid } from "uuid";
import {
  Entity,
  MOTHERSHIP_HP,
  ENEMY_TEAM,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "shared";
import { Simulation } from "./sim.js";

export interface BossPhaseState {
  current: number; // 1, 2, 3 (final)
  matchOver: boolean;
  winner: "players" | "none";
}

export class BossManager {
  mothershipId: string | null = null;
  phaseState: BossPhaseState = {
    current: 1,
    matchOver: false,
    winner: "none",
  };

  spawnMothership(sim: Simulation): Entity {
    const entityId = uuid();
    const entity: Entity = {
      id: entityId,
      kind: "mothership",
      pos: { x: WORLD_WIDTH - 60, y: WORLD_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      hp: MOTHERSHIP_HP,
      team: ENEMY_TEAM,
    };
    sim.entities.set(entityId, entity);
    this.mothershipId = entityId;
    return entity;
  }

  isShielded(sim: Simulation): boolean {
    if (this.phaseState.matchOver) return false;

    // Towers always force mothership shield back on, regardless of phase.
    const towers = sim.getEntitiesByKind("tower");
    if (towers.length > 0) return true;

    const minions = sim.getEntitiesByKind("minion_ship");

    switch (this.phaseState.current) {
      case 1:
        // No towers left in phase 1 -> transition imminent, no shield from phase rule.
        return false;
      case 2:
        // Phase 2: shield up while minions alive.
        return minions.length > 0;
      case 3:
        // Final phase vulnerable unless new towers are introduced.
        return false;
      default:
        return false;
    }
  }

  update(sim: Simulation): void {
    if (this.phaseState.matchOver) return;

    const mothership = this.mothershipId
      ? sim.entities.get(this.mothershipId)
      : null;

    // If the mothership entity is gone, treat it as destroyed and end match.
    // (Simulation may remove dead entities before boss.update runs.)
    if (!mothership) {
      if (this.mothershipId) {
        this.phaseState.matchOver = true;
        this.phaseState.winner = "players";
      }
      return;
    }

    // Enforce shield: if shielded, undo any damage dealt this tick
    const shielded = this.isShielded(sim);
    if (shielded && mothership.hp < MOTHERSHIP_HP) {
      mothership.hp = MOTHERSHIP_HP;
    }

    // Phase transitions (one per tick max)
    const towers = sim.getEntitiesByKind("tower");
    const minions = sim.getEntitiesByKind("minion_ship");

    if (this.phaseState.current === 1 && towers.length === 0) {
      this.phaseState.current = 2;
    } else if (this.phaseState.current === 2 && minions.length === 0) {
      this.phaseState.current = 3;
    }

    // Win condition
    if (mothership.hp <= 0) {
      this.phaseState.matchOver = true;
      this.phaseState.winner = "players";
      sim.entities.delete(this.mothershipId!);
    }
  }

  getPhaseInfo(sim: Simulation) {
    const towers = sim.getEntitiesByKind("tower");
    const minions = sim.getEntitiesByKind("minion_ship");

    const objectives: string[] = [];
    const remaining: Record<string, number> = {};

    if (this.phaseState.current === 1) {
      objectives.push("Destroy all towers");
      remaining.tower = towers.length;
    } else if (this.phaseState.current === 2) {
      objectives.push("Destroy all minions");
      remaining.minion_ship = minions.length;
    } else if (this.phaseState.current === 3) {
      objectives.push("Destroy the mothership");
      const mothership = this.mothershipId
        ? sim.entities.get(this.mothershipId)
        : null;
      if (mothership) {
        remaining.mothership = mothership.hp;
      }
    }

    return {
      current: this.phaseState.current,
      objectives,
      remaining,
      matchOver: this.phaseState.matchOver,
      mothershipShielded: this.isShielded(sim),
    };
  }
}
