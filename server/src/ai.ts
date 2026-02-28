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
  ORB_RADIUS,
  PHANTOM_SPEED,
  PHANTOM_ACCEL,
  PHANTOM_BRAKE_FRICTION,
  PHANTOM_FIRE_RANGE,
  PHANTOM_FIRE_COOLDOWN_TICKS,
  PHANTOM_BURST_SIZE,
  PHANTOM_BURST_DELAY_TICKS,
  PHANTOM_GUARD_RADIUS,
  PHANTOM_ORBIT_RADIUS,
  PHANTOM_ORBIT_ANGULAR_SPEED,
  PHANTOM_FLANK_DIST,
  PHANTOM_FLANK_LOOK_AHEAD_S,
  PHANTOM_AIM_RANDOM_SPREAD,
  PHANTOM_CHASE_ORBIT_RADIUS,
  PHANTOM_CHASE_ORBIT_SPEED,
  BULLET_SPEED,
} from "shared";
import { Simulation, circlesOverlap } from "./sim.js";

export type AIMode = "patrol" | "chase" | "return_to_base" | "flank";

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
  // Phantom burst — store target so each shot recalculates predictive aim
  burstTargetId: string | null;
  // Phantom chase orbit — angle around the target player, advances each tick
  phantomOrbitAngle: number;
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
      burstTargetId: null,
      phantomOrbitAngle: Math.random() * Math.PI * 2,
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
      } else if (entity.kind === "phantom_ship") {
        this.updatePhantom(entity, aiState, sim);
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
      if (circlesOverlap(entity.pos, MINION_RADIUS, orb.pos, ORB_RADIUS)) {
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

    // Always track the aim angle toward the nearest target (for client rendering)
    entity.aimAngle = Math.atan2(dy, dx);

    // Fire at target if in range
    if (dist <= TOWER_FIRE_RANGE && aiState.fireCooldown <= 0) {
      sim.spawnBullet(entity, entity.id, entity.aimAngle);
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

  // ---------------------------------------------------------------------------
  // Phantom Ship AI — fast flanker that guards the mothership
  // ---------------------------------------------------------------------------

  private updatePhantom(entity: Entity, aiState: AIState, sim: Simulation): void {
    const msPos = this.patrolCenter; // mothership position (updated by boss manager)

    // --- Burst fire tick (non-blocking — phantom keeps moving during burst) ---
    // Each shot recalculates predictive aim so bullets track a moving player.
    if (aiState.burstRemaining > 0) {
      if (aiState.burstCooldown <= 0) {
        const burstTarget = aiState.burstTargetId ? sim.entities.get(aiState.burstTargetId) : null;
        let angle = aiState.burstAimAngle; // fallback if target despawned
        if (burstTarget && burstTarget.hp > 0) {
          const btDx = burstTarget.pos.x - entity.pos.x;
          const btDy = burstTarget.pos.y - entity.pos.y;
          const btDist = Math.sqrt(btDx * btDx + btDy * btDy) || 1;
          const btTravel = btDist / BULLET_SPEED;
          const btPredX = burstTarget.pos.x + burstTarget.vel.x * btTravel;
          const btPredY = burstTarget.pos.y + burstTarget.vel.y * btTravel;
          angle = Math.atan2(btPredY - entity.pos.y, btPredX - entity.pos.x)
            + (Math.random() - 0.5) * 2 * PHANTOM_AIM_RANDOM_SPREAD;
        }
        sim.spawnBullet(entity, entity.id, angle);
        aiState.burstRemaining--;
        aiState.burstCooldown = PHANTOM_BURST_DELAY_TICKS;
      } else {
        aiState.burstCooldown--;
      }
    }

    const target = this.findNearestEnemy(entity, sim);

    if (!target) {
      // No players — orbit mothership quietly
      aiState.aiMode = "patrol";
      this.phantomOrbit(entity, aiState, msPos);
      entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
      entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));
      return;
    }

    // Is the player close enough to the mothership to activate the phantom?
    const dxPlayerMs = target.pos.x - msPos.x;
    const dyPlayerMs = target.pos.y - msPos.y;
    const distPlayerToMs = Math.sqrt(dxPlayerMs * dxPlayerMs + dyPlayerMs * dyPlayerMs);

    if (distPlayerToMs > PHANTOM_GUARD_RADIUS) {
      // Player left the guard zone — return to orbit
      if (aiState.aiMode !== "return_to_base" && aiState.aiMode !== "patrol") {
        aiState.aiMode = "return_to_base";
      }
      this.phantomOrbit(entity, aiState, msPos);
      entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
      entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));
      return;
    }

    // Player is in guard zone — compute flank position (far side of mothership)
    // Predict where the player is heading so the Phantom leads their movement
    const predictedPlayerX = target.pos.x + target.vel.x * PHANTOM_FLANK_LOOK_AHEAD_S;
    const predictedPlayerY = target.pos.y + target.vel.y * PHANTOM_FLANK_LOOK_AHEAD_S;
    const dxPredMs = predictedPlayerX - msPos.x;
    const dyPredMs = predictedPlayerY - msPos.y;
    const predToMsLen = Math.sqrt(dxPredMs * dxPredMs + dyPredMs * dyPredMs) || 1;
    const nx = -dxPredMs / predToMsLen; // unit vector: predicted-player → mothership
    const ny = -dyPredMs / predToMsLen;
    const flankX = msPos.x + nx * PHANTOM_FLANK_DIST;
    const flankY = msPos.y + ny * PHANTOM_FLANK_DIST;

    // Distances relevant for state transitions
    const dxToTarget = target.pos.x - entity.pos.x;
    const dyToTarget = target.pos.y - entity.pos.y;
    const distToTarget = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);

    // State machine
    const prevMode = aiState.aiMode;
    if (distToTarget <= PHANTOM_FIRE_RANGE) {
      if (prevMode !== "chase") {
        // Sync orbit angle to current position so we don't fly through the player
        aiState.phantomOrbitAngle = Math.atan2(entity.pos.y - target.pos.y, entity.pos.x - target.pos.x);
      }
      aiState.aiMode = "chase"; // close enough — attack!
    } else {
      aiState.aiMode = "flank"; // move to flanking position first
    }

    // Movement: go to flank position (far side of mothership) or circle orbit (chase)
    if (aiState.aiMode === "flank") {
      // flankX/flankY already leads the player's movement via PHANTOM_FLANK_LOOK_AHEAD_S
      this.phantomThrustTo(entity, aiState, flankX, flankY, PHANTOM_SPEED);
    } else {
      // Advance the orbit angle each tick to strafe around the player
      aiState.phantomOrbitAngle += PHANTOM_CHASE_ORBIT_SPEED * this.dt;
      const orbitX = target.pos.x + Math.cos(aiState.phantomOrbitAngle) * PHANTOM_CHASE_ORBIT_RADIUS;
      const orbitY = target.pos.y + Math.sin(aiState.phantomOrbitAngle) * PHANTOM_CHASE_ORBIT_RADIUS;
      this.phantomThrustTo(entity, aiState, orbitX, orbitY, PHANTOM_SPEED);
    }

    // Re-clamp speed after evasion impulse (allow small overspeed for snappy dodge feel)
    const spd = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    const cap = PHANTOM_SPEED * aiState.moveSpeedScale * 1.25;
    if (spd > cap) {
      entity.vel.x = (entity.vel.x / spd) * cap;
      entity.vel.y = (entity.vel.y / spd) * cap;
    }

    // Integrate position
    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
    entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
    entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));

    // Fire burst at target if in range and cooldown is ready
    if (distToTarget <= PHANTOM_FIRE_RANGE && aiState.fireCooldown <= 0 && aiState.burstRemaining === 0) {
      this.phantomStartBurst(entity, aiState, target, sim);
      aiState.fireCooldown = PHANTOM_FIRE_COOLDOWN_TICKS;
    }
  }

  /** Orbit the mothership slowly (patrol) or sprint back to it (return_to_base). */
  private phantomOrbit(entity: Entity, aiState: AIState, msPos: { x: number; y: number }): void {
    const dxToMs = entity.pos.x - msPos.x;
    const dyToMs = entity.pos.y - msPos.y;
    const distToMs = Math.sqrt(dxToMs * dxToMs + dyToMs * dyToMs);

    if (aiState.aiMode === "return_to_base") {
      if (distToMs <= PHANTOM_ORBIT_RADIUS * 1.3) {
        aiState.aiMode = "patrol";
      } else {
        // Sprint directly toward mothership center, then transition to orbit
        this.phantomThrustTo(entity, aiState, msPos.x, msPos.y, PHANTOM_SPEED);
        entity.pos.x += entity.vel.x * this.dt;
        entity.pos.y += entity.vel.y * this.dt;
        return;
      }
    }

    // Patrol: advance the orbit angle each tick to create circular motion
    const currentAngle = Math.atan2(dxToMs === 0 && dyToMs === 0 ? 1 : dyToMs, dxToMs);
    const nextAngle = currentAngle + PHANTOM_ORBIT_ANGULAR_SPEED * this.dt;
    const targetX = msPos.x + Math.cos(nextAngle) * PHANTOM_ORBIT_RADIUS;
    const targetY = msPos.y + Math.sin(nextAngle) * PHANTOM_ORBIT_RADIUS;
    this.phantomThrustTo(entity, aiState, targetX, targetY, PHANTOM_SPEED * 0.5);
    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;
  }

  /** Apply velocity toward a target point, capped at maxSpeed * moveSpeedScale.
   *  Does NOT update entity.pos — caller handles position integration. */
  private phantomThrustTo(
    entity: Entity,
    aiState: AIState,
    targetX: number,
    targetY: number,
    maxSpeed: number,
  ): void {
    const dx = targetX - entity.pos.x;
    const dy = targetY - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      entity.vel.x *= PHANTOM_BRAKE_FRICTION;
      entity.vel.y *= PHANTOM_BRAKE_FRICTION;
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    entity.vel.x += nx * PHANTOM_ACCEL * this.dt;
    entity.vel.y += ny * PHANTOM_ACCEL * this.dt;

    const spd = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    const cap = maxSpeed * aiState.moveSpeedScale;
    if (spd > cap) {
      entity.vel.x = (entity.vel.x / spd) * cap;
      entity.vel.y = (entity.vel.y / spd) * cap;
    }
  }

  /** Start a burst — stores target so each shot recalculates predictive aim. Fires the first bullet now. */
  private phantomStartBurst(entity: Entity, aiState: AIState, target: Entity, sim: Simulation): void {
    aiState.burstTargetId = target.id;
    aiState.burstRemaining = PHANTOM_BURST_SIZE - 1; // remaining shots after this one
    aiState.burstCooldown = PHANTOM_BURST_DELAY_TICKS;

    // Fire first bullet with fresh predictive aim
    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const travelTime = dist / BULLET_SPEED;
    const predictedX = target.pos.x + target.vel.x * travelTime;
    const predictedY = target.pos.y + target.vel.y * travelTime;
    const angle = Math.atan2(predictedY - entity.pos.y, predictedX - entity.pos.x)
      + (Math.random() - 0.5) * 2 * PHANTOM_AIM_RANDOM_SPREAD;

    sim.spawnBullet(entity, entity.id, angle);
  }
}
