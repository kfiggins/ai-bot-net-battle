# /server - Authoritative Game Server

Node.js + TypeScript server that owns all game state. The client is just a renderer.

## Key Files
- `src/index.ts` - Entry point, wires up sim + WS + AI, runs tick loop
- `src/sim.ts` - Core simulation: player management, bullet spawning/movement, collision detection, entity lifecycle
- `src/ws.ts` - WebSocket server, validates incoming messages with Zod, broadcasts snapshots
- `src/ai.ts` - AI behavior for enemy entities (minions seek + shoot, towers shoot in range)

## Architecture
- **Tick loop**: 30Hz simulation (`TICK_RATE`), snapshots broadcast every `SNAPSHOT_INTERVAL` ticks
- **Simulation class**: Owns `entities` (Map<id, Entity>), `players` (Map<playerId, PlayerState>), `bullets` (Map<entityId, BulletState>)
- **Update order**: `updatePlayers()` → `updateBullets()` → `checkCollisions()` → `removeDeadEntities()`
- **AI runs after sim.update()** in the tick loop
- **Entity spawning**: `sim.addPlayer()`, `sim.spawnEnemy()`, `sim.spawnBullet()`

## Server Authority Rules
- Client sends intents (input), server computes all state
- All collision, damage, spawning, and economy decisions happen here
- Snapshots are the only state the client receives

## Helpers
- `entityRadius(kind)` - Returns collision radius by entity kind
- `circlesOverlap(a, ar, b, br)` - Circle-circle collision test

## Testing
- `sim.test.ts` - Simulation unit tests (movement, bullets, collisions, snapshots)
- `ai.test.ts` - AI behavior tests (seeking, firing, cooldowns, cleanup)
