import { WebSocketServer, WebSocket } from "ws";
import { ClientMessageSchema } from "shared";
import { RoomManager } from "./room-manager.js";
import { config } from "./config.js";
import { log } from "./logger.js";

/** Per-connection rate limiter state */
interface ConnectionLimiter {
  msgCount: number;
  msgWindowStart: number;
  joinCount: number;
  joinWindowStart: number;
}

function checkMessageRate(limiter: ConnectionLimiter): boolean {
  const now = Date.now();
  if (now - limiter.msgWindowStart >= 1000) {
    limiter.msgCount = 0;
    limiter.msgWindowStart = now;
  }
  limiter.msgCount++;
  return limiter.msgCount <= config.wsRateLimitPerSec;
}

function checkJoinRate(limiter: ConnectionLimiter): boolean {
  const now = Date.now();
  if (now - limiter.joinWindowStart >= 60_000) {
    limiter.joinCount = 0;
    limiter.joinWindowStart = now;
  }
  limiter.joinCount++;
  return limiter.joinCount <= config.joinRateLimitPerMin;
}

export function createWSServer(
  port: number,
  roomManager: RoomManager
): WebSocketServer {
  const wss = new WebSocketServer({ port, host: config.host });

  wss.on("connection", (ws) => {
    let joined = false;
    const limiter: ConnectionLimiter = {
      msgCount: 0,
      msgWindowStart: Date.now(),
      joinCount: 0,
      joinWindowStart: Date.now(),
    };

    ws.on("message", (raw) => {
      // Global message rate limit
      if (!checkMessageRate(limiter)) {
        ws.send(JSON.stringify({
          v: 1,
          type: "room_error",
          error: "rate_limited",
          detail: "Too many messages",
        }));
        return;
      }

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

          // Join spam rate limit
          if (!checkJoinRate(limiter)) {
            log.warn("Join rate limit hit");
            ws.send(JSON.stringify({
              v: 1,
              type: "room_error",
              error: "rate_limited",
              detail: "Too many join attempts",
            }));
            return;
          }

          // Try reconnect first
          if (msg.reconnectToken) {
            for (const room of roomManager.rooms.values()) {
              const player = room.reconnectPlayer(ws, msg.reconnectToken);
              if (player) {
                joined = true;
                ws.send(JSON.stringify({
                  v: 1,
                  type: "welcome",
                  roomId: room.roomId,
                  entityId: player.entityId,
                  playerIndex: player.playerIndex,
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

          ws.send(JSON.stringify({
            v: 1,
            type: "welcome",
            roomId: room.roomId,
            entityId: player.entityId,
            playerIndex: player.playerIndex,
            reconnectToken: player.reconnectToken,
            lobby: room.getLobbyState(),
          }));
          return;
        }

        if (msg.type === "start_game") {
          if (!joined) return;

          const room = roomManager.findRoomByWs(ws);
          if (!room) return;

          room.startMatch(msg.mode ?? "builtin_fake_ai");
          return;
        }

        if (msg.type === "leave_room") {
          if (!joined) return;

          const room = roomManager.findRoomByWs(ws);
          if (!room) return;

          const player = room.findPlayerByWs(ws);
          if (!player) return;

          if (room.state !== "waiting") {
            // End/reset match for everyone, send all back to lobby.
            room.resetToLobby();
          } else {
            room.removePlayer(player.playerId);
            room.broadcastLobbyUpdate();
          }
          joined = false;
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

      room.disconnectPlayer(player.playerId);
    });
  });

  // Periodic cleanup of empty/finished rooms
  setInterval(() => {
    roomManager.cleanup();
  }, 10_000);

  return wss;
}
