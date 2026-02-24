import {
  AgentControlMode,
  PlayerInputData,
  SnapshotMessage,
  LobbyUpdateMessage,
  LobbyState,
  ServerMessageSchema,
  SERVER_PORT,
  TICK_MS,
} from "shared";

export class NetClient {
  private ws: WebSocket | null = null;
  private onSnapshot: ((snapshot: SnapshotMessage) => void) | null = null;
  private onLobbyUpdate: ((msg: LobbyUpdateMessage) => void) | null = null;
  private onMatchStart: (() => void) | null = null;
  private onMatchEnd: (() => void) | null = null;
  private onWelcome: ((lobbyState: LobbyState) => void) | null = null;
  selfEntityId: string | null = null;
  selfPlayerIndex: number | null = null;
  roomId: string | null = null;
  currentMode: AgentControlMode = "builtin_fake_ai";
  private reconnectToken: string | null = null;
  private targetRoomId: string = "default";
  private displayName: string = "Player";
  private lastInputTime = 0;
  private onEntityChange: (() => void) | null = null;

  connect(roomId: string = "default", displayName?: string): void {
    if (displayName) this.displayName = displayName;
    this.targetRoomId = roomId;

    const env = (import.meta as { env?: { VITE_WS_URL?: string; DEV?: boolean } }).env;
    const envWsUrl = env?.VITE_WS_URL;
    const wsUrl = envWsUrl && envWsUrl.length > 0
      ? envWsUrl
      : env?.DEV
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${SERVER_PORT}`
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[net] Connected to server");
      // Send join_room handshake
      this.ws!.send(
        JSON.stringify({
          v: 1,
          type: "join_room",
          roomId: this.targetRoomId,
          displayName: this.displayName,
          reconnectToken: this.reconnectToken ?? undefined,
        })
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const result = ServerMessageSchema.safeParse(data);
        if (!result.success) return;

        const msg = result.data;
        if (msg.type === "welcome") {
          const oldEntityId = this.selfEntityId;
          this.selfEntityId = msg.entityId;
          this.selfPlayerIndex = msg.playerIndex;
          this.roomId = msg.roomId;
          this.reconnectToken = msg.reconnectToken;
          this.currentMode = msg.lobby.mode;
          console.log(`[net] Joined room ${msg.roomId}, entity: ${msg.entityId}`);
          // Notify game if entity changed (reconnect with new entity)
          if (oldEntityId !== msg.entityId && this.onEntityChange) {
            this.onEntityChange();
          }
          if (this.onWelcome) {
            this.onWelcome(msg.lobby);
          }
        } else if (msg.type === "room_error") {
          console.error(`[net] Room error: ${msg.error}`, msg.detail);
        } else if (msg.type === "snapshot" && this.onSnapshot) {
          this.onSnapshot(msg);
        } else if (msg.type === "lobby_update") {
          this.currentMode = msg.mode;
          if (this.onLobbyUpdate) this.onLobbyUpdate(msg);
        } else if (msg.type === "match_start" && this.onMatchStart) {
          this.onMatchStart();
        } else if (msg.type === "match_end" && this.onMatchEnd) {
          this.onMatchEnd();
        }
      } catch {
        console.warn("[net] Failed to parse server message");
      }
    };

    this.ws.onclose = () => {
      console.log("[net] Disconnected from server");
      // Auto-reconnect after 2 seconds
      setTimeout(() => {
        if (this.reconnectToken) {
          console.log("[net] Attempting reconnect...");
          this.connect(this.targetRoomId);
        }
      }, 2000);
    };
  }

  /** Send input throttled to server tick rate (~30Hz) */
  sendInput(input: PlayerInputData): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.roomId) {
      const now = performance.now();
      if (now - this.lastInputTime < TICK_MS) return;
      this.lastInputTime = now;

      this.ws.send(
        JSON.stringify({
          v: 1,
          type: "player_input",
          input,
        })
      );
    }
  }

  /** Request the server to start the match */
  sendStartGame(mode: AgentControlMode): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type: "start_game", mode }));
    }
  }

  /** Send stat upgrade choice to server */
  sendUpgrade(stat: "damage" | "speed" | "health" | "fire_rate"): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type: "player_upgrade", stat }));
    }
  }

  setSnapshotHandler(handler: (snapshot: SnapshotMessage) => void): void {
    this.onSnapshot = handler;
  }

  setEntityChangeHandler(handler: () => void): void {
    this.onEntityChange = handler;
  }

  setLobbyUpdateHandler(handler: (msg: LobbyUpdateMessage) => void): void {
    this.onLobbyUpdate = handler;
  }

  setMatchStartHandler(handler: () => void): void {
    this.onMatchStart = handler;
  }

  setMatchEndHandler(handler: () => void): void {
    this.onMatchEnd = handler;
  }

  setWelcomeHandler(handler: (lobbyState: LobbyState) => void): void {
    this.onWelcome = handler;
  }

  /** Ask server to leave the current room (ends match for everyone if in-game) */
  sendLeaveRoom(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type: "leave_room" }));
    }
  }

  /** Tell server to fully remove us, then disconnect */
  disconnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type: "leave_room" }));
    }
    this.reconnectToken = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.selfEntityId = null;
    this.selfPlayerIndex = null;
    this.roomId = null;
  }
}
