import { WebSocketServer, WebSocket } from "ws";
import { ClientMessageSchema } from "shared";
import { RoomManager } from "./room-manager.js";

export function createWSServer(
  port: number,
  roomManager: RoomManager
): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    let joined = false;

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const result = ClientMessageSchema.safeParse(data);
        if (!result.success) {
          ws.send(JSON.stringify({
            v: 1,
            type: "room_error",
            error: "invalid_message",
            detail: result.error.message,
          }));
          return;
        }

        const msg = result.data;

        if (msg.type === "join_room") {
          if (joined) {
            ws.send(JSON.stringify({
              v: 1,
              type: "room_error",
              error: "already_joined",
              detail: "You are already in a room",
            }));
            return;
          }

          // Try reconnect first
          if (msg.reconnectToken) {
            for (const room of roomManager.rooms.values()) {
              const player = room.reconnectPlayer(ws, msg.reconnectToken);
              if (player) {
                joined = true;
                console.log(`[ws] ${player.playerId} reconnected to room ${room.roomId}`);
                ws.send(JSON.stringify({
                  v: 1,
                  type: "welcome",
                  roomId: room.roomId,
                  entityId: player.entityId,
                  reconnectToken: player.reconnectToken,
                  lobby: room.getLobbyState(),
                }));
                return;
              }
            }
          }

          // Create or join room
          const room = roomManager.getOrCreateRoom(msg.roomId);
          if (!room) {
            ws.send(JSON.stringify({
              v: 1,
              type: "room_error",
              error: "room_limit_reached",
              detail: "Maximum number of rooms reached",
            }));
            return;
          }

          const displayName = msg.displayName || "Player";
          const player = room.addPlayer(ws, displayName);
          if (!player) {
            ws.send(JSON.stringify({
              v: 1,
              type: "room_error",
              error: "room_full",
              detail: "Room is full or match has ended",
            }));
            return;
          }

          joined = true;
          console.log(`[ws] ${player.playerId} joined room ${room.roomId}`);

          ws.send(JSON.stringify({
            v: 1,
            type: "welcome",
            roomId: room.roomId,
            entityId: player.entityId,
            reconnectToken: player.reconnectToken,
            lobby: room.getLobbyState(),
          }));
          return;
        }

        if (msg.type === "player_input") {
          if (!joined) return;

          const room = roomManager.findRoomByWs(ws);
          if (!room) return;

          const player = room.findPlayerByWs(ws);
          if (!player) return;

          room.sim.setInput(player.playerId, msg.input);
        }
      } catch {
        ws.send(JSON.stringify({
          v: 1,
          type: "room_error",
          error: "parse_error",
        }));
      }
    });

    ws.on("close", () => {
      const room = roomManager.findRoomByWs(ws);
      if (!room) return;

      const player = room.findPlayerByWs(ws);
      if (!player) return;

      console.log(`[ws] ${player.playerId} disconnected from room ${room.roomId}`);
      room.disconnectPlayer(player.playerId);
    });
  });

  // Periodic cleanup of empty/finished rooms
  setInterval(() => {
    roomManager.cleanup();
  }, 10_000);

  return wss;
}
