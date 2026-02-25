# /server - Authoritative Game Server

Node.js + TypeScript server that owns all game state. The client is just a renderer.

## Key Files
| File | Lines | Purpose |
|---|---|---|
| `src/sim.ts` | ~805 | Core simulation: players, bullets, missiles, collisions, XP, upgrades, respawning |
| `src/room.ts` | ~409 | Room class: per-match state, tick loop, lobby, reconnect, snapshot broadcast |
| `src/ai.ts` | ~350 | AI behavior: minion patrol/chase/fire, tower fire, missile tower bursts |
| `src/boss.ts` | ~327 | Boss fight: mothership phases, shield, death sequence, Nemesis AI |
| `src/ws.ts` | ~241 | WebSocket server: join_room, input routing, reconnect, rate limiting |
| `src/http.ts` | ~232 | HTTP endpoints: healthz, metrics, rooms, agent commands |
| `src/agent.ts` | ~199 | Agent API: command validation, budget, spawn/build/strategy handling |
| `src/economy.ts` | ~167 | Economy: balance, income, build queue, cost/cap validation |
| `src/fake-ai.ts` | ~87 | Built-in AI: auto-spawns towers/minions when not using external agent |
| `src/room-manager.ts` | ~53 | Room lifecycle: create/find/cleanup rooms |
| `src/logger.ts` | ~57 | Structured logger with correlation IDs |
| `src/config.ts` | ~39 | Env-driven config (ports, rate limits) |
| `src/index.ts` | ~54 | Entry point, graceful shutdown |

## sim.ts Section Map
| Lines | Section |
|---|---|
| 1-62 | Imports + constants from shared |
| 64-95 | Interfaces: PlayerState, BulletState, MissileState |
| 96-106 | Simulation class fields (entities, players, bullets, missiles maps) |
| 109-160 | `addPlayer()`, `removePlayer()`, `setInput()` |
| 162-183 | `spawnEnemy()`, `getEntitiesByKind()`, `getEntitiesByTeam()` |
| 188-200 | `update()` — tick entry point, calls all subsystems in order |
| 202-254 | Orb spawning + `initOrbs()` + `collectOrbForEnemy()` |
| 256-323 | `checkOrbPickups()`, `awardXP()`, `applyUpgrade()` |
| 325-353 | `respawnDeadPlayers()` — reset level/upgrades on death |
| 355-407 | `updatePlayers()` — movement, recoil, firing |
| 409-461 | `fireMultiCannon()`, `spawnBullet()` |
| 463-482 | `spawnMissile()` |
| 484-576 | `updateBullets()`, `updateMissiles()` (TTL, homing, out-of-bounds) |
| 578-643 | `checkCollisions()` (bullet→entity, missile→entity), `awardKillXP()` |
| 645-689 | Body collision cooldowns + `checkBodyCollisions()` |
| 691-741 | `removeDeadEntities()`, `getSnapshot()` |
| 744-805 | Helpers: `playerSpawnPosition()`, `entityRadius()`, `getEffectiveMaxHp()`, `getCannonAngles()`, `circlesOverlap()` |

## room.ts Section Map
| Lines | Section |
|---|---|
| 1-40 | Imports, RoomPlayer/TickMetrics interfaces |
| 41-74 | Room class fields (sim, ai, economy, agent, boss, fakeAI, players) |
| 76-129 | `getLobbyState()`, `addPlayer()` |
| 131-206 | `reconnectPlayer()`, `disconnectPlayer()`, `removePlayer()`, `cleanupDisconnected()` |
| 208-281 | `startMatch()`, `resetToLobby()` |
| 283-299 | `initGameState()` — spawns mothership + initial enemies |
| 301-363 | `startTickLoop()` — 30Hz: sim → ai → economy → agent → fakeAI → boss |
| 367-409 | `broadcastLobbyUpdate()`, `broadcastSnapshot()`, `destroy()`, `isEmpty()` |

## Change Recipes

### Add a new entity kind
1. Add to `spawnEnemy()` (or create new spawn method)
2. Add radius case to `entityRadius()`
3. If it has AI: add update logic in `ai.ts` → `update()` method
4. If it collides differently: modify `checkCollisions()` or `checkBodyCollisions()`

### Add a new player ability
1. Add input field to `PlayerInputData` in shared/protocol.ts
2. Handle in `updatePlayers()` in sim.ts
3. Add cooldown/state field to `PlayerState` interface (top of sim.ts)

### Add a new agent command
1. Define Zod schema in shared/protocol.ts, add to `AgentCommandSchema` union
2. Add handler method in `agent.ts` → `processCommand()` switch
3. HTTP endpoint already routes to `agent.processCommand()` — no http.ts changes needed

### Modify tick loop order
Edit `room.ts` → `startTickLoop()` (L301-363). Current order:
`sim.update()` → `ai.update()` → `economy.update()` → `agent.update()` → `fakeAI.update()` → `boss.update()`

## Testing
| Test File | Lines | Covers |
|---|---|---|
| `sim.test.ts` | ~1735 | Movement, bullets, collisions, snapshots, XP, upgrades, respawn |
| `ai.test.ts` | ~686 | Seeking, firing, cooldowns, patrol, cleanup |
| `room.test.ts` | ~386 | Create/join/leave, reconnect, cleanup, isolation |
| `agent.test.ts` | ~326 | Commands, rate limiting, validation, budget |
| `boss.test.ts` | ~292 | Shield, phase transitions, win condition, Nemesis |
| `economy.test.ts` | ~237 | Income, build requests, validation, queue processing |
| `hardening.test.ts` | ~129 | Config, logger, tick metrics |
