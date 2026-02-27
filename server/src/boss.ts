import { v4 as uuid } from "uuid";
import {
  Entity,
  MOTHERSHIP_HP,
  ENEMY_TEAM,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TICK_RATE,
  NEMESIS_HP,
  NEMESIS_RADIUS,
  NEMESIS_SPEED,
  NEMESIS_ACCEL,
  PLAYER_BRAKE_FRICTION,
  NEMESIS_BULLET_DAMAGE,
  NEMESIS_SPIRAL_BULLET_SPEED,
  NEMESIS_SPIRAL_COUNT,
  NEMESIS_SPIRAL_FIRE_COOLDOWN_TICKS,
  NEMESIS_SPIRAL_ROTATE_PER_SHOT,
  NEMESIS_MISSILE_COOLDOWN_TICKS,
  SUB_BASE_HP,
  SUB_BASE_DISTANCE,
  SUB_BASE_TOWER_RANGE,
  SUB_BASE_MAX_TOWERS,
  SUB_BASE_POP_MINIONS,
  SUB_BASE_POP_PHANTOMS,
} from "shared";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";

// Mothership death sequence (2 s of chaos before Nemesis spawns)
const MOTHERSHIP_DEATH_TICKS = 60;     // 2 s at 30 Hz
const DEATH_RING_INTERVAL_TICKS = 10;  // bullet ring every ~0.33 s → 6 rings
const DEATH_RING_BULLET_COUNT = 12;    // bullets per ring
const DEATH_RING_BULLET_SPEED = 220;   // px/s
const DEATH_RING_BULLET_DAMAGE = 8;    // same as body collision damage

export interface BossPhaseState {
  current: number; // 1, 2, 3 (mothership phases), 4 (Nemesis boss)
  matchOver: boolean;
  winner: "players" | "none";
}

export interface SubBaseState {
  entityId: string;
  pos: { x: number; y: number };
  towerIds: Set<string>; // associated tower entity IDs (tower or missile_tower)
}

export class BossManager {
  mothershipId: string | null = null;
  nemesisId: string | null = null;
  phaseState: BossPhaseState = {
    current: 1,
    matchOver: false,
    winner: "none",
  };

  // Sub-base tracking
  subBases: Map<string, SubBaseState> = new Map();
  private towerToSubBase: Map<string, string> = new Map(); // tower ID → sub-base ID

  private spiralAngle: number = 0;
  private spiralFireCooldown: number = 0;
  private missileFireCooldown: number = 0;
  private mothershipLastPos: { x: number; y: number } | null = null;
  private mothershipDyingCountdown: number = 0;
  private deathRingCooldown: number = 0;
  private deathRingAngle: number = 0;
  private nemesisTeleportThreshold: number = 0; // next HP boundary that triggers a teleport

  spawnMothership(sim: Simulation): Entity {
    const entityId = uuid();
    const entity: Entity = {
      id: entityId,
      kind: "mothership",
      pos: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      hp: MOTHERSHIP_HP,
      team: ENEMY_TEAM,
    };
    sim.entities.set(entityId, entity);
    this.mothershipId = entityId;
    return entity;
  }

  spawnNemesis(sim: Simulation, pos: { x: number; y: number }): Entity {
    const entityId = uuid();
    const entity: Entity = {
      id: entityId,
      kind: "nemesis",
      pos: { x: pos.x, y: pos.y },
      vel: { x: 0, y: 0 },
      hp: NEMESIS_HP,
      team: ENEMY_TEAM,
    };
    sim.entities.set(entityId, entity);
    this.nemesisId = entityId;
    this.spiralAngle = 0;
    this.spiralFireCooldown = NEMESIS_SPIRAL_FIRE_COOLDOWN_TICKS;
    this.missileFireCooldown = NEMESIS_MISSILE_COOLDOWN_TICKS;
    this.nemesisTeleportThreshold = NEMESIS_HP * 0.8; // teleport at 80%, 60%, 40%, 20%
    return entity;
  }

