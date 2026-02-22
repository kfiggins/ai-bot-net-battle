import { WebSocketServer, WebSocket } from "ws";
import { ClientMessageSchema } from "shared";
import { Simulation } from "./sim.js";

export interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
}

export function createWSServer(
  port: number,
  sim: Simulation
): { wss: WebSocketServer; clients: Map<string, ConnectedClient> } {
  const wss = new WebSocketServer({ port });
  const clients = new Map<string, ConnectedClient>();
  let nextId = 1;

  wss.on("connection", (ws) => {
    const playerId = `player_${nextId++}`;
    console.log(`[ws] ${playerId} connected`);

    sim.addPlayer(playerId);
    clients.set(playerId, { ws, playerId });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const result = ClientMessageSchema.safeParse(data);
        if (!result.success) {
          console.warn(`[ws] Invalid message from ${playerId}:`, result.error.message);
          return;
        }

        const msg = result.data;
        if (msg.type === "player_input") {
          sim.setInput(playerId, msg.input);
        }
      } catch (err) {
        console.warn(`[ws] Failed to parse message from ${playerId}`);
      }
    });

    ws.on("close", () => {
      console.log(`[ws] ${playerId} disconnected`);
      sim.removePlayer(playerId);
      clients.delete(playerId);
    });
  });

  return { wss, clients };
}

export function broadcastSnapshot(
  clients: Map<string, ConnectedClient>,
  sim: Simulation,
  phaseInfo?: {
    current: number;
    objectives: string[];
    remaining: Record<string, number>;
    matchOver: boolean;
    mothershipShielded: boolean;
  }
): void {
  const snapshot = JSON.stringify(sim.getSnapshot(phaseInfo));
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(snapshot);
    }
  }
}
