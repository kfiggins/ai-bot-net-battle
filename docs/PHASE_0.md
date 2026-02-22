# Phase 0: Monorepo Boot + "Hello Multiplayer"

## Goal
You can run client + server, connect via WebSocket, and see a dot move.

## What Exists
- Monorepo with `/client`, `/server`, `/shared` packages
- Vite + Phaser client app
- Node WebSocket server with tick loop
- Shared Zod protocol schemas

## How to Run
```bash
pnpm install
pnpm dev        # starts both client and server
```
Open two browser tabs at `http://localhost:5173` to see two ships.

## Deliverables
- [x] Vite Phaser app renders a ship
- [x] Node server runs a tick loop (30 Hz)
- [x] Client sends input (up/down/left/right)
- [x] Server broadcasts snapshot with ship positions

## Key Files
- `/shared/protocol.ts` - Message types + Zod schemas
- `/server/src/ws.ts` - WebSocket server
- `/server/src/sim.ts` - Tick loop / simulation
- `/client/src/net.ts` - Socket client
- `/client/src/game.ts` - Phaser game scene

## Message Contracts

### Client → Server: `player_input`
```json
{
  "v": 1,
  "type": "player_input",
  "input": {
    "up": false,
    "down": false,
    "left": false,
    "right": false,
    "fire": false,
    "aimAngle": 0
  }
}
```

### Server → Client: `snapshot`
```json
{
  "v": 1,
  "type": "snapshot",
  "tick": 100,
  "entities": [
    { "id": "abc", "kind": "player_ship", "pos": { "x": 100, "y": 200 }, "vel": { "x": 1, "y": 0 }, "hp": 100, "team": 1 }
  ]
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Open `http://localhost:5173` in two browser tabs
3. Press arrow keys in each tab
4. Verify: each tab shows two ships, and arrow keys move your own ship
5. Both tabs reflect each other's movement

## What to Implement Next → Phase 1
See [PHASE_1.md](./PHASE_1.md)
