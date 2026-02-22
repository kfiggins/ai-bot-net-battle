# Phase 7: Multiplayer Rooms + Match Lifecycle

## Goal
Support multiple human players in isolated matches via rooms/lobbies, with clean join/leave/reconnect behavior.

## What Exists (from Phase 6)
- One server-authoritative simulation loop
- WebSocket player input + snapshot broadcast
- Full combat/economy/boss loop in a single world instance
- Agent API and state summary endpoint

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Room model (`roomId`) with create/join/leave flow
- [ ] Per-room simulation instances (no shared-state bleed between matches)
- [ ] Room-scoped snapshot broadcast (`snapshot` includes `roomId`)
- [ ] Basic lobby state: waiting, in_progress, finished
- [ ] Reconnect support: player can rejoin same room and reclaim entity/role
- [ ] Match start/end/reset lifecycle for each room
- [ ] HTTP/WS validation that rejects cross-room input

## Key Files to Create/Modify
- `/shared/src/protocol.ts` - Add room/lobby message contracts
- `/server/src/ws.ts` - Handle room-scoped connections and routing
- `/server/src/index.ts` - Create/manage room simulation containers
- `/server/src/sim.ts` - Scope player/entity ops by room instance
- `/server/src/http.ts` - Add room-aware summary/admin endpoints
- `/client/src/net.ts` - Room join/create handshake and reconnect metadata
- `/client/src/game.ts` - Room-aware state bootstrapping

## Message Contracts

### Client → Server: Join room
```json
{
  "v": 1,
  "type": "join_room",
  "roomId": "alpha-001",
  "displayName": "Kyler",
  "reconnectToken": "optional-token"
}
```

### Server → Client: Room welcome
```json
{
  "v": 1,
  "type": "room_welcome",
  "roomId": "alpha-001",
  "playerId": "player_7",
  "entityId": "ent_123",
  "lobby": {
    "state": "waiting",
    "players": 2,
    "maxPlayers": 4
  }
}
```

### Server → Client: Snapshot (room-scoped)
```json
{
  "v": 1,
  "type": "snapshot",
  "roomId": "alpha-001",
  "tick": 1280,
  "entities": []
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Open 3 browser tabs
3. Join 2 tabs to `room-a`, 1 tab to `room-b`
4. Verify movement/firing in `room-a` does not affect `room-b`
5. Close one `room-a` tab and reconnect to `room-a`
6. Verify reconnect regains control and snapshots continue cleanly

## Notes
- Keep room ownership server-authoritative; client-provided room data is advisory only.
- Use stable reconnect tokens per session to avoid ghost players.
- Cap room count / players per room to protect server CPU.

## What to Implement Next → Phase 8
See [PHASE_8.md](./PHASE_8.md)
