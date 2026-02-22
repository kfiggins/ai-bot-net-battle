import { v4 as uuid } from "uuid";
import {
  Entity,
  PlayerInputData,
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_HP,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "shared";

export interface PlayerState {
  id: string;
  entityId: string;
  input: PlayerInputData;
}

export class Simulation {
  tick = 0;
  entities: Map<string, Entity> = new Map();
  players: Map<string, PlayerState> = new Map();

  private dt = 1 / TICK_RATE;

  addPlayer(playerId: string): Entity {
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

  update(): void {
    this.tick++;

    // Update player entities based on input
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
    }
  }

  getSnapshot() {
    return {
      v: 1 as const,
      type: "snapshot" as const,
      tick: this.tick,
      entities: Array.from(this.entities.values()),
    };
  }
}
