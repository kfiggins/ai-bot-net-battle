# Changelog

## Phase 16: Bullet Recoil Physics + Cannon Visuals

### Added
- Server: Bullet recoil physics — firing applies an impulse opposite to aim direction, decays per tick
- Server: `recoilVel` field on `PlayerState`, initialized at spawn, reset on respawn
- Server: Bullet spawn lateral offset — multi-cannon bullets originate from distinct barrel positions
- Server: `aimAngle` included in snapshot enrichment for other players' cannon direction
- Shared: `BULLET_RECOIL_FORCE` (60), `RECOIL_FRICTION` (0.82) constants
- Shared: `CANNON_LENGTH` (18), `CANNON_WIDTH` (5), `CANNON_OFFSET_LATERAL` (6) constants
- Shared: `aimAngle` optional field on `EntitySchema`
- Client: Gray cannon barrel rectangles on player ships, rotating with aim angle
- Client: Cannon count scales with level milestones (1→2→3→4)
- Client: `cannonSprites` map with create/update/cleanup lifecycle
- Recoil physics tests (7 tests), bullet origin offset tests (3 tests), snapshot aimAngle tests (3 tests), protocol tests (2 tests)

### Changed
- Server: `updatePlayers()` combines input velocity with decaying recoil velocity
- Server: `fireMultiCannon()` applies recoil impulse and passes lateral offsets to `spawnBullet()`
- Server: `spawnBullet()` accepts optional `lateralOffset` parameter for perpendicular spawn offset
- Client: `renderEntities()` creates and updates cannon visuals for all player ships

## Phase 9: Lobby / Start Screen

### Added
- Client: `lobby.ts` — LobbyScene with game title, player list, and Start Game button
- Shared: `start_game`, `lobby_update`, `match_start` wire message schemas
- Server: `broadcastLobbyUpdate()` sends player list on join/disconnect/reconnect during waiting state
- Server: `startMatch()` is now public, triggered by client `start_game` message
- Protocol tests for new message types (7 tests)
- Room tests for lobby broadcast and explicit start (3 tests)

### Changed
- Server: Room no longer auto-starts when first player joins; waits for `start_game`
- Client: GameScene gets NetClient from Phaser registry (shared with LobbyScene)
- Client: `main.ts` registers both LobbyScene and GameScene, starts with lobby
- Client: NetClient supports lobby_update, match_start, and welcome handlers

## Phase 8: Deployment + Multiplayer Hardening

### Added
- Server: `config.ts` — env-driven configuration (HOST, WS_PORT, HTTP_PORT, NODE_ENV, rate limits)
- Server: `logger.ts` — structured logger with room/player correlation IDs, configurable log levels
- Server: Health endpoints: `GET /healthz` (liveness), `GET /readyz` (readiness), `GET /metrics` (per-room observability)
- Server: Tick drift instrumentation — observed tick rate, max tick duration, drift warnings
- Server: Per-connection WS rate limiting (60 msgs/sec, 5 joins/min)
- Server: Per-IP HTTP command rate limiting (30 cmds/min) with 429 responses
- Server: Graceful shutdown on SIGTERM/SIGINT (stops accepting connections, destroys rooms, flushes I/O)
- Server: Production `start` script (`pnpm --filter server start`)
- Docs: `DEPLOYMENT.md` — full deployment runbook (env vars, reverse proxy configs, hosting options, limits reference)
- Hardening test suite (12 tests)

### Changed
- Server: All `console.log` calls replaced with structured logger
- Server: WS and HTTP servers bind to configurable host (default `0.0.0.0`)
- Server: `index.ts` uses env-driven config instead of hardcoded constants
- Server: Room tracks `createdAt` timestamp and exposes `tickMetrics` getter

## Phase 7: Multiplayer Rooms + Match Lifecycle

### Added
- Server: `Room` class encapsulating per-match state (sim, AI, economy, agent, boss, players, tick loop)
- Server: `RoomManager` for creating, finding, and cleaning up rooms (max 10 rooms, 4 players each)
- Protocol: `join_room` client message with roomId, displayName, reconnectToken
- Protocol: `welcome` message now includes roomId, reconnectToken, lobby state
- Protocol: `room_error` message for join failures (room_full, room_limit_reached, already_joined)
- Protocol: `ClientMessageSchema` is now a discriminated union of `join_room` and `player_input`
- Server: Reconnect support — disconnected players have 30s to rejoin with their token
- Server: Room-scoped HTTP endpoints: `GET /rooms`, `GET /rooms/:id/summary`, `POST /rooms/:id/agent/command`
- Client: Sends `join_room` on connect, room ID from URL hash (e.g. `#my-room`, defaults to "default")
- Client: Auto-reconnect on disconnect using stored reconnectToken
- Constants: MAX_ROOMS (10), MAX_PLAYERS_PER_ROOM (4), RECONNECT_TIMEOUT_MS (30s)
- Room test suite (19 tests)

