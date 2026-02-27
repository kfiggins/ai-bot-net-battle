import { v4 as uuid } from "uuid";
import {
  Entity,
  EntityKind,
  Upgrades,
  PlayerInputData,
  TICK_RATE,
  PLAYER_MAX_SPEED,
  PLAYER_ACCEL,
  PLAYER_BRAKE_FRICTION,
  PLAYER_HP,
  PLAYER_RADIUS,
  BULLET_SPEED,
  BULLET_HP,
  BULLET_RADIUS,
  BULLET_TTL_TICKS,
  BULLET_DAMAGE,
  FIRE_COOLDOWN_TICKS,
  MINION_HP,
  MINION_RADIUS,
  TOWER_HP,
  TOWER_RADIUS,
  MISSILE_TOWER_HP,
  MISSILE_TOWER_RADIUS,
  MISSILE_SPEED,
  MISSILE_HP,
  MISSILE_RADIUS,
  MISSILE_TTL_TICKS,
  MISSILE_DAMAGE,
  MISSILE_TURN_RATE,
  MOTHERSHIP_RADIUS,
  ENEMY_TEAM,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BULLET_MAX_RANGE,
  ORB_RADIUS,
  ORB_XP_VALUE,
  MINION_KILL_XP,
  TOWER_KILL_XP,
  ORB_SPAWN_INTERVAL_TICKS,
  ORB_MAX_ON_MAP,
  ORB_SPAWN_PADDING,
  ORB_INITIAL_COUNT,
  MINION_ORB_RESOURCE,
  MAX_LEVEL,
  xpForLevel,
  MAX_UPGRADE_PER_STAT,
  DAMAGE_PER_UPGRADE,
  SPEED_PER_UPGRADE,
  HEALTH_PER_UPGRADE,
  FIRE_RATE_PER_UPGRADE,
  CANNON_MILESTONES,
  CANNON_SPREAD_ANGLE,
  UpgradeType,
  MILESTONE_LEVELS,
  NEMESIS_RADIUS,
  NEMESIS_KILL_XP,
  PHANTOM_HP,
  PHANTOM_RADIUS,
  PHANTOM_KILL_XP,
  BODY_COLLISION_DAMAGE,
  NEMESIS_BODY_COLLISION_DAMAGE,
  BODY_COLLISION_COOLDOWN_TICKS,
  BULLET_RECOIL_FORCE,
  RECOIL_REDUCTION_PER_SPEED_UPGRADE,
  ACCEL_PER_SPEED_UPGRADE,
  CANNON_OFFSET_LATERAL,
} from "shared";

export interface PlayerState {
  id: string;
  entityId: string;
  input: PlayerInputData;
  fireCooldown: number;
  label?: string;
  playerIndex?: number;
  // XP & leveling
  xp: number;
  level: number;
  xpToNext: number;
  // Upgrades
  upgrades: Upgrades;
  cannons: number;
  pendingUpgrades: number;
}

export interface BulletState {
  entityId: string;
  ownerId: string;
  ttl: number;
  originPos: { x: number; y: number };
  damage: number;
}

export interface MissileState {
  entityId: string;
  ownerId: string;
  ttl: number;
}

export class Simulation {
  tick = 0;
  entities: Map<string, Entity> = new Map();
  players: Map<string, PlayerState> = new Map();
  bullets: Map<string, BulletState> = new Map();
  missiles: Map<string, MissileState> = new Map();
  private orbSpawnCooldown = ORB_SPAWN_INTERVAL_TICKS;
  pendingEnemyResources = 0;
  // playerId → enemyEntityId → ticksRemaining immunity
  private bodyCollisionCooldowns: Map<string, Map<string, number>> = new Map();

  private dt = 1 / TICK_RATE;

