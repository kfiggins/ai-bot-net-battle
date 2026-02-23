import { v4 as uuid } from "uuid";
import {
  Entity,
  EntityKind,
  PlayerInputData,
  TICK_RATE,
  PLAYER_SPEED,
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
  MOTHERSHIP_RADIUS,
  ENEMY_TEAM,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "shared";

export interface PlayerState {
  id: string;
  entityId: string;
  input: PlayerInputData;
  fireCooldown: number;
}

export interface BulletState {
  entityId: string;
  ownerId: string;
  ttl: number;
}

export class Simulation {
  tick = 0;
  entities: Map<string, Entity> = new Map();
  players: Map<string, PlayerState> = new Map();
  bullets: Map<string, BulletState> = new Map();

  private dt = 1 / TICK_RATE;

  addPlayer(playerId: string, label?: string, playerIndex?: number): Entity {
    const entityId = uuid();
    const entity: Entity = {
      id: entityId,
      kind: "player_ship",
      pos: {
        x: Math.random() * (WORLD_WIDTH - 100) + 50,
        y: Math.random() * (WORLD_HEIGHT - 100) + 50,
      },
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

  spawnEnemy(kind: "minion_ship" | "tower", x: number, y: number): Entity {
    const entityId = uuid();
    const hp = kind === "minion_ship" ? MINION_HP : TOWER_HP;
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
    this.updatePlayers();
    this.updateBullets();
    this.checkCollisions();
    this.removeDeadEntities();
  }

  private updatePlayers(): void {
    for (const player of this.players.values()) {
      const entity = this.entities.get(player.entityId);
      if (!entity) continue;

      const { input } = player;
      let vx = 0;
      let vy = 0;

      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;

      // Normalize diagonal movement
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > 0) {
        vx = (vx / mag) * PLAYER_SPEED;
        vy = (vy / mag) * PLAYER_SPEED;
      }

      entity.vel = { x: vx, y: vy };
      entity.pos.x += vx * this.dt;
      entity.pos.y += vy * this.dt;

      // Clamp to world bounds
      entity.pos.x = Math.max(0, Math.min(WORLD_WIDTH, entity.pos.x));
      entity.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, entity.pos.y));

      // Handle firing
      if (player.fireCooldown > 0) {
        player.fireCooldown--;
      }
      if (input.fire && player.fireCooldown <= 0) {
        this.spawnBullet(entity, player.id, input.aimAngle);
        player.fireCooldown = FIRE_COOLDOWN_TICKS;
      }
    }
  }

  spawnBullet(
    owner: Entity,
    ownerId: string,
    aimAngle: number
  ): Entity {
    const entityId = uuid();
    const vx = Math.cos(aimAngle) * BULLET_SPEED;
    const vy = Math.sin(aimAngle) * BULLET_SPEED;
    const entity: Entity = {
      id: entityId,
      kind: "bullet",
      pos: {
        x: owner.pos.x + Math.cos(aimAngle) * (PLAYER_RADIUS + BULLET_RADIUS + 2),
        y: owner.pos.y + Math.sin(aimAngle) * (PLAYER_RADIUS + BULLET_RADIUS + 2),
      },
      vel: { x: vx, y: vy },
      hp: BULLET_HP,
      team: owner.team,
    };
    this.entities.set(entityId, entity);
    this.bullets.set(entityId, {
      entityId,
      ownerId,
      ttl: BULLET_TTL_TICKS,
    });
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

      // Remove if expired or out of bounds
      if (
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

  checkCollisions(): void {
    for (const [bulletId] of this.bullets) {
      const bulletEntity = this.entities.get(bulletId);
      if (!bulletEntity || bulletEntity.hp <= 0) continue;

      for (const [entityId, target] of this.entities) {
        if (entityId === bulletId) continue;
        if (target.kind === "bullet") continue;
        if (target.team === bulletEntity.team) continue;
        if (target.hp <= 0) continue;

        const targetRadius = entityRadius(target.kind);

        if (circlesOverlap(bulletEntity.pos, BULLET_RADIUS, target.pos, targetRadius)) {
          target.hp -= BULLET_DAMAGE;
          bulletEntity.hp = 0;
          break;
        }
      }
    }
  }

  private removeDeadEntities(): void {
    for (const [id, entity] of this.entities) {
      if (entity.hp <= 0) {
        this.entities.delete(id);
        this.bullets.delete(id);
      }
    }
  }

  getSnapshot(phaseInfo?: {
    current: number;
    objectives: string[];
    remaining: Record<string, number>;
    matchOver: boolean;
    mothershipShielded: boolean;
  }) {
    return {
      v: 1 as const,
      type: "snapshot" as const,
      tick: this.tick,
      entities: Array.from(this.entities.values()),
      phase: phaseInfo,
    };
  }
}

export function entityRadius(kind: string): number {
  switch (kind) {
    case "bullet":
      return BULLET_RADIUS;
    case "minion_ship":
      return MINION_RADIUS;
    case "tower":
      return TOWER_RADIUS;
    case "mothership":
      return MOTHERSHIP_RADIUS;
    default:
      return PLAYER_RADIUS;
  }
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
