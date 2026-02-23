import { PlayerInputData, SnapshotMessage, ServerMessageSchema, SERVER_PORT, TICK_MS } from "shared";

export class NetClient {
  private ws: WebSocket | null = null;
  private onSnapshot: ((snapshot: SnapshotMessage) => void) | null = null;
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
        } else if (msg.type === "room_error") {
          console.error(`[net] Room error: ${msg.error}`, msg.detail);
        } else if (msg.type === "snapshot" && this.onSnapshot) {
          this.onSnapshot(msg);
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

  setSnapshotHandler(handler: (snapshot: SnapshotMessage) => void): void {
    this.onSnapshot = handler;
  }

  setEntityChangeHandler(handler: () => void): void {
    this.onEntityChange = handler;
  }
}
