# AI Bot Net Battle - Agent Instructions

## Project Overview
A multiplayer browser game where players fight enemy ships, towers, and a mothership boss. An external AI agent (via MCP/HTTP) can play as an RTS commander managing economy, spawning units, and setting strategy.

## Repo Layout
```
/client   - Phaser + TypeScript + Vite (renderer + input)
/server   - Node + TypeScript (authoritative simulation)
/shared   - Zod schemas, types, constants (single source of truth)
/docs     - Phase notes, message contracts, runbooks
/scripts  - Dev/test utility scripts
```

## Development Workflow

### Phase-Based Development
Work is organized into phases (see `/docs/PHASE_X.md` files). Each phase doc contains:
- What exists so far
- How to run the project
- What to implement next
- Message contracts involved
- A 60-second smoke test

### After Each Phase
1. **Write tests** for the phase deliverables
2. **Run tests** and ensure they all pass: `pnpm test`
3. **Review and refactor** the code for clarity and correctness
4. **Re-run tests** after refactoring to confirm nothing broke
5. **Commit changes** with a clear message describing the phase work

### Commands
- `pnpm dev` - Start both client and server in dev mode
- `pnpm test` - Run all tests
- `pnpm build` - Build all packages

## Architecture Rules

### Server Authority (Non-Negotiable)
- Client is a **renderer + input device only**
- Server owns: tick loop, spawning, economy, win/lose, collisions, damage
- Client sends "intent" inputs (move vector, firing boolean, aim angle)
- Server sends authoritative state snapshots

### Shared Contracts (Non-Negotiable)
- Use **Zod schemas** in `/shared` to validate all messages
- Every wire message has a `type` field and versioning (`v: 1`)
- Message types: `"player_input"`, `"snapshot"`, `"agent_command"`, etc.
- If `shared/protocol.ts` compiles and Zod validates, the world is consistent

### Entity Model
Every entity has: `id`, `kind`, `pos`, `vel`, `hp`, `team`
Deterministic update order in the tick loop.

### Networking
- Server tick: 30 Hz simulation
- Snapshot broadcast: 10-20 Hz
- Client interpolates between snapshots

## Conventions
- TypeScript strict mode everywhere
- Zod for all runtime validation
- Keep physics simple: circles/rects
- No client-side game state cheating
- CHANGELOG.md tracks what changed per phase

## Agent Context Files
Each major directory has its own `CLAUDE.md` with package-specific context:
- `/shared/CLAUDE.md` - Schema conventions, entity model, how to add new types
- `/server/CLAUDE.md` - Simulation architecture, update order, key classes
- `/client/CLAUDE.md` - Rendering approach, input handling, sprite management

These files are kept up-to-date as each phase is completed so any agent can quickly understand the codebase.

## Current Phase
Check `/docs/` for the latest PHASE_X.md to understand current progress.