  addPlayer(playerId: string, label?: string, playerIndex?: number): Entity {
    const entityId = uuid();
    const entity: Entity = {
      id: entityId,
      kind: "player_ship",
      pos: playerSpawnPosition(),
      vel: { x: 0, y: 0 },
      hp: PLAYER_HP,
      team: 1,
      label,
      playerIndex,
    };
    this.entities.set(entityId, entity);
    this.players.set(playerId, {
      id: playerId,
      entityId,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: false,
        aimAngle: 0,
      },
      fireCooldown: 0,
      label,
      playerIndex,
      xp: 0,
      level: 1,
      xpToNext: xpForLevel(1),
      upgrades: { damage: 0, speed: 0, health: 0, fire_rate: 0 },
      cannons: 1,
      pendingUpgrades: 0,
    });
    return entity;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      this.entities.delete(player.entityId);
      this.players.delete(playerId);
    }
  }

  setInput(playerId: string, input: PlayerInputData): void {
    const player = this.players.get(playerId);
    if (player) {
      player.input = input;
    }
  }

  spawnEnemy(kind: "minion_ship" | "tower" | "missile_tower" | "phantom_ship", x: number, y: number): Entity {
    const entityId = uuid();
    const hp =
      kind === "minion_ship" ? MINION_HP :
      kind === "phantom_ship" ? PHANTOM_HP :
      kind === "missile_tower" ? MISSILE_TOWER_HP :
      TOWER_HP;
    const entity: Entity = {
      id: entityId,
      kind,
      pos: { x, y },
      vel: { x: 0, y: 0 },
      hp,
      team: ENEMY_TEAM,
    };
    this.entities.set(entityId, entity);
    return entity;
  }

  getEntitiesByKind(kind: EntityKind): Entity[] {
    return Array.from(this.entities.values()).filter((e) => e.kind === kind);
  }

  getEntitiesByTeam(team: number): Entity[] {
    return Array.from(this.entities.values()).filter((e) => e.team === team);
  }

  update(): void {
    this.tick++;
    this.spawnOrbs();
    this.updatePlayers();
    this.updateBullets();
    this.updateMissiles();
    this.checkCollisions();
    this.updateBodyCollisionCooldowns();
    this.checkBodyCollisions();
    this.checkOrbPickups();
    this.removeDeadEntities();
    this.respawnDeadPlayers();
  }

  private spawnOrbs(): void {
    this.orbSpawnCooldown--;
    if (this.orbSpawnCooldown > 0) return;
    this.orbSpawnCooldown = ORB_SPAWN_INTERVAL_TICKS;
    if (this.tick % 300 === 0) {
      const orbCount = Array.from(this.entities.values()).filter(e => e.kind === "energy_orb").length;
      console.log(`[orb-debug] tick=${this.tick} orbCount=${orbCount} entities=${this.entities.size}`);
    }

    // Count current orbs
    let orbCount = 0;
    for (const e of this.entities.values()) {
      if (e.kind === "energy_orb") orbCount++;
    }
    if (orbCount >= ORB_MAX_ON_MAP) return;

    const x = ORB_SPAWN_PADDING + Math.random() * (WORLD_WIDTH - 2 * ORB_SPAWN_PADDING);
    const y = ORB_SPAWN_PADDING + Math.random() * (WORLD_HEIGHT - 2 * ORB_SPAWN_PADDING);

    const entityId = uuid();
    this.entities.set(entityId, {
      id: entityId,
      kind: "energy_orb",
      pos: { x, y },
      vel: { x: 0, y: 0 },
      hp: 1,
      team: 0, // neutral
    });
  }

  initOrbs(count: number = ORB_INITIAL_COUNT): void {
    for (let i = 0; i < count; i++) {
      const entityId = uuid();
      this.entities.set(entityId, {
        id: entityId,
        kind: "energy_orb",
        pos: {
          x: ORB_SPAWN_PADDING + Math.random() * (WORLD_WIDTH - 2 * ORB_SPAWN_PADDING),
          y: ORB_SPAWN_PADDING + Math.random() * (WORLD_HEIGHT - 2 * ORB_SPAWN_PADDING),
        },
        vel: { x: 0, y: 0 },
        hp: 1,
        team: 0,
      });
    }
  }

  collectOrbForEnemy(orbId: string): void {
    const orb = this.entities.get(orbId);
    if (!orb || orb.kind !== "energy_orb" || orb.hp <= 0) return;
    orb.hp = 0;
    this.pendingEnemyResources += MINION_ORB_RESOURCE;
  }

  private checkOrbPickups(): void {
    for (const player of this.players.values()) {
      const entity = this.entities.get(player.entityId);
      if (!entity || entity.hp <= 0) continue;
      if (player.level >= MAX_LEVEL) continue;

      for (const [orbId, orb] of this.entities) {
        if (orb.kind !== "energy_orb" || orb.hp <= 0) continue;

        if (circlesOverlap(entity.pos, PLAYER_RADIUS, orb.pos, ORB_RADIUS)) {
          orb.hp = 0; // mark for removal
          this.awardXP(player, ORB_XP_VALUE);
        }
      }
    }
  }

  awardXP(player: PlayerState, amount: number): void {
    if (player.level >= MAX_LEVEL) return;

    player.xp += amount;
    while (player.xp >= player.xpToNext && player.level < MAX_LEVEL) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = xpForLevel(player.level);

      // Cannon milestone: auto-apply, no choice needed
      if (CANNON_MILESTONES[player.level] !== undefined) {
        player.cannons = CANNON_MILESTONES[player.level];
      } else {
        // Regular level-up: give a pending stat upgrade point
        player.pendingUpgrades++;
      }

      // Heal to new max HP on level up
      const maxHp = getEffectiveMaxHp(player);
      const entity = this.entities.get(player.entityId);
      if (entity) {
        entity.hp = maxHp;
      }
    }

    // Cap XP at max level
    if (player.level >= MAX_LEVEL) {
      player.xp = 0;
      player.xpToNext = 0;
    }
  }

  applyUpgrade(playerId: string, stat: UpgradeType): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (player.pendingUpgrades <= 0) return false;
    if (player.upgrades[stat] >= MAX_UPGRADE_PER_STAT) return false;

    player.upgrades[stat]++;
    player.pendingUpgrades--;

    // If health was upgraded, heal to new max HP
    if (stat === "health") {
      const entity = this.entities.get(player.entityId);
      if (entity) {
        entity.hp = getEffectiveMaxHp(player);
      }
    }

    return true;
  }

  private respawnDeadPlayers(): void {
    for (const player of this.players.values()) {
      if (this.entities.has(player.entityId)) continue;

      // Player entity was removed (died) — respawn with reset
      const pos = playerSpawnPosition();
      const entity: Entity = {
        id: player.entityId, // reuse same entity ID so client tracks it
        kind: "player_ship",
        pos,
        vel: { x: 0, y: 0 },
        hp: PLAYER_HP,
        team: 1,
        label: player.label,
        playerIndex: player.playerIndex,
      };
      this.entities.set(entity.id, entity);

      // Reset XP, level, and upgrades
      player.xp = 0;
      player.level = 1;
      player.xpToNext = xpForLevel(1);
      player.fireCooldown = 0;
      player.upgrades = { damage: 0, speed: 0, health: 0, fire_rate: 0 };
      player.cannons = 1;
      player.pendingUpgrades = 0;
      // entity.vel already reset to {0,0} at respawn entity creation above
    }
  }

  private updatePlayers(): void {
    for (const player of this.players.values()) {
      const entity = this.entities.get(player.entityId);
      if (!entity) continue;

      const { input } = player;
      const effectiveMaxSpeed = PLAYER_MAX_SPEED + player.upgrades.speed * SPEED_PER_UPGRADE;
      const effectiveAccel = PLAYER_ACCEL + player.upgrades.speed * ACCEL_PER_SPEED_UPGRADE;
      const effectiveCooldown = Math.max(1, FIRE_COOLDOWN_TICKS - player.upgrades.fire_rate * FIRE_RATE_PER_UPGRADE);
      const effectiveDamage = BULLET_DAMAGE + player.upgrades.damage * DAMAGE_PER_UPGRADE;

      // Compute thrust direction from input
      let tx = 0;
      let ty = 0;
      if (input.up) ty -= 1;
      if (input.down) ty += 1;
      if (input.left) tx -= 1;
      if (input.right) tx += 1;

      const hasInput = tx !== 0 || ty !== 0;

      if (hasInput) {
        // Normalize thrust direction and apply acceleration
        const mag = Math.sqrt(tx * tx + ty * ty);
        tx /= mag;
        ty /= mag;
        entity.vel.x += tx * effectiveAccel * this.dt;
        entity.vel.y += ty * effectiveAccel * this.dt;

        // Clamp to max speed (recoil impulses applied later can exceed this)
        const speed = Math.sqrt(entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y);
        if (speed > effectiveMaxSpeed) {
          entity.vel.x = (entity.vel.x / speed) * effectiveMaxSpeed;
          entity.vel.y = (entity.vel.y / speed) * effectiveMaxSpeed;
        }
      } else {
        // No input — apply brake friction to decelerate
        entity.vel.x *= PLAYER_BRAKE_FRICTION;
        entity.vel.y *= PLAYER_BRAKE_FRICTION;
        if (Math.abs(entity.vel.x) < 0.1) entity.vel.x = 0;
        if (Math.abs(entity.vel.y) < 0.1) entity.vel.y = 0;
      }

      entity.pos.x += entity.vel.x * this.dt;
      entity.pos.y += entity.vel.y * this.dt;

      // Clamp to world bounds
      entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
      entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));

      // Handle firing
      if (player.fireCooldown > 0) {
        player.fireCooldown--;
      }
      if (input.fire && player.fireCooldown <= 0) {
        this.fireMultiCannon(entity, player.id, input.aimAngle, player.cannons, effectiveDamage, player.upgrades.speed);
        player.fireCooldown = effectiveCooldown;
      }
    }
  }

  private fireMultiCannon(owner: Entity, ownerId: string, aimAngle: number, cannons: number, damage: number, speedUpgrades: number = 0): void {
    const angles = getCannonAngles(aimAngle, cannons);
    const half = (cannons - 1) / 2;
    for (let i = 0; i < cannons; i++) {
      const lateralOffset = (i - half) * CANNON_OFFSET_LATERAL;
      this.spawnBullet(owner, ownerId, angles[i], damage, BULLET_SPEED, lateralOffset);
    }

    // Apply recoil impulse directly to entity velocity (opposite to aim direction).
    // Applied after the max-speed clamp so recoil can briefly push past max speed,
    // preserving the "boost by shooting backward" feel.
    const recoil = BULLET_RECOIL_FORCE * (1 - speedUpgrades * RECOIL_REDUCTION_PER_SPEED_UPGRADE);
    owner.vel.x -= Math.cos(aimAngle) * recoil;
    owner.vel.y -= Math.sin(aimAngle) * recoil;
  }

  spawnBullet(
    owner: Entity,
    ownerId: string,
    aimAngle: number,
    damage: number = BULLET_DAMAGE,
    speed: number = BULLET_SPEED,
    lateralOffset: number = 0
  ): Entity {
    const entityId = uuid();
    const vx = Math.cos(aimAngle) * speed;
    const vy = Math.sin(aimAngle) * speed;
    const ownerRadius = entityRadius(owner.kind);
    const perpAngle = aimAngle + Math.PI / 2;
    // Offset spawn position by owner velocity to compensate for client-side prediction.
    // The client renders the player ~1 tick ahead of the server snapshot, so without
    // this offset bullets appear to originate from behind the player when moving fast.
    const entity: Entity = {
      id: entityId,
      kind: "bullet",
      pos: {
        x: owner.pos.x + Math.cos(aimAngle) * (ownerRadius + BULLET_RADIUS + 2) + Math.cos(perpAngle) * lateralOffset + owner.vel.x * this.dt,
        y: owner.pos.y + Math.sin(aimAngle) * (ownerRadius + BULLET_RADIUS + 2) + Math.sin(perpAngle) * lateralOffset + owner.vel.y * this.dt,
      },
      vel: { x: vx, y: vy },
      hp: BULLET_HP,
      team: owner.team,
      ownerKind: owner.kind,
    };
    this.entities.set(entityId, entity);
    this.bullets.set(entityId, {
      entityId,
      ownerId,
      ttl: BULLET_TTL_TICKS,
      originPos: { x: entity.pos.x, y: entity.pos.y },
      damage,
    });
    return entity;
  }

  spawnMissile(owner: Entity, ownerId: string, aimAngle: number): Entity {
    const entityId = uuid();
    const vx = Math.cos(aimAngle) * MISSILE_SPEED;
    const vy = Math.sin(aimAngle) * MISSILE_SPEED;
    const ownerRadius = entityRadius(owner.kind);
    const entity: Entity = {
      id: entityId,
      kind: "missile",
      pos: {
        x: owner.pos.x + Math.cos(aimAngle) * (ownerRadius + MISSILE_RADIUS + 2),
        y: owner.pos.y + Math.sin(aimAngle) * (ownerRadius + MISSILE_RADIUS + 2),
      },
      vel: { x: vx, y: vy },
      hp: MISSILE_HP,
      team: owner.team,
    };
    this.entities.set(entityId, entity);
    this.missiles.set(entityId, { entityId, ownerId, ttl: MISSILE_TTL_TICKS });
    return entity;
  }

  private updateBullets(): void {
    for (const [entityId, bullet] of this.bullets) {
      const entity = this.entities.get(entityId);
      if (!entity) {
        this.bullets.delete(entityId);
        continue;
      }

      // Move bullet
      entity.pos.x += entity.vel.x * this.dt;
      entity.pos.y += entity.vel.y * this.dt;

      // Decrement TTL
      bullet.ttl--;

      // Check distance from origin (max range)
      const dx = entity.pos.x - bullet.originPos.x;
      const dy = entity.pos.y - bullet.originPos.y;
      const distSq = dx * dx + dy * dy;

      // Remove if max range exceeded, expired, or out of bounds
      if (
        distSq > BULLET_MAX_RANGE * BULLET_MAX_RANGE ||
        bullet.ttl <= 0 ||
        entity.pos.x < -BULLET_RADIUS ||
        entity.pos.x > WORLD_WIDTH + BULLET_RADIUS ||
        entity.pos.y < -BULLET_RADIUS ||
        entity.pos.y > WORLD_HEIGHT + BULLET_RADIUS
      ) {
        entity.hp = 0;
      }
    }
  }

  private updateMissiles(): void {
    for (const [entityId, missile] of this.missiles) {
      const entity = this.entities.get(entityId);
      if (!entity || entity.hp <= 0) {
        this.missiles.delete(entityId);
        continue;
      }

      // Steer toward nearest opposite-team non-projectile entity
      let nearest: Entity | null = null;
      let nearestDistSq = Infinity;
      for (const other of this.entities.values()) {
        if (other.team === entity.team) continue;
        if (other.kind === "bullet" || other.kind === "missile" || other.kind === "energy_orb") continue;
        if (other.hp <= 0) continue;
        const dx = other.pos.x - entity.pos.x;
        const dy = other.pos.y - entity.pos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = other;
        }
      }

      if (nearest) {
        const dx = nearest.pos.x - entity.pos.x;
        const dy = nearest.pos.y - entity.pos.y;
        const desiredAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(entity.vel.y, entity.vel.x);

        // Normalize angle diff to [-π, π]
        let angleDiff = desiredAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const maxTurn = MISSILE_TURN_RATE * this.dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        const newAngle = currentAngle + turn;
        entity.vel = {
          x: Math.cos(newAngle) * MISSILE_SPEED,
          y: Math.sin(newAngle) * MISSILE_SPEED,
        };
      }

      entity.pos.x += entity.vel.x * this.dt;
      entity.pos.y += entity.vel.y * this.dt;

      missile.ttl--;
      if (
        missile.ttl <= 0 ||
        entity.pos.x < -MISSILE_RADIUS ||
        entity.pos.x > WORLD_WIDTH + MISSILE_RADIUS ||
        entity.pos.y < -MISSILE_RADIUS ||
        entity.pos.y > WORLD_HEIGHT + MISSILE_RADIUS
      ) {
        entity.hp = 0;
      }
    }
  }

  checkCollisions(): void {
    // Bullets hit any opposite-team non-bullet, non-orb entity (including missiles)
    for (const [bulletId, bulletState] of this.bullets) {
      const bulletEntity = this.entities.get(bulletId);
      if (!bulletEntity || bulletEntity.hp <= 0) continue;

      for (const [entityId, target] of this.entities) {
        if (entityId === bulletId) continue;
        if (target.kind === "bullet" || target.kind === "energy_orb") continue;
        if (target.team === bulletEntity.team) continue;
        if (target.hp <= 0) continue;

        const targetRadius = entityRadius(target.kind);

        if (circlesOverlap(bulletEntity.pos, BULLET_RADIUS, target.pos, targetRadius)) {
          target.hp -= bulletState.damage;
          if (target.hp <= 0) this.awardKillXP(bulletState.ownerId, target.kind);
          bulletEntity.hp = 0;
          break;
        }
      }
    }

    // Missiles hit any opposite-team non-projectile, non-orb entity
    for (const [missileId, missileState] of this.missiles) {
      const missileEntity = this.entities.get(missileId);
      if (!missileEntity || missileEntity.hp <= 0) continue;

      for (const [entityId, target] of this.entities) {
        if (entityId === missileId) continue;
        if (target.kind === "bullet" || target.kind === "missile" || target.kind === "energy_orb") continue;
        if (target.team === missileEntity.team) continue;
        if (target.hp <= 0) continue;

        const targetRadius = entityRadius(target.kind);

        if (circlesOverlap(missileEntity.pos, MISSILE_RADIUS, target.pos, targetRadius)) {
          target.hp -= MISSILE_DAMAGE;
          if (target.hp <= 0) this.awardKillXP(missileState.ownerId, target.kind);
          missileEntity.hp = 0;
          break;
        }
      }
    }
  }

  private awardKillXP(ownerEntityId: string, killedKind: string): void {
    // Nemesis kill: award bonus XP to all players as a boss clear reward
    if (killedKind === "nemesis") {
      for (const player of this.players.values()) {
        this.awardXP(player, NEMESIS_KILL_XP);
      }
      return;
    }
    const xp =
      killedKind === "minion_ship" ? MINION_KILL_XP :
      killedKind === "phantom_ship" ? PHANTOM_KILL_XP :
      killedKind === "tower" || killedKind === "missile_tower" ? TOWER_KILL_XP :
      0;
    if (xp === 0) return;
    for (const player of this.players.values()) {
      if (player.id === ownerEntityId) {
        this.awardXP(player, xp);
        return;
      }
    }
  }

  private updateBodyCollisionCooldowns(): void {
    for (const [playerId, cooldowns] of this.bodyCollisionCooldowns) {
      for (const [enemyId, ticks] of cooldowns) {
        if (ticks <= 1) {
          cooldowns.delete(enemyId);
        } else {
          cooldowns.set(enemyId, ticks - 1);
        }
      }
      if (cooldowns.size === 0) {
        this.bodyCollisionCooldowns.delete(playerId);
      }
    }
  }

  private checkBodyCollisions(): void {
    const solidKinds = new Set(["mothership", "tower", "missile_tower", "minion_ship", "nemesis", "phantom_ship"]);

    for (const [playerId, player] of this.players) {
      const playerEntity = this.entities.get(player.entityId);
      if (!playerEntity || playerEntity.hp <= 0) continue;

      let cooldowns = this.bodyCollisionCooldowns.get(playerId);
      if (!cooldowns) {
        cooldowns = new Map();
        this.bodyCollisionCooldowns.set(playerId, cooldowns);
      }

      for (const [enemyId, enemy] of this.entities) {
        if (!solidKinds.has(enemy.kind)) continue;
        if (enemy.team === playerEntity.team) continue;
        if (enemy.hp <= 0) continue;

        const remaining = cooldowns.get(enemyId) ?? 0;
        if (remaining > 0) continue;

        const enemyRadius = entityRadius(enemy.kind);
        if (!circlesOverlap(playerEntity.pos, PLAYER_RADIUS, enemy.pos, enemyRadius)) continue;

        const damage = enemy.kind === "nemesis" ? NEMESIS_BODY_COLLISION_DAMAGE : BODY_COLLISION_DAMAGE;
        playerEntity.hp -= damage;
        cooldowns.set(enemyId, BODY_COLLISION_COOLDOWN_TICKS);
      }
    }
  }

  private removeDeadEntities(): void {
    for (const [id, entity] of this.entities) {
      if (entity.hp <= 0) {
        this.entities.delete(id);
        this.bullets.delete(id);
        this.missiles.delete(id);
      }
    }
  }

  getSnapshot(phaseInfo?: {
    current: number;
    objectives: string[];
    remaining: Record<string, number>;
    matchOver: boolean;
    mothershipShielded: boolean;
  }, botResources?: number) {
    // Build player ID→state lookup for snapshot enrichment
    const playerByEntityId = new Map<string, PlayerState>();
    for (const p of this.players.values()) {
      playerByEntityId.set(p.entityId, p);
    }

    const entities = Array.from(this.entities.values()).map((e) => {
      if (e.kind === "player_ship") {
        const ps = playerByEntityId.get(e.id);
        if (ps) {
          return {
            ...e,
            level: ps.level,
            xp: ps.xp,
            xpToNext: ps.xpToNext,
            upgrades: { ...ps.upgrades },
            cannons: ps.cannons,
            pendingUpgrades: ps.pendingUpgrades,
            aimAngle: ps.input.aimAngle,
          };
        }
      }
      return e;
    });

    return {
      v: 1 as const,
      type: "snapshot" as const,
      tick: this.tick,
      entities,
      phase: phaseInfo,
      botResources,
    };
  }
}

