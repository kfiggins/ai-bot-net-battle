import { WebSocket } from "ws";
import { MAX_ROOMS } from "shared";
import { Room } from "./room.js";

export class RoomManager {
  rooms: Map<string, Room> = new Map();

  getOrCreateRoom(roomId: string): Room | null {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;

    if (this.rooms.size >= MAX_ROOMS) return null;

    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    console.log(`[rooms] Created room: ${roomId}`);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Find which room a WebSocket belongs to */
  findRoomByWs(ws: WebSocket): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.findPlayerByWs(ws)) return room;
    }
    return undefined;
  }

  /** Clean up empty finished rooms */
  cleanup(): void {
    for (const [roomId, room] of this.rooms) {
      if (room.isEmpty() || (room.state === "finished" && room.connectedCount === 0)) {
        room.destroy();
        this.rooms.delete(roomId);
        console.log(`[rooms] Destroyed room: ${roomId}`);
      }
    }
  }

  getRoomSummaries() {
    return Array.from(this.rooms.values()).map((room) => ({
      roomId: room.roomId,
      state: room.state,
      players: room.playerCount,
      connected: room.connectedCount,
      tick: room.sim.tick,
    }));
  }
}
