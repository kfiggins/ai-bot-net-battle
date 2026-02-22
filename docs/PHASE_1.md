# Phase 1: Real Game Loop, Minimal Combat

## Goal
Movement, shooting, bullets, and damage happen (server-side).

## What Exists (from Phase 0)
- Monorepo with client/server/shared
- WebSocket connection, tick loop, movement working
- Shared Zod protocol for `player_input` and `snapshot`

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Player fires bullets (client sends "fire" input with aim angle)
- [ ] Server spawns bullet entities and simulates them
- [ ] Server handles collisions (bullet vs enemy, simple circle/rect)
- [ ] Client renders bullet entities and hit effects from snapshots

## Key Files to Create/Modify
- `/shared/protocol.ts` - Add bullet entity kind, fire input
- `/server/src/sim.ts` - Bullet spawning, movement, collision detection
- `/client/src/game.ts` - Render bullets from snapshot

## Message Contracts

### Updated `player_input`
```json
{
  "v": 1,
  "type": "player_input",
  "input": {
    "up": false, "down": false, "left": false, "right": false,
    "fire": true,
    "aimAngle": 1.57
  }
}
```

### Snapshot now includes bullets
```json
{
  "v": 1,
  "type": "snapshot",
  "tick": 200,
  "entities": [
    { "id": "p1", "kind": "player_ship", "pos": { "x": 100, "y": 200 }, "vel": { "x": 0, "y": 0 }, "hp": 100, "team": 1 },
    { "id": "b1", "kind": "bullet", "pos": { "x": 120, "y": 200 }, "vel": { "x": 10, "y": 0 }, "hp": 1, "team": 1 }
  ]
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Open browser, move ship with arrows
3. Fire bullets (spacebar or click)
4. Verify bullets appear and travel across screen
5. Confirm: no client-side bullet spawning — bullets only appear after server confirms

## Notes
- Keep physics simple: circles for collision
- Bullets should have a TTL or max range to prevent infinite travel
- No client-side cheating: cannot spawn bullets locally

## What to Implement Next → Phase 2
See [PHASE_2.md](./PHASE_2.md)
