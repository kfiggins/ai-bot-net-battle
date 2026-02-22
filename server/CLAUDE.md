# /server - Authoritative Game Server

Node.js + TypeScript server that owns all game state. The client is just a renderer.

## Key Files
- `src/index.ts` - Entry point, wires up sim + WS + AI + economy + boss, runs tick loop
- `src/boss.ts` - Boss fight: mothership entity, phase gates (1→2→3), shield mechanics, win condition
- `src/sim.ts` - Core simulation: player management, bullet spawning/movement, collision detection, entity lifecycle
- `src/ws.ts` - WebSocket server, validates incoming messages with Zod, broadcasts snapshots
- `src/ai.ts` - AI behavior for enemy entities (minions seek + shoot, towers shoot in range)
- `src/economy.ts` - Resource system, build queue with cooldowns/caps, cost validation
- `src/agent.ts` - Agent API with command processing, rate limiting, budget tracking
- `src/http.ts` - HTTP server (port 3001) with `/state/summary` and `POST /agent/command`

## Architecture
- **Tick loop**: 30Hz simulation (`TICK_RATE`), snapshots broadcast every `SNAPSHOT_INTERVAL` ticks
- **Simulation class**: Owns `entities` (Map<id, Entity>), `players` (Map<playerId, PlayerState>), `bullets` (Map<entityId, BulletState>)
- **Update order**: `updatePlayers()` → `updateBullets()` → `checkCollisions()` → `removeDeadEntities()`
- **AI runs after sim.update()** in the tick loop
- **Economy runs after AI** in the tick loop (income accrual, build queue processing)
- **Agent budget resets** checked after economy in tick loop
- **Boss update** runs last: enforces shield, handles phase transitions, checks win condition
- **Entity spawning**: `sim.addPlayer()`, `sim.spawnEnemy()`, `sim.spawnBullet()`
- **Economy**: `economy.requestBuild()` validates funds/caps, queues build. `economy.update()` processes queue.

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
- `economy.test.ts` - Economy tests (income, build requests, validation, queue processing)
- `agent.test.ts` - Agent API tests (commands, rate limiting, validation, budget)
- `boss.test.ts` - Boss fight tests (shield, phase transitions, win condition, combat integration)
