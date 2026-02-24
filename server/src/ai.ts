import {
  Entity,
  MINION_SPEED,
  MINION_FIRE_COOLDOWN_TICKS,
  MINION_FIRE_RANGE,
  MINION_RADIUS,
  TOWER_FIRE_COOLDOWN_TICKS,
  TOWER_FIRE_RANGE,
  MISSILE_TOWER_FIRE_COOLDOWN_TICKS,
  MISSILE_TOWER_FIRE_RANGE,
  MISSILE_BURST_SIZE,
  MISSILE_BURST_DELAY_TICKS,
  TICK_RATE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ENEMY_AGGRO_RANGE,
  ENEMY_DEAGGRO_RANGE,
  ENEMY_PATROL_RADIUS,
  ENEMY_PATROL_SPEED,
  MINION_ORB_PICKUP_RANGE,
} from "shared";
import { Simulation, entityRadius } from "./sim.js";

export type AIMode = "patrol" | "chase" | "return_to_base";

export interface AIState {
  entityId: string;
  fireCooldown: number;
  moveSpeedScale: number;
  strafeAmplitude: number;
  strafeFrequency: number;
  strafePhase: number;
  aiMode: AIMode;
  waypointX: number;
  waypointY: number;
  // Missile tower burst state
  burstRemaining: number;
  burstCooldown: number;
  burstAimAngle: number;
}

export class AIManager {
  aiStates: Map<string, AIState> = new Map();
  /** Center point for patrol behavior (set to mothership position) */
  private patrolCenter: { x: number; y: number } = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

  private dt = 1 / TICK_RATE;

  setPatrolCenter(pos: { x: number; y: number }): void {
    this.patrolCenter = pos;
  }

  registerEntity(entityId: string): void {
    const wp = this.randomPatrolWaypoint();
    this.aiStates.set(entityId, {
      entityId,
      fireCooldown: Math.floor(Math.random() * MINION_FIRE_COOLDOWN_TICKS),
      moveSpeedScale: 0.9 + Math.random() * 0.25,
      strafeAmplitude: 18 + Math.random() * 26,
      strafeFrequency: 0.9 + Math.random() * 1.1,
      strafePhase: Math.random() * Math.PI * 2,
      aiMode: "patrol",
      waypointX: wp.x,
      waypointY: wp.y,
      burstRemaining: 0,
      burstCooldown: 0,
      burstAimAngle: 0,
    });
  }

  update(sim: Simulation): void {
    for (const [entityId, aiState] of this.aiStates) {
      const entity = sim.entities.get(entityId);
      if (!entity) {
        this.aiStates.delete(entityId);
        continue;
      }

      if (aiState.fireCooldown > 0) {
        aiState.fireCooldown--;
      }

      if (entity.kind === "minion_ship") {
        this.updateMinion(entity, aiState, sim);
      } else if (entity.kind === "tower") {
        this.updateTower(entity, aiState, sim);
      } else if (entity.kind === "missile_tower") {
        this.updateMissileTower(entity, aiState, sim);
      }
    }
  }

  private allTurretsDestroyed(sim: Simulation): boolean {
    return (
      sim.getEntitiesByKind("tower").length === 0 &&
      sim.getEntitiesByKind("missile_tower").length === 0
    );
  }

  private updateMinion(entity: Entity, aiState: AIState, sim: Simulation): void {
    const target = this.findNearestEnemy(entity, sim);
    const noTurrets = this.allTurretsDestroyed(sim);

    // Determine aggro state transitions
    if (target) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      const distToTarget = Math.sqrt(dx * dx + dy * dy);

      if (aiState.aiMode !== "chase" && distToTarget < ENEMY_AGGRO_RANGE) {
        aiState.aiMode = "chase";
      } else if (aiState.aiMode === "chase" && distToTarget > ENEMY_DEAGGRO_RANGE) {
        if (noTurrets) {
          aiState.aiMode = "return_to_base";
        } else {
          aiState.aiMode = "patrol";
          const wp = this.randomPatrolWaypoint();
          aiState.waypointX = wp.x;
          aiState.waypointY = wp.y;
        }
      }
    } else {
      // No targets at all
      if (aiState.aiMode === "chase") {
        if (noTurrets) {
          aiState.aiMode = "return_to_base";
        } else {
          aiState.aiMode = "patrol";
          const wp = this.randomPatrolWaypoint();
          aiState.waypointX = wp.x;
          aiState.waypointY = wp.y;
        }
      }
    }

    // Patrol → return_to_base when all turrets have fallen
    if (aiState.aiMode === "patrol" && noTurrets) {
      aiState.aiMode = "return_to_base";
    }

    if (aiState.aiMode === "chase" && target) {
      this.updateMinionChase(entity, aiState, sim, target);
    } else if (aiState.aiMode === "return_to_base") {
      this.updateMinionReturnToBase(entity, aiState);
    } else {
      this.updateMinionPatrol(entity, aiState, sim);
    }