  spawnSubBases(sim: Simulation, ai: AIManager): void {
    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;

    // Four diagonal positions: NE, SE, SW, NW
    const angles = [
      Math.PI * 1.75, // NE (315° in standard math coords = up-right)
      Math.PI * 0.25, // SE
      Math.PI * 0.75, // SW
      Math.PI * 1.25, // NW
    ];

    for (const angle of angles) {
      const sbX = cx + Math.cos(angle) * SUB_BASE_DISTANCE;
      const sbY = cy + Math.sin(angle) * SUB_BASE_DISTANCE;

      const sbEntity = sim.spawnEnemy("sub_base", sbX, sbY);

      const subBaseState: SubBaseState = {
        entityId: sbEntity.id,
        pos: { x: sbX, y: sbY },
        towerIds: new Set(),
      };

      // Spawn 1 regular tower + 1 missile tower per sub-base
      const towerConfigs: Array<{ kind: "tower" | "missile_tower"; offsetAngle: number }> = [
        { kind: "tower", offsetAngle: angle - 0.4 },
        { kind: "missile_tower", offsetAngle: angle + 0.4 },
      ];

      for (const cfg of towerConfigs) {
        const towerDist = 120 + Math.random() * 80;
        const towerX = sbX + Math.cos(cfg.offsetAngle) * towerDist;
        const towerY = sbY + Math.sin(cfg.offsetAngle) * towerDist;

        const tower = sim.spawnEnemy(cfg.kind, towerX, towerY);
        ai.registerEntity(tower.id);
        subBaseState.towerIds.add(tower.id);
        this.towerToSubBase.set(tower.id, sbEntity.id);
      }

      this.subBases.set(sbEntity.id, subBaseState);
    }
  }

  isSubBaseShielded(subBaseId: string, sim: Simulation): boolean {
    const sb = this.subBases.get(subBaseId);
    if (!sb) return false;
    for (const towerId of sb.towerIds) {
      if (sim.entities.has(towerId)) return true;
    }
    return false;
  }

  getAliveSubBaseCount(sim: Simulation): number {
    let count = 0;
    for (const [sbId] of this.subBases) {
      if (sim.entities.has(sbId)) count++;
    }
    return count;
  }

  getMinionCapBonus(sim: Simulation): number {
    return this.getAliveSubBaseCount(sim) * SUB_BASE_POP_MINIONS;
  }

  getPhantomCapBonus(sim: Simulation): number {
    return this.getAliveSubBaseCount(sim) * SUB_BASE_POP_PHANTOMS;
  }

  registerSubBaseTower(towerId: string, subBaseId: string): void {
    const sb = this.subBases.get(subBaseId);
    if (sb) {
      sb.towerIds.add(towerId);
      this.towerToSubBase.set(towerId, subBaseId);
    }
  }

  /** Find sub-bases that have fewer than max towers and are still alive */
  getSubBasesNeedingTowers(sim: Simulation): SubBaseState[] {
    const result: SubBaseState[] = [];
    for (const [sbId, sb] of this.subBases) {
      if (!sim.entities.has(sbId)) continue;
      let livingTowers = 0;
      for (const towerId of sb.towerIds) {
        if (sim.entities.has(towerId)) livingTowers++;
      }
      if (livingTowers < SUB_BASE_MAX_TOWERS) {
        result.push(sb);
      }
    }
    return result;
  }

  /** Auto-register a newly built tower to the nearest alive sub-base that has room */
  tryRegisterTowerToNearestSubBase(towerId: string, x: number, y: number, sim: Simulation): boolean {
    let bestDist = Infinity;
    let bestSbId: string | null = null;

    for (const [sbId, sb] of this.subBases) {
      if (!sim.entities.has(sbId)) continue;
      let livingTowers = 0;
      for (const tid of sb.towerIds) {
        if (sim.entities.has(tid)) livingTowers++;
      }
      if (livingTowers >= SUB_BASE_MAX_TOWERS) continue;

      const dx = x - sb.pos.x;
      const dy = y - sb.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= SUB_BASE_TOWER_RANGE && dist < bestDist) {
        bestDist = dist;
        bestSbId = sbId;
      }
    }

