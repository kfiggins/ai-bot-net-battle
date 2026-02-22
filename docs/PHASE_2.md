# Phase 2: Enemy Basics (Non-LLM AI)

## Goal
Add minion ships + towers with deterministic behavior.

## What Exists (from Phase 1)
- Player movement, shooting, bullets, collisions all server-authoritative
- Shared protocol with player_ship, bullet entity kinds

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Minion ship AI: seek nearest player, shoot periodically
- [x] Tower AI: stationary turret, shoots nearest player in range
- [x] Enemy spawning via server (test enemies spawned on startup)
- [x] Entity kinds: `minion_ship`, `tower` added to protocol

## Key Files to Create/Modify
- `/shared/protocol.ts` - Add `minion_ship`, `tower` kinds
- `/server/src/ai.ts` - AI behavior logic (seek, shoot)
- `/server/src/sim.ts` - Integrate AI updates into tick loop
- `/server/src/commands.ts` - Console command handler for spawning
- `/client/src/game.ts` - Render new entity types

## Message Contracts

### Snapshot with enemy entities
```json
{
  "v": 1,
  "type": "snapshot",
  "tick": 300,
  "entities": [
    { "id": "p1", "kind": "player_ship", "pos": { "x": 100, "y": 200 }, "vel": { "x": 0, "y": 0 }, "hp": 100, "team": 1 },
    { "id": "m1", "kind": "minion_ship", "pos": { "x": 500, "y": 300 }, "vel": { "x": -2, "y": 0 }, "hp": 30, "team": 2 },
    { "id": "t1", "kind": "tower", "pos": { "x": 700, "y": 400 }, "vel": { "x": 0, "y": 0 }, "hp": 100, "team": 2 }
  ]
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. In server console, type spawn command to create enemies
3. Verify: minion ships move toward players and shoot
4. Verify: towers shoot at players in range
5. Kill enemies with bullets, confirm they disappear
6. Check server logs for entity counts by type

## Notes
- AI should be deterministic given the same state
- Keep AI simple: no pathfinding, just direct seeking
- Towers are stationary (vel always 0,0)

## What to Implement Next → Phase 3
See [PHASE_3.md](./PHASE_3.md)