    // Clamp to world bounds
    entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
    entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));
  }

  private updateMinionChase(entity: Entity, aiState: AIState, sim: Simulation, target: Entity): void {
    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    const px = -ny;
    const py = nx;
    const strafe = Math.sin((sim.tick / TICK_RATE) * aiState.strafeFrequency + aiState.strafePhase) * aiState.strafeAmplitude;

    if (dist > MINION_FIRE_RANGE * 0.7) {
      const desiredX = nx * MINION_SPEED * aiState.moveSpeedScale + px * strafe * 0.6;
      const desiredY = ny * MINION_SPEED * aiState.moveSpeedScale + py * strafe * 0.6;

      entity.vel = { x: desiredX, y: desiredY };
      entity.pos.x += desiredX * this.dt;
      entity.pos.y += desiredY * this.dt;
    } else {
      entity.vel = {
        x: px * strafe * 0.35,
        y: py * strafe * 0.35,
      };
      entity.pos.x += entity.vel.x * this.dt;
      entity.pos.y += entity.vel.y * this.dt;
    }

    // Fire at target if in range
    if (dist <= MINION_FIRE_RANGE && aiState.fireCooldown <= 0) {
      const aimAngle = Math.atan2(dy, dx);
      sim.spawnBullet(entity, entity.id, aimAngle);
      aiState.fireCooldown = MINION_FIRE_COOLDOWN_TICKS;
    }
  }

  private updateMinionPatrol(entity: Entity, aiState: AIState, sim: Simulation): void {
    // Collect any orb we're touching
    for (const [orbId, orb] of sim.entities) {
      if (orb.kind !== "energy_orb" || orb.hp <= 0) continue;
      const dx = orb.pos.x - entity.pos.x;
      const dy = orb.pos.y - entity.pos.y;
      if (dx * dx + dy * dy <= MINION_ORB_PICKUP_RANGE * MINION_ORB_PICKUP_RANGE) {
        sim.collectOrbForEnemy(orbId);
      }
    }

    // Steer toward nearest orb; fall back to random waypoint if none
    const nearestOrb = this.findNearestOrb(entity, sim);
    if (nearestOrb) {
      aiState.waypointX = nearestOrb.pos.x;
      aiState.waypointY = nearestOrb.pos.y;
    }

    const dx = aiState.waypointX - entity.pos.x;
    const dy = aiState.waypointY - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 20) {
      if (!nearestOrb) {
        // No orbs on map — wander back toward mothership
        const wp = this.randomPatrolWaypoint();
        aiState.waypointX = wp.x;
        aiState.waypointY = wp.y;
      }
      entity.vel = { x: 0, y: 0 };
      return;
    }

    // Move toward waypoint at patrol speed
    const nx = dx / dist;
    const ny = dy / dist;
    const speed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale;
    entity.vel = { x: nx * speed, y: ny * speed };
    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
  }

  private updateMinionReturnToBase(entity: Entity, aiState: AIState): void {
    const dx = this.patrolCenter.x - entity.pos.x;
    const dy = this.patrolCenter.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Stop once close enough to mothership
    if (dist < ENEMY_PATROL_RADIUS * 0.25) {
      entity.vel = { x: 0, y: 0 };
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const speed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale;
    entity.vel = { x: nx * speed, y: ny * speed };
    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
  }

  private findNearestOrb(entity: Entity, sim: Simulation): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;
    for (const orb of sim.entities.values()) {
      if (orb.kind !== "energy_orb" || orb.hp <= 0) continue;
      const dx = orb.pos.x - entity.pos.x;
      const dy = orb.pos.y - entity.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = orb;
      }
    }
    return nearest;
  }

  private randomPatrolWaypoint(): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * ENEMY_PATROL_RADIUS;
    return {
      x: this.patrolCenter.x + Math.cos(angle) * dist,
      y: this.patrolCenter.y + Math.sin(angle) * dist,
    };
  }

  private updateTower(entity: Entity, aiState: AIState, sim: Simulation): void {
    // Towers don't move
    entity.vel = { x: 0, y: 0 };

    const target = this.findNearestEnemy(entity, sim);
    if (!target) return;

    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Fire at target if in range
    if (dist <= TOWER_FIRE_RANGE && aiState.fireCooldown <= 0) {
      const aimAngle = Math.atan2(dy, dx);
      sim.spawnBullet(entity, entity.id, aimAngle);
      aiState.fireCooldown = TOWER_FIRE_COOLDOWN_TICKS;
    }
  }

  private updateMissileTower(entity: Entity, aiState: AIState, sim: Simulation): void {
    entity.vel = { x: 0, y: 0 };

    // Continue an active burst
    if (aiState.burstRemaining > 0) {
      if (aiState.burstCooldown <= 0) {
        sim.spawnMissile(entity, entity.id, aiState.burstAimAngle);
        aiState.burstRemaining--;
        aiState.burstCooldown = MISSILE_BURST_DELAY_TICKS;
      } else {
        aiState.burstCooldown--;
      }
      return;
    }

    // Start a new burst when a target is in range and ready
    const target = this.findNearestEnemy(entity, sim);
    if (!target) return;

    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= MISSILE_TOWER_FIRE_RANGE && aiState.fireCooldown <= 0) {
      const aimAngle = Math.atan2(dy, dx);
      sim.spawnMissile(entity, entity.id, aimAngle);
      aiState.burstRemaining = MISSILE_BURST_SIZE - 1;
      aiState.burstCooldown = MISSILE_BURST_DELAY_TICKS;
      aiState.burstAimAngle = aimAngle;
      aiState.fireCooldown = MISSILE_TOWER_FIRE_COOLDOWN_TICKS;
    }
  }

  private findNearestEnemy(entity: Entity, sim: Simulation): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;

    for (const other of sim.entities.values()) {
      if (other.team === entity.team) continue;
      if (other.kind === "bullet") continue;
      if (other.kind === "missile") continue;
      if (other.kind === "energy_orb") continue;
      if (other.hp <= 0) continue;

      const dx = other.pos.x - entity.pos.x;
      const dy = other.pos.y - entity.pos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = other;
      }
    }

    return nearest;
  }
}