/** Spawn players in a ring 1500-1800px from map center */
function playerSpawnPosition(): { x: number; y: number } {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const angle = Math.random() * Math.PI * 2;
  const dist = 1500 + Math.random() * 300;
  return {
    x: Math.max(50, Math.min(WORLD_WIDTH - 50, cx + Math.cos(angle) * dist)),
    y: Math.max(50, Math.min(WORLD_HEIGHT - 50, cy + Math.sin(angle) * dist)),
  };
}

export function entityRadius(kind: string): number {
  switch (kind) {
    case "bullet":
      return BULLET_RADIUS;
    case "missile":
      return MISSILE_RADIUS;
    case "minion_ship":
      return MINION_RADIUS;
    case "tower":
      return TOWER_RADIUS;
    case "missile_tower":
      return MISSILE_TOWER_RADIUS;
    case "mothership":
      return MOTHERSHIP_RADIUS;
    case "nemesis":
      return NEMESIS_RADIUS;
    case "phantom_ship":
      return PHANTOM_RADIUS;
    case "energy_orb":
      return ORB_RADIUS;
    default:
      return PLAYER_RADIUS;
  }
}

export function getEffectiveMaxHp(player: PlayerState): number {
  return PLAYER_HP + player.upgrades.health * HEALTH_PER_UPGRADE;
}

export function getCannonAngles(aimAngle: number, cannons: number): number[] {
  if (cannons <= 1) return [aimAngle];
  const angles: number[] = [];
  // Center the spread around aimAngle
  const half = (cannons - 1) / 2;
  for (let i = 0; i < cannons; i++) {
    angles.push(aimAngle + (i - half) * CANNON_SPREAD_ANGLE);
  }
  return angles;
}

export function circlesOverlap(
  a: { x: number; y: number },
  ar: number,
  b: { x: number; y: number },
  br: number
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  const radSum = ar + br;
  return distSq <= radSum * radSum;
}