    if (bestSbId) {
      this.registerSubBaseTower(towerId, bestSbId);
      return true;
    }
    return false;
  }

  isShielded(sim: Simulation): boolean {
    if (this.phaseState.matchOver) return false;

    // Any towers (regular or missile) force mothership shield on, regardless of phase.
    const towers = sim.getEntitiesByKind("tower");
    const missileTowers = sim.getEntitiesByKind("missile_tower");
    if (towers.length > 0 || missileTowers.length > 0) return true;

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

  private spawnDeathBulletRing(sim: Simulation): void {
    const pos = this.mothershipLastPos ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    // Ghost entity — not added to sim, just used as bullet origin
    const ghost: Entity = {
      id: "mothership_death",
      kind: "mothership",
      pos: { x: pos.x, y: pos.y },
      vel: { x: 0, y: 0 },
      hp: 1,
      team: ENEMY_TEAM,
    };
    for (let i = 0; i < DEATH_RING_BULLET_COUNT; i++) {
      const angle = this.deathRingAngle + (Math.PI * 2 * i) / DEATH_RING_BULLET_COUNT;
      sim.spawnBullet(ghost, "mothership_death", angle, DEATH_RING_BULLET_DAMAGE, DEATH_RING_BULLET_SPEED);
    }
    this.deathRingAngle += Math.PI / DEATH_RING_BULLET_COUNT;
  }

  private updateMothershipDying(sim: Simulation): void {
    this.deathRingCooldown--;
    if (this.deathRingCooldown <= 0) {
      this.spawnDeathBulletRing(sim);
      this.deathRingCooldown = DEATH_RING_INTERVAL_TICKS;
    }

    this.mothershipDyingCountdown--;
    if (this.mothershipDyingCountdown <= 0) {
      const pos = this.mothershipLastPos ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
      this.spawnNemesis(sim, pos);
      this.phaseState.current = 4;
    }
  }

  private updateNemesis(sim: Simulation): void {
    if (!this.nemesisId) return;

    const nemesis = sim.entities.get(this.nemesisId);
    if (!nemesis || nemesis.hp <= 0) {
      this.phaseState.matchOver = true;
      this.phaseState.winner = "players";
      this.nemesisId = null;
      return;
    }

    // Teleport at every 20% HP threshold (80%, 60%, 40%, 20%) — skip if already dead
    if (this.nemesisTeleportThreshold > 0 && nemesis.hp <= this.nemesisTeleportThreshold) {
      // Advance past all crossed thresholds (handles large single-tick damage)
      while (nemesis.hp <= this.nemesisTeleportThreshold && this.nemesisTeleportThreshold > 0) {
        this.nemesisTeleportThreshold -= NEMESIS_HP * 0.2;
      }
      nemesis.pos.x = NEMESIS_RADIUS + Math.random() * (WORLD_WIDTH - 2 * NEMESIS_RADIUS);
      nemesis.pos.y = NEMESIS_RADIUS + Math.random() * (WORLD_HEIGHT - 2 * NEMESIS_RADIUS);
      nemesis.vel.x = 0;
      nemesis.vel.y = 0;
    }

    const dt = 1 / TICK_RATE;

    // Chase nearest alive player
    const players = sim.getEntitiesByKind("player_ship");
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;
    for (const player of players) {
      if (player.hp <= 0) continue;
      const dx = player.pos.x - nemesis.pos.x;
      const dy = player.pos.y - nemesis.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = player;
      }
    }

    if (nearest) {
      const dist = Math.sqrt(nearestDistSq);
      if (dist > NEMESIS_RADIUS + 1) {
        const nx = (nearest.pos.x - nemesis.pos.x) / dist;
        const ny = (nearest.pos.y - nemesis.pos.y) / dist;
        nemesis.vel.x += nx * NEMESIS_ACCEL * dt;
        nemesis.vel.y += ny * NEMESIS_ACCEL * dt;
        // Clamp to max speed
        const speed = Math.sqrt(nemesis.vel.x * nemesis.vel.x + nemesis.vel.y * nemesis.vel.y);
        if (speed > NEMESIS_SPEED) {
          nemesis.vel.x = (nemesis.vel.x / speed) * NEMESIS_SPEED;
          nemesis.vel.y = (nemesis.vel.y / speed) * NEMESIS_SPEED;
        }
      } else {
        // Repel Nemesis away from player when touching
        const nx = (nemesis.pos.x - nearest.pos.x) / dist;
        const ny = (nemesis.pos.y - nearest.pos.y) / dist;
        nemesis.vel.x += nx * NEMESIS_ACCEL * dt;
        nemesis.vel.y += ny * NEMESIS_ACCEL * dt;
        // Clamp to max speed
        const speed = Math.sqrt(nemesis.vel.x * nemesis.vel.x + nemesis.vel.y * nemesis.vel.y);
        if (speed > NEMESIS_SPEED) {
          nemesis.vel.x = (nemesis.vel.x / speed) * NEMESIS_SPEED;
          nemesis.vel.y = (nemesis.vel.y / speed) * NEMESIS_SPEED;
        }
      }
      nemesis.pos.x += nemesis.vel.x * dt;
      nemesis.pos.y += nemesis.vel.y * dt;
    }

    // Clamp to world bounds
    nemesis.pos.x = Math.max(NEMESIS_RADIUS, Math.min(WORLD_WIDTH - NEMESIS_RADIUS, nemesis.pos.x));
    nemesis.pos.y = Math.max(NEMESIS_RADIUS, Math.min(WORLD_HEIGHT - NEMESIS_RADIUS, nemesis.pos.y));

    // Spiral bullet fire
    this.spiralFireCooldown--;
    if (this.spiralFireCooldown <= 0) {
      for (let i = 0; i < NEMESIS_SPIRAL_COUNT; i++) {
        const angle = this.spiralAngle + (i * Math.PI * 2 / NEMESIS_SPIRAL_COUNT);
        sim.spawnBullet(nemesis, this.nemesisId, angle, NEMESIS_BULLET_DAMAGE, NEMESIS_SPIRAL_BULLET_SPEED);
      }
      this.spiralAngle += NEMESIS_SPIRAL_ROTATE_PER_SHOT;
      this.spiralFireCooldown = NEMESIS_SPIRAL_FIRE_COOLDOWN_TICKS;
    }

    // Per-player homing missile fire (one per player every 2 seconds)
    this.missileFireCooldown--;
    if (this.missileFireCooldown <= 0) {
      for (const player of players) {
        if (player.hp <= 0) continue;
        const dx = player.pos.x - nemesis.pos.x;
        const dy = player.pos.y - nemesis.pos.y;
        const aimAngle = Math.atan2(dy, dx);
        sim.spawnMissile(nemesis, this.nemesisId, aimAngle);
      }
      this.missileFireCooldown = NEMESIS_MISSILE_COOLDOWN_TICKS;
    }
  }

  update(sim: Simulation): void {
    if (this.phaseState.matchOver) return;

    // Phase 4: Nemesis fight — run its AI and return
    if (this.phaseState.current === 4) {
      this.updateNemesis(sim);
      return;
    }

    // Death sequence in progress — fire bullet rings, then spawn Nemesis when done
    if (this.mothershipDyingCountdown > 0) {
      this.updateMothershipDying(sim);
      return;
    }

    // Phases 1–3: Mothership fight
    const mothership = this.mothershipId
      ? sim.entities.get(this.mothershipId)
      : null;

    // If mothership entity is gone (removeDeadEntities ran before boss.update this tick),
    // start the death sequence using the last known position.
    if (!mothership) {
      if (this.mothershipId) {
        this.mothershipId = null;
        this.mothershipDyingCountdown = MOTHERSHIP_DEATH_TICKS;
        this.deathRingCooldown = 0; // fire first ring immediately
        this.deathRingAngle = 0;
        this.updateMothershipDying(sim);
      }
      return;
    }

    // Store position for fallback in case entity is removed externally next tick
    this.mothershipLastPos = { x: mothership.pos.x, y: mothership.pos.y };

    // Enforce shield: if shielded, undo any damage dealt this tick
    const shielded = this.isShielded(sim);
    if (shielded && mothership.hp < MOTHERSHIP_HP) {
      mothership.hp = MOTHERSHIP_HP;
    }

    // Enforce sub-base shields and clean up dead sub-bases
    for (const [sbId, sbState] of this.subBases) {
      const sbEntity = sim.entities.get(sbId);
      if (!sbEntity) {
        // Sub-base is dead — clean up tracking (orphaned towers remain in game)
        for (const towerId of sbState.towerIds) {
          this.towerToSubBase.delete(towerId);
        }
        this.subBases.delete(sbId);
        continue;
      }

      // Clean up dead tower references
      for (const towerId of sbState.towerIds) {
        if (!sim.entities.has(towerId)) {
          sbState.towerIds.delete(towerId);
          this.towerToSubBase.delete(towerId);
        }
      }

      // If sub-base has living towers, restore HP (shield)
      if (this.isSubBaseShielded(sbId, sim) && sbEntity.hp < SUB_BASE_HP) {
        sbEntity.hp = SUB_BASE_HP;
      }
    }

    // Phase transitions (one per tick max)
    const towers = sim.getEntitiesByKind("tower");
    const minions = sim.getEntitiesByKind("minion_ship");
    const missileTowers = sim.getEntitiesByKind("missile_tower");

    if (this.phaseState.current === 1 && towers.length === 0 && missileTowers.length === 0) {
      this.phaseState.current = 2;
    } else if (this.phaseState.current === 2 && minions.length === 0) {
      this.phaseState.current = 3;
    }

    // boss.update caught hp=0 before sim deleted it (test scenario or same-tick death)
    if (mothership.hp <= 0) {
      this.mothershipLastPos = { x: mothership.pos.x, y: mothership.pos.y };
      sim.entities.delete(this.mothershipId!);
      this.mothershipId = null;
      this.mothershipDyingCountdown = MOTHERSHIP_DEATH_TICKS;
      this.deathRingCooldown = 0; // fire first ring immediately
      this.deathRingAngle = 0;
      this.updateMothershipDying(sim);
    }
  }

  getMothershipPos(sim: Simulation): { x: number; y: number } | undefined {
    const mothership = this.mothershipId
      ? sim.entities.get(this.mothershipId)
      : undefined;
    return mothership ? { x: mothership.pos.x, y: mothership.pos.y } : undefined;
  }

  getPhaseInfo(sim: Simulation) {
    const towers = sim.getEntitiesByKind("tower");
    const missileTowers = sim.getEntitiesByKind("missile_tower");
    const minions = sim.getEntitiesByKind("minion_ship");

    const objectives: string[] = [];
    const remaining: Record<string, number> = {};

    if (this.phaseState.current === 1) {
      objectives.push("Destroy all towers and sub-bases");
      remaining.tower = towers.length;
      remaining.missile_tower = missileTowers.length;
      const subBases = sim.getEntitiesByKind("sub_base");
      remaining.sub_base = subBases.length;
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
    } else if (this.phaseState.current === 4) {
      objectives.push("Defeat the Nemesis");
      const nemesis = this.nemesisId
        ? sim.entities.get(this.nemesisId)
        : null;
      if (nemesis) {
        remaining.nemesis = nemesis.hp;
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
