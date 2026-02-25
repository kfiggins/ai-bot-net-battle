import { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import {
  TICK_MS,
  TICK_RATE,
  SNAPSHOT_INTERVAL,
  MAX_PLAYERS_PER_ROOM,
  RECONNECT_TIMEOUT_MS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  LobbyPlayer,
  AgentControlMode,
} from "shared";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";
import { BossManager } from "./boss.js";
import { FakeAI } from "./fake-ai.js";
import { log } from "./logger.js";

export type RoomState = "waiting" | "in_progress" | "finished";

export interface RoomPlayer {
  playerId: string;
  playerIndex: number;
  entityId: string;
  displayName: string;
  ws: WebSocket | null; // null when disconnected
  reconnectToken: string;
  disconnectedAt: number | null; // timestamp, null if connected
}

/** Tick drift tracking for observability */
export interface TickMetrics {
  observedTickRate: number;
  maxTickMs: number;
  totalTicks: number;
}

export class Room {
  readonly roomId: string;
  state: RoomState = "waiting";
  readonly createdAt: number = Date.now();
  agentControlMode: AgentControlMode = "builtin_fake_ai";

  sim: Simulation;
  ai: AIManager;
  economy: Economy;
  agent: AgentAPI;
  fakeAI: FakeAI;
  boss: BossManager;
  players: Map<string, RoomPlayer> = new Map();

  /** Tick drift instrumentation */
  private _tickMetrics: TickMetrics = { observedTickRate: 0, maxTickMs: 0, totalTicks: 0 };
  private _lastTickTime: number = 0;
  private _tickDurations: number[] = [];
  private _metricsWindowStart: number = 0;
  private _ticksInWindow: number = 0;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private nextPlayerId = 1;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.sim = new Simulation();
    this.sim.initOrbs();
    this.ai = new AIManager();
    this.economy = new Economy();
    this.agent = new AgentAPI();
    this.fakeAI = new FakeAI();
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

  get tickMetrics(): TickMetrics {
    return { ...this._tickMetrics };
  }

  getLobbyState() {
    return {
      state: this.state,
      players: this.playerCount,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      mode: this.agentControlMode,
    };
  }

  addPlayer(ws: WebSocket, displayName: string): RoomPlayer | null {
    if (this.playerCount >= MAX_PLAYERS_PER_ROOM) return null;
    if (this.state === "finished") return null;

    const playerNum = this.nextPlayerId++;
    const playerId = `player_${playerNum}`;
    const entity = this.sim.addPlayer(playerId, displayName, playerNum);
    const reconnectToken = uuid();

    const player: RoomPlayer = {
      playerId,
      playerIndex: playerNum,
      entityId: entity.id,
      displayName,
      ws,
      reconnectToken,
      disconnectedAt: null,
    };
    this.players.set(playerId, player);

    log.info("Player joined", { roomId: this.roomId, playerId, displayName });

    // Broadcast updated player list to all in lobby
    if (this.state === "waiting") {
      this.broadcastLobbyUpdate();
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
          const entity = this.sim.addPlayer(player.playerId, player.displayName, player.playerIndex);
          player.entityId = entity.id;
        }

        log.info("Player reconnected", { roomId: this.roomId, playerId: player.playerId });

        if (this.state === "waiting") {
          this.broadcastLobbyUpdate();
        }

        return player;
      }
    }
    return null;
  }

  disconnectPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    log.info("Player disconnected", { roomId: this.roomId, playerId });

    if (this.state === "waiting") {
      // In lobby: fully remove the player slot so it can be reused
      this.removePlayer(playerId);
      this.broadcastLobbyUpdate();
    } else {
      // In-game: keep the slot for potential reconnect
      player.ws = null;
      player.disconnectedAt = Date.now();
      this.sim.removePlayer(playerId);
    }
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.sim.removePlayer(playerId);
    this.players.delete(playerId);

    // Reset counter so next join gets a clean number
    if (this.state === "waiting") {
      let max = 0;
      for (const p of this.players.values()) {
        if (p.playerIndex > max) max = p.playerIndex;
      }
      this.nextPlayerId = max + 1;
    }
  }

  /** Clean up players who disconnected and haven't reconnected in time */
  cleanupDisconnected(): void {
    const now = Date.now();
    for (const [playerId, player] of this.players) {
      if (player.disconnectedAt !== null && now - player.disconnectedAt > RECONNECT_TIMEOUT_MS) {
        log.info("Removing timed-out player", { roomId: this.roomId, playerId });
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

  startMatch(mode?: AgentControlMode): void {
    if (this.state !== "waiting") return;
    this.agentControlMode = mode ?? this.agentControlMode;
    this.state = "in_progress";
    this.initGameState();
    this.startTickLoop();

    // Notify all connected players that the match is starting
    const msg = JSON.stringify({ v: 1, type: "match_start" });
    for (const player of this.players.values()) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(msg);
      }
    }

    log.info("Match started", { roomId: this.roomId });
  }

  /** Stop/reset the match and send all players back to lobby */
  resetToLobby(): void {
    if (this.state === "waiting") return;

    // Stop the tick loop
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.state = "waiting";
    this.agentControlMode = "builtin_fake_ai";

    // Reset simulation and subsystems
    this.sim = new Simulation();
    this.sim.initOrbs();
    this.ai = new AIManager();
    this.economy = new Economy();
    this.agent = new AgentAPI();
    this.fakeAI = new FakeAI();
    this.boss = new BossManager();

    // Re-add player entities for everyone still connected
    for (const player of this.players.values()) {
      if (player.ws !== null) {
        const entity = this.sim.addPlayer(player.playerId, player.displayName, player.playerIndex);
        player.entityId = entity.id;
        player.disconnectedAt = null;
      }
    }

    // Remove disconnected players (no point keeping them for reconnect now)
    for (const [playerId, player] of this.players) {
      if (player.ws === null) {
        this.players.delete(playerId);
      }
    }

    // Reset counter
    let max = 0;
    for (const p of this.players.values()) {
      if (p.playerIndex > max) max = p.playerIndex;
    }
    this.nextPlayerId = max + 1;

    // Notify all clients to go back to lobby
    const msg = JSON.stringify({ v: 1, type: "match_end" });
    for (const player of this.players.values()) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(msg);
      }
    }

    this.broadcastLobbyUpdate();
    log.info("Match reset to lobby", { roomId: this.roomId });
  }

  private initGameState(): void {
    const mothership = this.boss.spawnMothership(this.sim);
    this.ai.setPatrolCenter({ x: mothership.pos.x, y: mothership.pos.y });

    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    const m1 = this.sim.spawnEnemy("minion_ship", cx - 200, cy - 150);
    this.ai.registerEntity(m1.id);
    const m2 = this.sim.spawnEnemy("minion_ship", cx + 150, cy + 200);
    this.ai.registerEntity(m2.id);
    const t1 = this.sim.spawnEnemy("tower", cx + 250, cy - 100);
    this.ai.registerEntity(t1.id);
    const t2 = this.sim.spawnEnemy("tower", cx - 150, cy + 250);
    this.ai.registerEntity(t2.id);
    const mt1 = this.sim.spawnEnemy("missile_tower", cx + 100, cy - 300);
    this.ai.registerEntity(mt1.id);
  }

  private startTickLoop(): void {
    const now = Date.now();
    this._lastTickTime = now;
    this._metricsWindowStart = now;
    this._ticksInWindow = 0;

    this.tickInterval = setInterval(() => {
      const tickStart = Date.now();

      this.sim.update();
      this.ai.update(this.sim);
      this.economy.update(this.sim, this.ai);
      this.agent.update(this.sim);
      if (this.agentControlMode === "builtin_fake_ai") {
        const mothershipPos = this.boss.getMothershipPos(this.sim);
        this.fakeAI.update(this.sim, this.economy, this.agent, mothershipPos);
      }
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
        log.info("Match finished", { roomId: this.roomId, tick: this.sim.tick });
      }

      // Track tick drift
      const tickEnd = Date.now();
      const tickDuration = tickEnd - tickStart;
      this._tickDurations.push(tickDuration);
      this._ticksInWindow++;
      this._tickMetrics.totalTicks++;

      // Update metrics every ~1 second
      const windowElapsed = tickEnd - this._metricsWindowStart;
      if (windowElapsed >= 1000) {
        this._tickMetrics.observedTickRate = (this._ticksInWindow / windowElapsed) * 1000;
        this._tickMetrics.maxTickMs = Math.max(...this._tickDurations);
        this._tickDurations = [];
        this._ticksInWindow = 0;
        this._metricsWindowStart = tickEnd;

        // Warn if tick rate drifts significantly
        if (this._tickMetrics.observedTickRate < TICK_RATE * 0.8) {
          log.warn("Tick rate drift", {
            roomId: this.roomId,
            observed: Math.round(this._tickMetrics.observedTickRate * 10) / 10,
            target: TICK_RATE,
          });
        }
      }

      this._lastTickTime = tickStart;
    }, TICK_MS);
  }

  /** Send current player list to all connected clients in the lobby */
  broadcastLobbyUpdate(): void {
    const players: LobbyPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.ws !== null) {
        players.push({ name: p.displayName, playerIndex: p.playerIndex });
      }
    }
    const msg = JSON.stringify({ v: 1, type: "lobby_update", players, mode: this.agentControlMode });
    for (const player of this.players.values()) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(msg);
      }
    }
  }

  private broadcastSnapshot(): void {
    const phaseInfo = this.boss.getPhaseInfo(this.sim);
    const snapshot = JSON.stringify(this.sim.getSnapshot(phaseInfo, Math.floor(this.economy.balance)));
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
    log.info("Room destroyed", { roomId: this.roomId });
  }

  isEmpty(): boolean {
    return this.playerCount === 0;
  }
}
