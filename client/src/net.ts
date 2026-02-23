import {
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
  private onWelcome: ((lobbyState: LobbyState) => void) | null = null;
  selfEntityId: string | null = null;
  roomId: string | null = null;
  private reconnectToken: string | null = null;
  private targetRoomId: string = "default";
  private lastInputTime = 0;
  private onEntityChange: (() => void) | null = null;

  connect(roomId: string = "default"): void {
    this.targetRoomId = roomId;
    this.ws = new WebSocket(`ws://localhost:${SERVER_PORT}`);

    this.ws.onopen = () => {
      console.log("[net] Connected to server");
      // Send join_room handshake
      this.ws!.send(
        JSON.stringify({
          v: 1,
          type: "join_room",
          roomId: this.targetRoomId,
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
          this.roomId = msg.roomId;
          this.reconnectToken = msg.reconnectToken;
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
        } else if (msg.type === "lobby_update" && this.onLobbyUpdate) {
          this.onLobbyUpdate(msg);
        } else if (msg.type === "match_start" && this.onMatchStart) {
          this.onMatchStart();
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
  sendStartGame(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, type: "start_game" }));
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

  setWelcomeHandler(handler: (lobbyState: LobbyState) => void): void {
    this.onWelcome = handler;
  }
}
