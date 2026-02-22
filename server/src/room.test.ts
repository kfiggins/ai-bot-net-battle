import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Room } from "./room.js";
import { RoomManager } from "./room-manager.js";

// Minimal mock WebSocket
function mockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as any;
}

describe("Room", () => {
  let room: Room;

  beforeEach(() => {
    room = new Room("test-room");
  });

  afterEach(() => {
    room.destroy();
  });

  it("starts in waiting state", () => {
    expect(room.state).toBe("waiting");
    expect(room.playerCount).toBe(0);
  });

  it("adds a player and transitions to in_progress", () => {
    const ws = mockWs();
    const player = room.addPlayer(ws, "Alice");
    expect(player).not.toBeNull();
    expect(player!.displayName).toBe("Alice");
    expect(player!.entityId).toBeTruthy();
    expect(player!.reconnectToken).toBeTruthy();
    expect(room.playerCount).toBe(1);
    expect(room.state).toBe("in_progress");
  });

  it("rejects players when room is full", () => {
    for (let i = 0; i < 4; i++) {
      room.addPlayer(mockWs(), `Player${i}`);
    }
    expect(room.playerCount).toBe(4);

    const rejected = room.addPlayer(mockWs(), "Extra");
    expect(rejected).toBeNull();
  });

  it("disconnects and reconnects a player", () => {
    const ws1 = mockWs();
    const player = room.addPlayer(ws1, "Bob");
    const token = player!.reconnectToken;
    const playerId = player!.playerId;

    // Disconnect
    room.disconnectPlayer(playerId);
    expect(player!.ws).toBeNull();
    expect(player!.disconnectedAt).not.toBeNull();
    expect(room.playerCount).toBe(1); // still in room, just disconnected
    expect(room.connectedCount).toBe(0);

    // Reconnect
    const ws2 = mockWs();
    const reconnected = room.reconnectPlayer(ws2, token);
    expect(reconnected).not.toBeNull();
    expect(reconnected!.ws).toBe(ws2);
    expect(reconnected!.disconnectedAt).toBeNull();
    expect(room.connectedCount).toBe(1);
  });

  it("reconnect fails with wrong token", () => {
    const ws1 = mockWs();
    const player = room.addPlayer(ws1, "Charlie");
    room.disconnectPlayer(player!.playerId);

    const ws2 = mockWs();
    const result = room.reconnectPlayer(ws2, "wrong-token");
    expect(result).toBeNull();
  });

  it("removes player entirely", () => {
    const ws = mockWs();
    const player = room.addPlayer(ws, "Dave");
    room.removePlayer(player!.playerId);
    expect(room.playerCount).toBe(0);
  });

  it("cleans up disconnected players after timeout", () => {
    const ws = mockWs();
    const player = room.addPlayer(ws, "Eve");
    room.disconnectPlayer(player!.playerId);

    // Simulate time passing beyond reconnect timeout
    player!.disconnectedAt = Date.now() - 60_000;
    room.cleanupDisconnected();
    expect(room.playerCount).toBe(0);
  });

  it("does not clean up recently disconnected players", () => {
    const ws = mockWs();
    const player = room.addPlayer(ws, "Frank");
    room.disconnectPlayer(player!.playerId);

    // Just disconnected — should still be in room
    room.cleanupDisconnected();
    expect(room.playerCount).toBe(1);
  });

  it("findPlayerByWs returns correct player", () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    const p1 = room.addPlayer(ws1, "P1");
    const p2 = room.addPlayer(ws2, "P2");

    expect(room.findPlayerByWs(ws1)?.playerId).toBe(p1!.playerId);
    expect(room.findPlayerByWs(ws2)?.playerId).toBe(p2!.playerId);
    expect(room.findPlayerByWs(mockWs())).toBeUndefined();
  });

  it("getLobbyState returns correct data", () => {
    room.addPlayer(mockWs(), "P1");
    room.addPlayer(mockWs(), "P2");

    const lobby = room.getLobbyState();
    expect(lobby.state).toBe("in_progress");
    expect(lobby.players).toBe(2);
    expect(lobby.maxPlayers).toBe(4);
  });

  it("initializes game state with mothership and enemies", () => {
    room.addPlayer(mockWs(), "P1"); // triggers startMatch
    const entities = Array.from(room.sim.entities.values());
    const kinds = entities.map((e) => e.kind);

    expect(kinds).toContain("player_ship");
    expect(kinds).toContain("mothership");
    expect(kinds).toContain("minion_ship");
    expect(kinds).toContain("tower");
  });

  it("rejects players after match is finished", () => {
    room.addPlayer(mockWs(), "P1");
    room.state = "finished" as any;

    const result = room.addPlayer(mockWs(), "P2");
    expect(result).toBeNull();
  });
});

describe("RoomManager", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    for (const room of manager.rooms.values()) {
      room.destroy();
    }
  });

  it("creates rooms on demand", () => {
    const room = manager.getOrCreateRoom("room-1");
    expect(room).not.toBeNull();
    expect(room!.roomId).toBe("room-1");
    expect(manager.rooms.size).toBe(1);
  });

  it("returns existing room for same ID", () => {
    const room1 = manager.getOrCreateRoom("room-1");
    const room2 = manager.getOrCreateRoom("room-1");
    expect(room1).toBe(room2);
    expect(manager.rooms.size).toBe(1);
  });

  it("enforces max room limit", () => {
    for (let i = 0; i < 10; i++) {
      manager.getOrCreateRoom(`room-${i}`);
    }
    expect(manager.rooms.size).toBe(10);

    const overflow = manager.getOrCreateRoom("room-overflow");
    expect(overflow).toBeNull();
  });

  it("finds room by WebSocket", () => {
    const room = manager.getOrCreateRoom("room-1")!;
    const ws = mockWs();
    room.addPlayer(ws, "P1");

    expect(manager.findRoomByWs(ws)?.roomId).toBe("room-1");
    expect(manager.findRoomByWs(mockWs())).toBeUndefined();
  });

  it("cleans up empty rooms", () => {
    const room = manager.getOrCreateRoom("room-1")!;
    // Room is empty (no players added)
    expect(room.isEmpty()).toBe(true);
    manager.cleanup();
    expect(manager.rooms.size).toBe(0);
  });

  it("cleans up finished rooms with no connected players", () => {
    const room = manager.getOrCreateRoom("room-1")!;
    const ws = mockWs();
    room.addPlayer(ws, "P1");
    room.state = "finished" as any;

    // Player still connected — don't clean up
    manager.cleanup();
    expect(manager.rooms.size).toBe(1);

    // Disconnect player
    const player = room.findPlayerByWs(ws)!;
    room.disconnectPlayer(player.playerId);
    room.removePlayer(player.playerId);

    manager.cleanup();
    expect(manager.rooms.size).toBe(0);
  });

  it("returns room summaries", () => {
    const room = manager.getOrCreateRoom("room-1")!;
    room.addPlayer(mockWs(), "P1");

    const summaries = manager.getRoomSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].roomId).toBe("room-1");
    expect(summaries[0].players).toBe(1);
    expect(summaries[0].state).toBe("in_progress");
  });
});
