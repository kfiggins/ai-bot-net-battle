# /server - Authoritative Game Server

Node.js + TypeScript server that owns all game state. The client is just a renderer.

## Key Files
- `src/index.ts` - Entry point, creates RoomManager + WS + HTTP servers, graceful shutdown
- `src/config.ts` - Env-driven configuration (HOST, WS_PORT, HTTP_PORT, NODE_ENV, rate limits)
- `src/logger.ts` - Structured logger with room/player correlation IDs, configurable log levels
- `src/room.ts` - Room class: encapsulates per-match state (sim, AI, economy, agent, boss, players, tick loop, tick metrics)
- `src/room-manager.ts` - RoomManager: creates/finds/cleans up rooms, enforces max room limit
- `src/boss.ts` - Boss fight: mothership entity, phase gates (1→2→3), shield mechanics, win condition
- `src/sim.ts` - Core simulation: player management, bullet spawning/movement, collision detection, entity lifecycle
- `src/ws.ts` - WebSocket server with join_room handshake, room-scoped message routing, reconnect support, per-connection rate limiting
- `src/ai.ts` - AI behavior for enemy entities (minions seek + shoot, towers shoot in range)
- `src/economy.ts` - Resource system, build queue with cooldowns/caps, cost validation
- `src/agent.ts` - Agent API with command processing, rate limiting, budget tracking
- `src/http.ts` - HTTP server with `/healthz`, `/readyz`, `/metrics`, `/rooms`, `/rooms/:id/summary`, `/rooms/:id/agent/command`

## Architecture
- **Rooms**: Each room is an isolated match with its own Simulation, AIManager, Economy, AgentAPI, BossManager, and tick loop
- **Tick loop**: 30Hz simulation per room, snapshots broadcast every `SNAPSHOT_INTERVAL` ticks
- **Tick metrics**: Each room tracks observed tick rate, max tick duration, total ticks for observability
- **Connection flow**: Client connects → sends `join_room` → server creates/joins room → sends `welcome` with entityId + reconnectToken
- **Reconnect**: Disconnected players have 30s to reconnect with their token and reclaim their entity
- **Rate limiting**: Per-connection WS message rate (60/s), join rate (5/min); per-IP HTTP command rate (30/min)
- **Graceful shutdown**: SIGTERM/SIGINT → stop accepting connections → destroy rooms → flush I/O → exit
- **Simulation class**: Owns `entities` (Map<id, Entity>), `players` (Map<playerId, PlayerState>), `bullets` (Map<entityId, BulletState>)
- **Update order**: `updatePlayers()` → `updateBullets()` → `checkCollisions()` → `removeDeadEntities()`
- **AI runs after sim.update()** in the tick loop
- **Economy runs after AI** in the tick loop (income accrual, build queue processing)
- **Agent budget resets** checked after economy in tick loop
- **Boss update** runs last: enforces shield, handles phase transitions, checks win condition

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
- `room.test.ts` - Room + RoomManager tests (create/join/leave, reconnect, cleanup, isolation)
- `hardening.test.ts` - Config, logger, and tick metrics tests
