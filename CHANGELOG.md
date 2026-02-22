# Changelog

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
