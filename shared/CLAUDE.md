# /shared - Shared Contracts

Single source of truth for all types, schemas, and constants used by both client and server.

## Key Files
- `src/protocol.ts` - Zod schemas for all wire messages and entity types. If it compiles and Zod validates, the world is consistent.
- `src/constants.ts` - Game tuning values (speeds, HP, radii, cooldowns, world dimensions)
- `src/index.ts` - Re-exports everything

## Rules
- **Every wire message** must have a `v` (version) and `type` field
- **Zod schemas are the contract** - client and server both validate against them
- Entity kinds: `player_ship`, `bullet`, `minion_ship`, `tower` (more added per phase)
- Entity model: `{ id, kind, pos, vel, hp, team }`
- Add new entity kinds to `EntityKind` enum in protocol.ts
- Add new constants to constants.ts with clear naming

## Testing
- `shared/src/protocol.test.ts` validates all schemas accept/reject correctly
