import {
  Entity,
  MINION_SPEED,
  MINION_ACCEL,
  MINION_BRAKE_FRICTION,
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
  // Orb targeting — persists across ticks so minions don't swap targets every frame
  targetOrbId: string | null;
}

export class AIManager {
  aiStates: Map<string, AIState> = new Map();
  /** Center point for patrol behavior (set to mothership position) */
  private patrolCenter: { x: number; y: number } = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  /** Orbs claimed by a minion this tick — reset at the start of each update() */
  private claimedOrbs: Set<string> = new Set();

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
      targetOrbId: null,
    });
  }

  update(sim: Simulation): void {
    this.claimedOrbs.clear();
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
    const px = -ny; // perpendicular for strafing
    const py = nx;
    const strafe = Math.sin((sim.tick / TICK_RATE) * aiState.strafeFrequency + aiState.strafePhase) * aiState.strafeAmplitude;

    // Compute a desired thrust direction (chase + strafe blend), then apply acceleration
    let thrustX: number;
    let thrustY: number;

    if (dist > MINION_FIRE_RANGE * 0.7) {
      // Closing in: thrust toward target with a strafe weave
      thrustX = nx * aiState.moveSpeedScale + px * (strafe / MINION_SPEED) * 0.6;
      thrustY = ny * aiState.moveSpeedScale + py * (strafe / MINION_SPEED) * 0.6;
    } else {
      // In fire range: strafe only (orbit the target)
      thrustX = px * (strafe / MINION_SPEED) * 0.35;
      thrustY = py * (strafe / MINION_SPEED) * 0.35;
    }

    const tMag = Math.sqrt(thrustX * thrustX + thrustY * thrustY);
    if (tMag > 0.01) {
      entity.vel.x += (thrustX / tMag) * MINION_ACCEL * this.dt;
      entity.vel.y += (thrustY / tMag) * MINION_ACCEL * this.dt;
    } else {
      // No meaningful thrust direction — apply braking
      entity.vel.x *= MINION_BRAKE_FRICTION;
      entity.vel.y *= MINION_BRAKE_FRICTION;
    }

    // Clamp to max speed
    const maxSpeed = MINION_SPEED * aiState.moveSpeedScale;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > maxSpeed) {
      entity.vel.x = (entity.vel.x / speed) * maxSpeed;
      entity.vel.y = (entity.vel.y / speed) * maxSpeed;
    }

    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;

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
        if (aiState.targetOrbId === orbId) aiState.targetOrbId = null;
      }
    }

    // Keep the current target orb if it still exists; otherwise find the nearest unclaimed one.
    // Registering the claim prevents other minions (processed later this tick) from picking the same orb.
    let targetOrb: Entity | null = null;
    if (aiState.targetOrbId) {
      const existing = sim.entities.get(aiState.targetOrbId);
      if (existing && existing.kind === "energy_orb" && existing.hp > 0) {
        targetOrb = existing;
        this.claimedOrbs.add(targetOrb.id);
      } else {
        aiState.targetOrbId = null;
      }
    }
    if (!targetOrb) {
      targetOrb = this.findNearestUnclaimedOrb(entity, sim);
      if (targetOrb) {
        aiState.targetOrbId = targetOrb.id;
        this.claimedOrbs.add(targetOrb.id);
      }
    }

    if (targetOrb) {
      aiState.waypointX = targetOrb.pos.x;
      aiState.waypointY = targetOrb.pos.y;
    }

    const dx = aiState.waypointX - entity.pos.x;
    const dy = aiState.waypointY - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 20) {
      if (!targetOrb) {
        // No orbs on map — wander to a new random waypoint
        const wp = this.randomPatrolWaypoint();
        aiState.waypointX = wp.x;
        aiState.waypointY = wp.y;
      }
      // Brake to a stop at the waypoint
      entity.vel.x *= MINION_BRAKE_FRICTION;
      entity.vel.y *= MINION_BRAKE_FRICTION;
      if (Math.abs(entity.vel.x) < 0.1) entity.vel.x = 0;
      if (Math.abs(entity.vel.y) < 0.1) entity.vel.y = 0;
      return;
    }

    // Accelerate toward waypoint, capped at patrol speed
    const nx = dx / dist;
    const ny = dy / dist;
    entity.vel.x += nx * MINION_ACCEL * this.dt;
    entity.vel.y += ny * MINION_ACCEL * this.dt;

    const maxSpeed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > maxSpeed) {
      entity.vel.x = (entity.vel.x / speed) * maxSpeed;
      entity.vel.y = (entity.vel.y / speed) * maxSpeed;
    }

    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
  }

  private updateMinionReturnToBase(entity: Entity, aiState: AIState): void {
    const dx = this.patrolCenter.x - entity.pos.x;
    const dy = this.patrolCenter.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Brake to a stop once home
    if (dist < ENEMY_PATROL_RADIUS * 0.25) {
      entity.vel.x *= MINION_BRAKE_FRICTION;
      entity.vel.y *= MINION_BRAKE_FRICTION;
      if (Math.abs(entity.vel.x) < 0.1) entity.vel.x = 0;
      if (Math.abs(entity.vel.y) < 0.1) entity.vel.y = 0;
      entity.pos.x += entity.vel.x * this.dt;
      entity.pos.y += entity.vel.y * this.dt;
      return;
    }

    // Lightspeed: accelerate toward base with much higher speed and acceleration
    const nx = dx / dist;
    const ny = dy / dist;
    const LIGHTSPEED_FACTOR = 4;
    entity.vel.x += nx * MINION_ACCEL * this.dt * LIGHTSPEED_FACTOR;
    entity.vel.y += ny * MINION_ACCEL * this.dt * LIGHTSPEED_FACTOR;

    const maxSpeed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale * LIGHTSPEED_FACTOR;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > maxSpeed) {
      entity.vel.x = (entity.vel.x / speed) * maxSpeed;
      entity.vel.y = (entity.vel.y / speed) * maxSpeed;
    }

    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
  }

  private findNearestUnclaimedOrb(entity: Entity, sim: Simulation): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;
    for (const orb of sim.entities.values()) {
      if (orb.kind !== "energy_orb" || orb.hp <= 0) continue;
      if (this.claimedOrbs.has(orb.id)) continue;
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
