# AI Bot Net Battle - Agent Instructions

## Project Overview
A multiplayer browser game where players fight enemy ships, towers, and a mothership boss. An external AI agent (via MCP/HTTP) can play as an RTS commander managing economy, spawning units, and setting strategy.

## Repo Layout
```
/client   - Phaser + TypeScript + Vite (renderer + input)
/server   - Node + TypeScript (authoritative simulation)
/shared   - Zod schemas, types, constants (single source of truth)
/docs     - ARCHITECTURE.md (current state) + historical phase notes
/scripts  - Dev/test utility scripts
```

## Quick Context Loading

1. **Start here**: Read `docs/ARCHITECTURE.md` for current game state, entities, flow, and systems
2. **Then read** the relevant package `CLAUDE.md` for the area you're changing (server/, client/, or shared/)
3. **Do NOT** read `docs/PHASE_*.md` files — they are historical build logs, not implementation references

## Task Routing — What to Read for Common Changes

### Adding a new entity kind
1. `shared/src/protocol.ts` — add to `EntityKind` enum + `EntitySchema` fields
2. `shared/src/constants.ts` — add HP, radius, speed, etc.
3. `server/src/sim.ts` — add to `spawnEnemy()`, `entityRadius()`, collision logic
4. `server/src/ai.ts` — add AI behavior in `update()` if it has AI
5. `client/src/game.ts` — add to `getColor()` and `getRadius()`
6. `client/src/ui.ts` — add to `getMaxHp()` and `getBarOffset()` for health bars

### Adding a new wire message
1. `shared/src/protocol.ts` — define Zod schema + add to `ClientMessageSchema` or `ServerMessageSchema` union
2. `server/src/ws.ts` — handle the message type in `ws.on("message")` handler
3. `client/src/net.ts` — send it (client→server) or handle it (server→client)

### Modifying physics / collision
1. `server/src/sim.ts` — `checkCollisions()` (L578-622), `checkBodyCollisions()` (L660-689)
2. `shared/src/constants.ts` — damage values, radii, speeds

### Changing player mechanics (movement, firing, upgrades)
1. `server/src/sim.ts` — `updatePlayers()` (L355-407), `fireMultiCannon()` (L409-423), `applyUpgrade()` (L305-323)
2. `shared/src/constants.ts` — speed, damage, cooldown, upgrade values
3. `client/src/game.ts` — client prediction in `update()` (L160-174) if movement changes

### Modifying boss fight
1. `server/src/boss.ts` — all boss logic (phases, shield, nemesis AI, death sequence)
2. `shared/src/constants.ts` — NEMESIS_* and MOTHERSHIP_* constants

### Changing enemy AI behavior
1. `server/src/ai.ts` — minion chase/patrol/fire, tower fire, missile tower bursts
2. `shared/src/constants.ts` — aggro range, patrol radius, fire ranges

### Modifying economy / agent API
1. `server/src/economy.ts` — balance, income, build queue, cost validation
2. `server/src/agent.ts` — command processing, budget tracking
3. `server/src/http.ts` — HTTP endpoint routing
4. `shared/src/constants.ts` — costs, caps, budget limits

### Changing HUD / UI
1. `client/src/ui.ts` — HUD class (health bars, XP bar, upgrades, phase display, victory)
2. `client/src/vfx.ts` — visual effects (explosions, flashes, telegraphs, missile trails)

### Changing lobby / room flow
1. `client/src/lobby.ts` — LobbyScene (player list, mode toggle, start button)
2. `client/src/name-entry.ts` — NameEntryScene (callsign input)
3. `server/src/room.ts` — Room class (match lifecycle, lobby, tick loop)
4. `server/src/ws.ts` — join_room/start_game/leave_room handling

## Development Workflow

### Commands
- `pnpm dev` - Start both client and server in dev mode
- `pnpm test` - Run all tests
- `pnpm build` - Build all packages

### After Each Change
1. **Write tests** for the deliverables
2. **Run tests** and ensure they all pass: `pnpm test`
3. **Review and refactor** the code for clarity and correctness
4. **Re-run tests** after refactoring to confirm nothing broke
5. **Commit changes** with a clear message describing the work

## Architecture Rules

### Server Authority (Non-Negotiable)
- Client is a **renderer + input device only**
- Server owns: tick loop, spawning, economy, win/lose, collisions, damage
- Client sends "intent" inputs (move vector, firing boolean, aim angle)
- Server sends authoritative state snapshots

### Shared Contracts (Non-Negotiable)
- Use **Zod schemas** in `/shared` to validate all messages
- Every wire message has a `type` field and versioning (`v: 1`)
- If `shared/protocol.ts` compiles and Zod validates, the world is consistent

### Entity Model
Every entity has: `id`, `kind`, `pos`, `vel`, `hp`, `team`
Deterministic update order in the tick loop.

## Conventions
- TypeScript strict mode everywhere
- Zod for all runtime validation
- Keep physics simple: circles
- No client-side game state cheating
- CHANGELOG.md tracks what changed per phase

## Keeping Docs Updated
When you complete a feature, update:
1. `docs/ARCHITECTURE.md` — if entities, game flow, or systems changed
2. The relevant package `CLAUDE.md` — if file structure or line ranges shifted significantly
