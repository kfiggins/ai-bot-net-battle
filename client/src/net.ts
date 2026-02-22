import { PlayerInputData, SnapshotMessage, SnapshotMessageSchema, SERVER_PORT } from "shared";

export class NetClient {
  private ws: WebSocket | null = null;
  private onSnapshot: ((snapshot: SnapshotMessage) => void) | null = null;

  connect(): void {
    this.ws = new WebSocket(`ws://localhost:${SERVER_PORT}`);

    this.ws.onopen = () => {
      console.log("[net] Connected to server");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const result = SnapshotMessageSchema.safeParse(data);
        if (result.success && this.onSnapshot) {
          this.onSnapshot(result.data);
        }
      } catch {
        console.warn("[net] Failed to parse server message");
      }
    };

    this.ws.onclose = () => {
      console.log("[net] Disconnected from server");
    };
  }

  sendInput(input: PlayerInputData): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
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
}
