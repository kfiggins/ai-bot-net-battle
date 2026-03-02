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
  DREADNOUGHT_SPEED,
  DREADNOUGHT_ACCEL,
  DREADNOUGHT_BRAKE_FRICTION,
  DREADNOUGHT_RADIUS,
  DREADNOUGHT_TURRET_COUNT,
  DREADNOUGHT_TURRET_FIRE_RANGE,
  DREADNOUGHT_TURRET_FIRE_COOLDOWN,
  DREADNOUGHT_TURRET_ARC,
  DREADNOUGHT_TURRET_BASE_ANGLES,
  DREADNOUGHT_TURRET_OFFSET,
  DREADNOUGHT_BIG_CANNON_COOLDOWN,
  DREADNOUGHT_BIG_CANNON_RANGE,
  DREADNOUGHT_BIG_CANNON_SPEED,
  MINE_LAY_INTERVAL_TICKS,
  DifficultyProfile,
  getDifficultyProfile,
  GRENADER_SPEED,
  GRENADER_ACCEL,
  GRENADER_BRAKE_FRICTION,
  GRENADER_RADIUS,
  GRENADER_FIRE_RANGE,
  GRENADER_FIRE_COOLDOWN,
  GRENADER_KEEP_DISTANCE,
  GRENADE_SPEED,
  INTERCEPTOR_SPEED,
  INTERCEPTOR_ACCEL,
  INTERCEPTOR_BRAKE_FRICTION,
  INTERCEPTOR_RADIUS,
  INTERCEPTOR_FIRE_RANGE,
  INTERCEPTOR_FIRE_COOLDOWN,
  INTERCEPTOR_BURST_SIZE,
  INTERCEPTOR_BURST_DELAY_TICKS,
  INTERCEPTOR_BURST_SPREAD,
  INTERCEPTOR_ORBIT_RADIUS,
  INTERCEPTOR_ORBIT_SPEED,
  INTERCEPTOR_DODGE_SCAN_RADIUS,
  INTERCEPTOR_DODGE_LOOKAHEAD_S,
  INTERCEPTOR_DODGE_IMPULSE,
  BULLET_RADIUS,
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
  // Dreadnought state
  turretCooldowns: number[];
  mineLayCooldown: number;
  bigCannonCooldown: number;
  // Dreadnought assigned player targeting (hard mode: 1 per player)
  assignedPlayerId: string | null;
}

export class AIManager {
  aiStates: Map<string, AIState> = new Map();
  /** Center point for patrol behavior (set to mothership position) */
  private patrolCenter: { x: number; y: number } = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  /** Orbs claimed by a minion this tick — reset at the start of each update() */
  private claimedOrbs: Set<string> = new Set();