### Changed
- Server: Entry point simplified — no global sim/ai/economy, rooms manage their own tick loops
- Server: WS server uses join_room handshake instead of auto-adding players on connect
- Server: HTTP endpoints are now room-scoped (legacy `/state/summary` returns redirect hint)

## Phase 6: Polish for Playtests

### Added
- Client: `SnapshotInterpolator` — lerps entity positions between 15Hz snapshots for smooth 60fps rendering
- Client: `VFXManager` — particle burst explosions on entity death, white hit flash on damage, pulsing ring spawn telegraphs
- Client: `HUD` — phase indicator with shield status, objectives display, per-entity health bars (color-coded, hidden at full HP), victory overlay
- Client: Event detection — tracks HP changes for hit flashes, entity disappearance for death explosions
- Interpolation test suite (8 tests)

### Changed
- `game.ts` refactored: extracted `getColor()` / `getRadius()` helpers, split rendering into `detectEvents()` + `renderEntities()`, integrated interpolation pipeline

## Phase 5: Boss Fight Structure (Mothership + Phases)

### Added
- Entity kind: `mothership` added to protocol
- Constants: mothership HP (500), radius (40)
- Server: `BossManager` with phase gates, shield mechanics, win condition
- Server: Phase transitions: Phase 1 (towers shield) → Phase 2 (minions shield) → Phase 3 (vulnerable)
- Server: Shield prevents all mothership damage while active
- Server: Match ends when mothership HP reaches 0
- Snapshot schema updated with optional `phase` info (current phase, objectives, remaining, matchOver, mothershipShielded)
- HTTP `/state/summary` includes phase info
- Client: Mothership rendered as large magenta circle (r=40)

## Phase 4: Agent API (MCP-Ready)

### Added
- Zod schemas: `SpawnShipCommandSchema`, `BuildTowerCommandSchema`, `SetStrategyCommandSchema`, `AgentCommandSchema` (discriminated union)
- Server: `AgentAPI` class with command processing, rate limiting (10 cmds / 30s), budget tracking
- Server: `POST /agent/command` endpoint with Zod validation and structured responses
- Server: Enhanced `/state/summary` with strategy and agent budget info
- Agent constants: budget max, budget reset period
- Scripts: `curl_spawn_minions.sh`, `curl_build_tower.sh`

## Phase 3: Economy + Build System

### Added
- Economy constants: starting balance, income rate, unit costs, unit caps, build cooldown
- Server: `Economy` class with balance tracking, income accrual, build queue
- Server: `requestBuild()` with validation (funds, caps, queued counts)
- Server: Build queue processes on tick — spawns entities after cooldown
- Server: HTTP server on port 3001 with `GET /state/summary` endpoint
- Script: `scripts/print_summary.sh` for quick state inspection

## Phase 2: Enemy Basics (Non-LLM AI)

### Added
- Entity kinds: `minion_ship`, `tower` added to protocol
- Constants: minion/tower HP, speed, radius, fire cooldown, fire range
- Server: `AIManager` class with per-entity AI states and fire cooldowns
- Server: Minion AI — seeks nearest player, stops when close, shoots periodically
- Server: Tower AI — stationary, shoots nearest player in range
- Server: `sim.spawnEnemy()`, `sim.getEntitiesByKind()`, `sim.getEntitiesByTeam()`
- Server: `entityRadius()` extended for minion_ship and tower
- Client: Distinct colors/sizes for all entity types (player=green, minion=orange, tower=red)
- CLAUDE.md files in `/shared`, `/server`, `/client` for quick agent context
- Root CLAUDE.md updated with agent context file convention

## Phase 1: Real Game Loop, Minimal Combat

### Added
- Bullet constants: speed, radius, TTL, damage, fire cooldown
- Server: Bullet spawning from player fire input with aim angle
- Server: Bullet movement simulation with TTL and out-of-bounds removal
- Server: Circle-based collision detection (bullet vs entity)
- Server: Damage application and dead entity cleanup
- Server: Fire cooldown per player
- Client: Spacebar and mouse-click firing
- Client: Mouse-based aim angle
- `entityRadius()` helper for extensible collision radii

### Changed
- Simulation `update()` refactored into `updatePlayers()`, `updateBullets()`, `checkCollisions()`, `removeDeadEntities()`
- PlayerState now tracks `fireCooldown`

## Phase 0: Monorepo Boot + Hello Multiplayer

### Added
- Monorepo structure with `/client`, `/server`, `/shared` packages
- Shared Zod protocol schemas (`player_input`, `snapshot`)
- Shared constants (tick rate, player speed, world size)
- Server: WebSocket server with 30 Hz tick loop
- Server: Player connection/disconnection handling
- Server: Authoritative movement simulation
- Client: Phaser 3 game with Vite bundler
- Client: WebSocket client with Zod validation
- Client: Keyboard input (arrow keys) → server input messages
- Client: Snapshot rendering with entity sprites
- Phase documentation (PHASE_0 through PHASE_6)
- Dev scripts for running both client and server
