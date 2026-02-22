import { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import {
  TICK_MS,
  SNAPSHOT_INTERVAL,
  MAX_PLAYERS_PER_ROOM,
  RECONNECT_TIMEOUT_MS,
} from "shared";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";
import { BossManager } from "./boss.js";

export type RoomState = "waiting" | "in_progress" | "finished";

export interface RoomPlayer {
  playerId: string;
  entityId: string;
  displayName: string;
  ws: WebSocket | null; // null when disconnected
  reconnectToken: string;
  disconnectedAt: number | null; // timestamp, null if connected
}

export class Room {
  readonly roomId: string;
  state: RoomState = "waiting";

  sim: Simulation;
  ai: AIManager;
  economy: Economy;
  agent: AgentAPI;
  boss: BossManager;
  players: Map<string, RoomPlayer> = new Map();

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private nextPlayerId = 1;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.sim = new Simulation();
    this.ai = new AIManager();
    this.economy = new Economy();
    this.agent = new AgentAPI();
    this.boss = new BossManager();
  }

  get playerCount(): number {
    return this.players.size;
  }

  get connectedCount(): number {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.ws) count++;
    }
    return count;
  }

  getLobbyState() {
    return {
      state: this.state,
      players: this.playerCount,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
    };
  }

  addPlayer(ws: WebSocket, displayName: string): RoomPlayer | null {
    if (this.playerCount >= MAX_PLAYERS_PER_ROOM) return null;
    if (this.state === "finished") return null;

    const playerId = `player_${this.nextPlayerId++}`;
    const entity = this.sim.addPlayer(playerId);
    const reconnectToken = uuid();

    const player: RoomPlayer = {
      playerId,
      entityId: entity.id,
      displayName,
      ws,
      reconnectToken,
      disconnectedAt: null,
    };
    this.players.set(playerId, player);

    // Start the game when first player joins
    if (this.state === "waiting") {
      this.startMatch();
    }

    return player;
  }

  reconnectPlayer(ws: WebSocket, reconnectToken: string): RoomPlayer | null {
    for (const player of this.players.values()) {
      if (player.reconnectToken === reconnectToken && player.disconnectedAt !== null) {
        player.ws = ws;
        player.disconnectedAt = null;

        // Re-add player entity if it was removed
        if (!this.sim.entities.has(player.entityId)) {
          const entity = this.sim.addPlayer(player.playerId);
          player.entityId = entity.id;
        }

        return player;
      }
    }
    return null;
  }

  disconnectPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.ws = null;
    player.disconnectedAt = Date.now();

    // Remove their entity from the sim
    this.sim.removePlayer(playerId);
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.sim.removePlayer(playerId);
    this.players.delete(playerId);
  }

  /** Clean up players who disconnected and haven't reconnected in time */
  cleanupDisconnected(): void {
    const now = Date.now();
    for (const [playerId, player] of this.players) {
      if (player.disconnectedAt !== null && now - player.disconnectedAt > RECONNECT_TIMEOUT_MS) {
        this.removePlayer(playerId);
      }
    }
  }

  findPlayerByWs(ws: WebSocket): RoomPlayer | undefined {
    for (const player of this.players.values()) {
      if (player.ws === ws) return player;
    }
    return undefined;
  }

  private startMatch(): void {
    this.state = "in_progress";
    this.initGameState();
    this.startTickLoop();
  }

  private initGameState(): void {
    this.boss.spawnMothership(this.sim);
    const m1 = this.sim.spawnEnemy("minion_ship", 700, 200);
    this.ai.registerEntity(m1.id);
    const m2 = this.sim.spawnEnemy("minion_ship", 750, 400);
    this.ai.registerEntity(m2.id);
    const t1 = this.sim.spawnEnemy("tower", 800, 300);
    this.ai.registerEntity(t1.id);
    const t2 = this.sim.spawnEnemy("tower", 750, 500);
    this.ai.registerEntity(t2.id);
  }

  private startTickLoop(): void {
    this.tickInterval = setInterval(() => {
      this.sim.update();
      this.ai.update(this.sim);
      this.economy.update(this.sim, this.ai);
      this.agent.update(this.sim);
      this.boss.update(this.sim);

      // Clean up stale disconnected players periodically
      if (this.sim.tick % 300 === 0) {
        this.cleanupDisconnected();
      }

      if (this.sim.tick % SNAPSHOT_INTERVAL === 0) {
        this.broadcastSnapshot();
      }

      // Check for match end
      const phaseInfo = this.boss.getPhaseInfo(this.sim);
      if (phaseInfo.matchOver && this.state !== "finished") {
        this.state = "finished";
      }
    }, TICK_MS);
  }

  private broadcastSnapshot(): void {
    const phaseInfo = this.boss.getPhaseInfo(this.sim);
    const snapshot = JSON.stringify(this.sim.getSnapshot(phaseInfo));
    for (const player of this.players.values()) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(snapshot);
      }
    }
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const player of this.players.values()) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.close();
      }
    }
    this.players.clear();
  }

  isEmpty(): boolean {
    return this.playerCount === 0;
  }
}