  private dt = 1 / TICK_RATE;
  constructor(private readonly profile: DifficultyProfile = getDifficultyProfile("hard")) {}

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
      turretCooldowns: Array.from({ length: DREADNOUGHT_TURRET_COUNT }, () => 0),
      mineLayCooldown: 0,
      bigCannonCooldown: DREADNOUGHT_BIG_CANNON_COOLDOWN,
      assignedPlayerId: null,
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
      } else if (entity.kind === "dreadnought") {
        this.updateDreadnought(entity, aiState, sim);
      } else if (entity.kind === "grenader") {
        this.updateGrenader(entity, aiState, sim);
      } else if (entity.kind === "interceptor") {
        this.updateInterceptor(entity, aiState, sim);
      }
    }
  }

  private scaleRange(base: number): number {
    return base * this.profile.enemyRangeMult;
  }

  private scaleCooldown(baseTicks: number): number {
    return Math.max(1, Math.round(baseTicks / this.profile.enemyFireRateMult));
  }

  private missileBurstSize(): number {
    if (this.profile.key === "beginner") return 1;
    if (this.profile.key === "normal") return 2;
    return MISSILE_BURST_SIZE;
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

      const aggroRange = ENEMY_AGGRO_RANGE * this.profile.enemyAggroMult;
      const deaggroRange = ENEMY_DEAGGRO_RANGE * this.profile.enemyAggroMult;
      if (aiState.aiMode !== "chase" && distToTarget < aggroRange) {
        aiState.aiMode = "chase";
      } else if (aiState.aiMode === "chase" && distToTarget > deaggroRange) {
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

    const minionRange = this.scaleRange(MINION_FIRE_RANGE);

    if (dist > minionRange * 0.7) {
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
      entity.vel.x += (thrustX / tMag) * MINION_ACCEL * this.profile.enemyAccelMult * this.dt;
      entity.vel.y += (thrustY / tMag) * MINION_ACCEL * this.profile.enemyAccelMult * this.dt;
    } else {
      // No meaningful thrust direction — apply braking
      entity.vel.x *= MINION_BRAKE_FRICTION;
      entity.vel.y *= MINION_BRAKE_FRICTION;
    }

    // Clamp to max speed
    const maxSpeed = MINION_SPEED * aiState.moveSpeedScale * this.profile.enemyMoveSpeedMult;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > maxSpeed) {
      entity.vel.x = (entity.vel.x / speed) * maxSpeed;
      entity.vel.y = (entity.vel.y / speed) * maxSpeed;
    }

    entity.pos.x += entity.vel.x * this.dt;
    entity.pos.y += entity.vel.y * this.dt;

    // Fire at target if in range
    if (dist <= minionRange && aiState.fireCooldown <= 0) {
      const aimAngle = Math.atan2(dy, dx);
      sim.spawnBullet(entity, entity.id, aimAngle);
      aiState.fireCooldown = this.scaleCooldown(MINION_FIRE_COOLDOWN_TICKS);
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
    entity.vel.x += nx * MINION_ACCEL * this.profile.enemyAccelMult * this.dt;
    entity.vel.y += ny * MINION_ACCEL * this.profile.enemyAccelMult * this.dt;

    const maxSpeed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale * this.profile.enemyMoveSpeedMult;
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
    entity.vel.x += nx * MINION_ACCEL * this.profile.enemyAccelMult * this.dt * LIGHTSPEED_FACTOR;
    entity.vel.y += ny * MINION_ACCEL * this.profile.enemyAccelMult * this.dt * LIGHTSPEED_FACTOR;

    const maxSpeed = ENEMY_PATROL_SPEED * aiState.moveSpeedScale * this.profile.enemyMoveSpeedMult * LIGHTSPEED_FACTOR;
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
    if (dist <= this.scaleRange(TOWER_FIRE_RANGE) && aiState.fireCooldown <= 0) {
      sim.spawnBullet(entity, entity.id, entity.aimAngle);
      aiState.fireCooldown = this.scaleCooldown(TOWER_FIRE_COOLDOWN_TICKS);
    }
  }

  private updateMissileTower(entity: Entity, aiState: AIState, sim: Simulation): void {
    entity.vel = { x: 0, y: 0 };

    // Continue an active burst
    if (aiState.burstRemaining > 0) {
      entity.aimAngle = aiState.burstAimAngle;
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

    // Always track aim angle toward nearest target (for client rendering)
    entity.aimAngle = Math.atan2(dy, dx);

    if (dist <= this.scaleRange(MISSILE_TOWER_FIRE_RANGE) && aiState.fireCooldown <= 0) {
      const aimAngle = entity.aimAngle;
      sim.spawnMissile(entity, entity.id, aimAngle);
      aiState.burstRemaining = this.missileBurstSize() - 1;
      aiState.burstCooldown = MISSILE_BURST_DELAY_TICKS;
      aiState.burstAimAngle = aimAngle;
      aiState.fireCooldown = this.scaleCooldown(MISSILE_TOWER_FIRE_COOLDOWN_TICKS);
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
      if (other.kind === "grenade") continue;
      if (other.kind === "mine") continue;
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

    if (distPlayerToMs > PHANTOM_GUARD_RADIUS * this.profile.enemyAggroMult) {
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
    const phantomRange = this.scaleRange(PHANTOM_FIRE_RANGE);
    if (distToTarget <= phantomRange) {
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
      this.phantomThrustTo(entity, aiState, flankX, flankY, PHANTOM_SPEED * this.profile.enemyMoveSpeedMult);
    } else {
      // Advance the orbit angle each tick to strafe around the player
      aiState.phantomOrbitAngle += PHANTOM_CHASE_ORBIT_SPEED * this.dt;
      const orbitX = target.pos.x + Math.cos(aiState.phantomOrbitAngle) * PHANTOM_CHASE_ORBIT_RADIUS;
      const orbitY = target.pos.y + Math.sin(aiState.phantomOrbitAngle) * PHANTOM_CHASE_ORBIT_RADIUS;
      this.phantomThrustTo(entity, aiState, orbitX, orbitY, PHANTOM_SPEED * this.profile.enemyMoveSpeedMult);
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
    if (distToTarget <= phantomRange && aiState.fireCooldown <= 0 && aiState.burstRemaining === 0) {
      this.phantomStartBurst(entity, aiState, target, sim);
      aiState.fireCooldown = this.scaleCooldown(PHANTOM_FIRE_COOLDOWN_TICKS);
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
        this.phantomThrustTo(entity, aiState, msPos.x, msPos.y, PHANTOM_SPEED * this.profile.enemyMoveSpeedMult);
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
    this.phantomThrustTo(entity, aiState, targetX, targetY, PHANTOM_SPEED * this.profile.enemyMoveSpeedMult * 0.5);
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
    entity.vel.x += nx * PHANTOM_ACCEL * this.profile.enemyAccelMult * this.dt;
    entity.vel.y += ny * PHANTOM_ACCEL * this.profile.enemyAccelMult * this.dt;

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

  // ---------------------------------------------------------------------------
  // Dreadnought AI — slow capital ship that hunts players, lays mines, has
  // 4 arc-limited turrets and a devastating big cannon
  // ---------------------------------------------------------------------------

  private updateDreadnought(entity: Entity, aiState: AIState, sim: Simulation): void {
    const dt = this.dt;
    // Prefer assigned player (hard mode per-player targeting), fallback to nearest
    let target: Entity | null = null;
    if (aiState.assignedPlayerId) {
      const assigned = sim.entities.get(aiState.assignedPlayerId);
      if (assigned && assigned.hp > 0 && assigned.kind === "player_ship") {
        target = assigned;
      }
    }
    if (!target) {
      target = this.findNearestPlayer(entity, sim);
    }

    // --- 1. Chase nearest player ---
    if (target) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > DREADNOUGHT_RADIUS + 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        entity.vel.x += nx * DREADNOUGHT_ACCEL * dt;
        entity.vel.y += ny * DREADNOUGHT_ACCEL * dt;
      }
    } else {
      // No target: brake to a stop
      entity.vel.x *= DREADNOUGHT_BRAKE_FRICTION;
      entity.vel.y *= DREADNOUGHT_BRAKE_FRICTION;
    }

    // Clamp to max speed
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > DREADNOUGHT_SPEED) {
      entity.vel.x = (entity.vel.x / speed) * DREADNOUGHT_SPEED;
      entity.vel.y = (entity.vel.y / speed) * DREADNOUGHT_SPEED;
    }

    // Integrate position
    entity.pos.x += entity.vel.x * dt;
    entity.pos.y += entity.vel.y * dt;
    entity.pos.x = Math.max(DREADNOUGHT_RADIUS, Math.min(WORLD_WIDTH - DREADNOUGHT_RADIUS, entity.pos.x));
    entity.pos.y = Math.max(DREADNOUGHT_RADIUS, Math.min(WORLD_HEIGHT - DREADNOUGHT_RADIUS, entity.pos.y));

    // --- 2. Track travel direction (used by big cannon predictive aim) ---
    if (speed > 5) {
      entity.aimAngle = Math.atan2(entity.vel.y, entity.vel.x);
    }

    // --- 3. Auto Turrets ---
    this.updateDreadnoughtTurrets(entity, aiState, sim);

    // --- 4. Big Cannon ---
    if (aiState.bigCannonCooldown > 0) {
      aiState.bigCannonCooldown--;
    }
    if (target && aiState.bigCannonCooldown <= 0) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= DREADNOUGHT_BIG_CANNON_RANGE) {
        // Predictive aim for the slow projectile
        const travelTime = dist / DREADNOUGHT_BIG_CANNON_SPEED;
        const predX = target.pos.x + target.vel.x * travelTime;
        const predY = target.pos.y + target.vel.y * travelTime;
        const aimAngle = Math.atan2(predY - entity.pos.y, predX - entity.pos.x);
        sim.spawnBigCannon(entity, entity.id, aimAngle);
        aiState.bigCannonCooldown = DREADNOUGHT_BIG_CANNON_COOLDOWN;
      }
    }

    // --- 5. Lay mines while moving ---
    if (aiState.mineLayCooldown > 0) {
      aiState.mineLayCooldown--;
    }
    if (speed > 10 && aiState.mineLayCooldown <= 0) {
      sim.spawnMine(entity, entity.id);
      aiState.mineLayCooldown = MINE_LAY_INTERVAL_TICKS;
    }
  }

  private updateDreadnoughtTurrets(entity: Entity, aiState: AIState, sim: Simulation): void {
    const players = this.getPlayersInRange(entity, sim, DREADNOUGHT_TURRET_FIRE_RANGE);

    for (let t = 0; t < DREADNOUGHT_TURRET_COUNT; t++) {
      if (aiState.turretCooldowns[t] > 0) {
        aiState.turretCooldowns[t]--;
        continue;
      }

      // Turret angle is absolute (ship sprite does not rotate)
      const turretWorldAngle = DREADNOUGHT_TURRET_BASE_ANGLES[t];

      // Find the closest player within this turret's arc
      let bestTarget: Entity | null = null;
      let bestDistSq = Infinity;

      for (const player of players) {
        const dx = player.pos.x - entity.pos.x;
        const dy = player.pos.y - entity.pos.y;
        const distSq = dx * dx + dy * dy;
        const angleToPlayer = Math.atan2(dy, dx);

        // Check if player is within this turret's arc
        let angleDiff = angleToPlayer - turretWorldAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= DREADNOUGHT_TURRET_ARC / 2 && distSq < bestDistSq) {
          bestDistSq = distSq;
          bestTarget = player;
        }
      }

      if (bestTarget) {
        const dx = bestTarget.pos.x - entity.pos.x;
        const dy = bestTarget.pos.y - entity.pos.y;
        const aimAngle = Math.atan2(dy, dx);

        // Spawn bullet from turret offset position
        const turretX = entity.pos.x + Math.cos(turretWorldAngle) * DREADNOUGHT_TURRET_OFFSET;
        const turretY = entity.pos.y + Math.sin(turretWorldAngle) * DREADNOUGHT_TURRET_OFFSET;

        const turretGhost: Entity = {
          id: entity.id,
          kind: "bullet", // small radius so bullet spawns close to turret mount point
          pos: { x: turretX, y: turretY },
          vel: entity.vel,
          hp: entity.hp,
          team: entity.team,
          ownerKind: "dreadnought_turret",
        };
        sim.spawnBullet(turretGhost, entity.id, aimAngle);
        aiState.turretCooldowns[t] = DREADNOUGHT_TURRET_FIRE_COOLDOWN;
      }
    }
  }

  /** Find nearest player_ship specifically (not any enemy — dreadnought hunts humans) */
  private findNearestPlayer(entity: Entity, sim: Simulation): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;
    for (const other of sim.entities.values()) {
      if (other.kind !== "player_ship") continue;
      if (other.team === entity.team) continue;
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
  // Grenader AI — keeps distance and lobs predictive grenades
  // ---------------------------------------------------------------------------

  private updateGrenader(entity: Entity, aiState: AIState, sim: Simulation): void {
    const dt = this.dt;
    const target = this.findNearestPlayer(entity, sim);

    if (target) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;

      const keepDist = GRENADER_KEEP_DISTANCE * this.profile.enemyAggroMult;

      if (dist > keepDist + 50) {
        // Too far — approach
        entity.vel.x += nx * GRENADER_ACCEL * this.profile.enemyAccelMult * dt;
        entity.vel.y += ny * GRENADER_ACCEL * this.profile.enemyAccelMult * dt;
      } else if (dist < keepDist - 50) {
        // Too close — back away
        entity.vel.x -= nx * GRENADER_ACCEL * this.profile.enemyAccelMult * dt;
        entity.vel.y -= ny * GRENADER_ACCEL * this.profile.enemyAccelMult * dt;
      } else {
        // At preferred distance — strafe perpendicular
        const px = -ny;
        const py = nx;
        const strafe = Math.sin((sim.tick / TICK_RATE) * aiState.strafeFrequency + aiState.strafePhase);
        entity.vel.x += px * strafe * GRENADER_ACCEL * this.profile.enemyAccelMult * dt * 0.5;
        entity.vel.y += py * strafe * GRENADER_ACCEL * this.profile.enemyAccelMult * dt * 0.5;
      }

      // Fire grenade if in range and cooldown ready
      const grenaderRange = this.scaleRange(GRENADER_FIRE_RANGE);
      if (dist <= grenaderRange && aiState.fireCooldown <= 0) {
        // Predictive aim — calculate where player will be when grenade arrives
        const travelTime = dist / GRENADE_SPEED;
        const predX = target.pos.x + target.vel.x * travelTime;
        const predY = target.pos.y + target.vel.y * travelTime;
        const aimAngle = Math.atan2(predY - entity.pos.y, predX - entity.pos.x);
        sim.spawnGrenade(entity, entity.id, aimAngle, { x: predX, y: predY });
        aiState.fireCooldown = this.scaleCooldown(GRENADER_FIRE_COOLDOWN);
      }
    } else {
      // No target — brake
      entity.vel.x *= GRENADER_BRAKE_FRICTION;
      entity.vel.y *= GRENADER_BRAKE_FRICTION;
    }

    // Clamp to max speed
    const maxSpeed = GRENADER_SPEED * aiState.moveSpeedScale * this.profile.enemyMoveSpeedMult;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    if (speed > maxSpeed) {
      entity.vel.x = (entity.vel.x / speed) * maxSpeed;
      entity.vel.y = (entity.vel.y / speed) * maxSpeed;
    }

    // Integrate position
    entity.pos.x += entity.vel.x * dt;
    entity.pos.y += entity.vel.y * dt;
    entity.pos.x = Math.max(GRENADER_RADIUS, Math.min(WORLD_WIDTH - GRENADER_RADIUS, entity.pos.x));
    entity.pos.y = Math.max(GRENADER_RADIUS, Math.min(WORLD_HEIGHT - GRENADER_RADIUS, entity.pos.y));

    // Track facing direction for rendering
    if (speed > 5) {
      entity.aimAngle = Math.atan2(entity.vel.y, entity.vel.x);
    }
  }

  // ---------------------------------------------------------------------------
  // Interceptor — bullet-dodging hunter that targets assigned players
  // ---------------------------------------------------------------------------

  private updateInterceptor(entity: Entity, aiState: AIState, sim: Simulation): void {
    const dt = this.dt;

    // --- Burst fire (non-blocking, keeps moving during burst) ---
    if (aiState.burstRemaining > 0) {
      if (aiState.burstCooldown <= 0) {
        const burstTarget = aiState.burstTargetId ? sim.entities.get(aiState.burstTargetId) : null;
        let baseAngle = aiState.burstAimAngle;
        if (burstTarget && burstTarget.hp > 0) {
          const btDx = burstTarget.pos.x - entity.pos.x;
          const btDy = burstTarget.pos.y - entity.pos.y;
          const btDist = Math.sqrt(btDx * btDx + btDy * btDy) || 1;
          const btTravel = btDist / BULLET_SPEED;
          const btPredX = burstTarget.pos.x + burstTarget.vel.x * btTravel;
          const btPredY = burstTarget.pos.y + burstTarget.vel.y * btTravel;
          baseAngle = Math.atan2(btPredY - entity.pos.y, btPredX - entity.pos.x);
        }
        // Fan spread: center(0), left(-spread), right(+spread)
        const shotIndex = INTERCEPTOR_BURST_SIZE - aiState.burstRemaining;
        const spreadOffsets = [0, -INTERCEPTOR_BURST_SPREAD, INTERCEPTOR_BURST_SPREAD];
        const offset = spreadOffsets[shotIndex % spreadOffsets.length];
        sim.spawnBullet(entity, entity.id, baseAngle + offset);
        aiState.burstRemaining--;
        aiState.burstCooldown = INTERCEPTOR_BURST_DELAY_TICKS;
      } else {
        aiState.burstCooldown--;
      }
    }

    // --- Target selection: prefer assigned player ---
    let target: Entity | null = null;
    if (aiState.assignedPlayerId) {
      const assigned = sim.entities.get(aiState.assignedPlayerId);
      if (assigned && assigned.hp > 0 && assigned.kind === "player_ship") {
        target = assigned;
      }
    }
    if (!target) {
      target = this.findNearestPlayer(entity, sim);
    }

    if (!target) {
      // No targets — brake to stop
      entity.vel.x *= INTERCEPTOR_BRAKE_FRICTION;
      entity.vel.y *= INTERCEPTOR_BRAKE_FRICTION;
      entity.pos.x += entity.vel.x * dt;
      entity.pos.y += entity.vel.y * dt;
      return;
    }

    // --- Distance to target ---
    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const interceptorRange = this.scaleRange(INTERCEPTOR_FIRE_RANGE);

    // --- Movement: chase or orbit ---
    if (dist > interceptorRange) {
      // Chase: thrust directly toward target
      if (dist > 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        entity.vel.x += nx * INTERCEPTOR_ACCEL * this.profile.enemyAccelMult * dt;
        entity.vel.y += ny * INTERCEPTOR_ACCEL * this.profile.enemyAccelMult * dt;
      }
      aiState.aiMode = "patrol"; // reset so orbit angle syncs on re-engage
    } else {
      // Engage: orbit the target
      if (aiState.aiMode !== "chase") {
        aiState.phantomOrbitAngle = Math.atan2(entity.pos.y - target.pos.y, entity.pos.x - target.pos.x);
      }
      aiState.aiMode = "chase";
      aiState.phantomOrbitAngle += INTERCEPTOR_ORBIT_SPEED * dt;
      const orbitX = target.pos.x + Math.cos(aiState.phantomOrbitAngle) * INTERCEPTOR_ORBIT_RADIUS;
      const orbitY = target.pos.y + Math.sin(aiState.phantomOrbitAngle) * INTERCEPTOR_ORBIT_RADIUS;
      const odx = orbitX - entity.pos.x;
      const ody = orbitY - entity.pos.y;
      const odist = Math.sqrt(odx * odx + ody * ody);
      if (odist > 5) {
        entity.vel.x += (odx / odist) * INTERCEPTOR_ACCEL * this.profile.enemyAccelMult * dt;
        entity.vel.y += (ody / odist) * INTERCEPTOR_ACCEL * this.profile.enemyAccelMult * dt;
      }
    }

    // --- Bullet dodging ---
    this.interceptorDodge(entity, sim);

    // --- Clamp to max speed (allow 20% overspeed for dodge responsiveness) ---
    const maxSpeed = INTERCEPTOR_SPEED * aiState.moveSpeedScale * this.profile.enemyMoveSpeedMult;
    const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
    const cap = maxSpeed * 1.2;
    if (speed > cap) {
      entity.vel.x = (entity.vel.x / speed) * cap;
      entity.vel.y = (entity.vel.y / speed) * cap;
    }

    // --- Integrate position ---
    entity.pos.x += entity.vel.x * dt;
    entity.pos.y += entity.vel.y * dt;
    entity.pos.x = Math.max(INTERCEPTOR_RADIUS, Math.min(WORLD_WIDTH - INTERCEPTOR_RADIUS, entity.pos.x));
    entity.pos.y = Math.max(INTERCEPTOR_RADIUS, Math.min(WORLD_HEIGHT - INTERCEPTOR_RADIUS, entity.pos.y));

    // --- Track facing direction ---
    if (speed > 5) {
      entity.aimAngle = Math.atan2(entity.vel.y, entity.vel.x);
    }

    // --- Fire burst ---
    if (dist <= interceptorRange && aiState.fireCooldown <= 0 && aiState.burstRemaining === 0) {
      this.interceptorStartBurst(entity, aiState, target, sim);
      aiState.fireCooldown = this.scaleCooldown(INTERCEPTOR_FIRE_COOLDOWN);
    }
  }

  private interceptorDodge(entity: Entity, sim: Simulation): void {
    let dodgeX = 0;
    let dodgeY = 0;

    for (const [bulletId, bulletState] of sim.bullets) {
      const bullet = sim.entities.get(bulletId);
      if (!bullet || bullet.team === entity.team) continue;

      const dx = entity.pos.x - bullet.pos.x;
      const dy = entity.pos.y - bullet.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > INTERCEPTOR_DODGE_SCAN_RADIUS) continue;

      const bSpeed = Math.sqrt(bullet.vel.x * bullet.vel.x + bullet.vel.y * bullet.vel.y);
      if (bSpeed < 1) continue;

      const bDirX = bullet.vel.x / bSpeed;
      const bDirY = bullet.vel.y / bSpeed;

      // Dot product: is the bullet heading toward us?
      const dot = dx * bDirX + dy * bDirY;
      if (dot < 0) continue; // heading away

      // Perpendicular distance from bullet path
      const cross = dx * bDirY - dy * bDirX;
      const perpDist = Math.abs(cross);

      const dodgeThreshold = INTERCEPTOR_RADIUS + BULLET_RADIUS + 15;
      if (perpDist > dodgeThreshold) continue;

      // Time until closest approach
      const timeToImpact = dot / bSpeed;
      if (timeToImpact > INTERCEPTOR_DODGE_LOOKAHEAD_S) continue;

      // Dodge perpendicular to bullet, on the side we're already on
      const dodgeDir = cross >= 0 ? 1 : -1;
      const perpX = -bDirY * dodgeDir;
      const perpY = bDirX * dodgeDir;

      const urgency = 1 - (timeToImpact / INTERCEPTOR_DODGE_LOOKAHEAD_S);
      dodgeX += perpX * urgency;
      dodgeY += perpY * urgency;
    }

    const mag = Math.sqrt(dodgeX * dodgeX + dodgeY * dodgeY);
    if (mag > 0.01) {
      entity.vel.x += (dodgeX / mag) * INTERCEPTOR_DODGE_IMPULSE * this.dt;
      entity.vel.y += (dodgeY / mag) * INTERCEPTOR_DODGE_IMPULSE * this.dt;
    }
  }

  private interceptorStartBurst(entity: Entity, aiState: AIState, target: Entity, _sim: Simulation): void {
    aiState.burstTargetId = target.id;
    aiState.burstRemaining = INTERCEPTOR_BURST_SIZE - 1;
    aiState.burstCooldown = INTERCEPTOR_BURST_DELAY_TICKS;

    // Fire first bullet (center shot) with predictive aim
    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const travelTime = dist / BULLET_SPEED;
    const predictedX = target.pos.x + target.vel.x * travelTime;
    const predictedY = target.pos.y + target.vel.y * travelTime;
    const baseAngle = Math.atan2(predictedY - entity.pos.y, predictedX - entity.pos.x);
    aiState.burstAimAngle = baseAngle;

    _sim.spawnBullet(entity, entity.id, baseAngle);
  }

  // ---------------------------------------------------------------------------
  // Interceptor player assignment — assigns one interceptor per player
  // ---------------------------------------------------------------------------

  assignInterceptorTargets(sim: Simulation): void {
    const alivePlayers: Entity[] = [];
    for (const e of sim.entities.values()) {
      if (e.kind === "player_ship" && e.hp > 0) alivePlayers.push(e);
    }

    const interceptorStates: AIState[] = [];
    for (const [entityId, aiState] of this.aiStates) {
      const entity = sim.entities.get(entityId);
      if (entity && entity.kind === "interceptor" && entity.hp > 0) {
        interceptorStates.push(aiState);
      }
    }

    if (alivePlayers.length === 0) {
      for (const s of interceptorStates) s.assignedPlayerId = null;
      return;
    }

    // Track which players already have an interceptor assigned
    const assignedPlayerIds = new Set<string>();

    // Keep existing valid assignments — only clear if assigned player is dead
    for (const s of interceptorStates) {
      if (s.assignedPlayerId) {
        const assigned = sim.entities.get(s.assignedPlayerId);
        if (assigned && assigned.hp > 0 && assigned.kind === "player_ship") {
          assignedPlayerIds.add(s.assignedPlayerId);
          continue; // keep this assignment
        }
      }
      s.assignedPlayerId = null; // clear invalid assignment
    }

    // Assign unassigned interceptors to players with fewest interceptors
    const unassigned = interceptorStates.filter((s) => s.assignedPlayerId === null);
    for (const s of unassigned) {
      // Pick the player with the fewest interceptors currently assigned
      let bestPlayer: Entity | null = null;
      let bestCount = Infinity;
      for (const p of alivePlayers) {
        const count = interceptorStates.filter((is) => is.assignedPlayerId === p.id).length;
        if (count < bestCount) {
          bestCount = count;
          bestPlayer = p;
        }
      }
      if (bestPlayer) {
        s.assignedPlayerId = bestPlayer.id;
        assignedPlayerIds.add(bestPlayer.id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dreadnought player assignment — assigns one dreadnought per player
  // ---------------------------------------------------------------------------

  assignDreadnoughtTargets(sim: Simulation): void {
    // Collect alive players and alive dreadnoughts
    const alivePlayers: Entity[] = [];
    for (const e of sim.entities.values()) {
      if (e.kind === "player_ship" && e.hp > 0) alivePlayers.push(e);
    }

    const dreadnoughtStates: AIState[] = [];
    for (const [entityId, aiState] of this.aiStates) {
      const entity = sim.entities.get(entityId);
      if (entity && entity.kind === "dreadnought" && entity.hp > 0) {
        dreadnoughtStates.push(aiState);
      }
    }

    if (alivePlayers.length === 0) {
      // No players — clear all assignments
      for (const ds of dreadnoughtStates) ds.assignedPlayerId = null;
      return;
    }

    // Round-robin assign players to dreadnoughts
    for (let i = 0; i < dreadnoughtStates.length; i++) {
      const playerIdx = i % alivePlayers.length;
      dreadnoughtStates[i].assignedPlayerId = alivePlayers[playerIdx].id;
    }
  }

  /** Get all alive players within range of an entity */
  private getPlayersInRange(entity: Entity, sim: Simulation, range: number): Entity[] {
    const rangeSq = range * range;
    const result: Entity[] = [];
    for (const other of sim.entities.values()) {
      if (other.kind !== "player_ship") continue;
      if (other.hp <= 0) continue;
      const dx = other.pos.x - entity.pos.x;
      const dy = other.pos.y - entity.pos.y;
      if (dx * dx + dy * dy <= rangeSq) {
        result.push(other);
      }
    }
    return result;
  }
}
