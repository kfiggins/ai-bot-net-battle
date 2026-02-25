# /shared - Shared Contracts

Single source of truth for all types, schemas, and constants used by both client and server.

## Key Files
| File | Lines | Purpose |
|---|---|---|
| `src/protocol.ts` | ~241 | Zod schemas for all wire messages, entity types, agent commands |
| `src/constants.ts` | ~165 | Game tuning: speeds, HP, radii, cooldowns, costs, world dims, XP formula |
| `src/index.ts` | ~2 | Re-exports everything |

## protocol.ts Section Map
| Lines | Section |
|---|---|
| 1-41 | Base schemas: Vec2, EntityKind enum, Upgrades, EntitySchema |
| 43-60 | Client→Server: PlayerInputData, PlayerInputMessage |
| 62-69 | Client→Server: JoinRoomMessage |
| 71-120 | Server→Client: AgentControlMode, LobbyState, WelcomeMessage, RoomError, PhaseInfo, SnapshotMessage |
| 122-162 | Agent→Server: SpawnShipCommand, BuildTowerCommand, SetStrategyCommand, AgentCommandSchema union |
| 164-188 | PlayerUpgradeMessage, StartGameMessage, LeaveRoomMessage |
| 190-241 | LobbyPlayer, LobbyUpdateMessage, MatchStartMessage, MatchEndMessage, ClientMessage/ServerMessage unions |

## constants.ts Section Map
| Lines | Section |
|---|---|
| 1-4 | Tick rate (30 Hz), snapshot rate (20 Hz) |
| 6-17 | Player: speed, HP, radius, bullet stats, recoil |
| 19-24 | Minion: speed, HP, radius, fire cooldown, fire range |
| 26-35 | Tower: HP, radius, fire stats. Missile tower: HP, radius, burst config |
| 37-42 | Missile: speed, HP, radius, TTL, damage, turn rate |
| 44-46 | Mothership: HP, radius |
| 48-70 | Economy: costs, caps, cooldowns, agent budget |
| 72-83 | World: dims (4000x4000), viewport (1024x768), grid, bullet range, tower max dist |
| 85-106 | AI: aggro/deaggro ranges, patrol config, orb collection |
| 94-117 | XP & leveling: orb XP, kill XP, max level, XP formula |
| 119-142 | Upgrades: per-stat bonuses, cannon milestones, cannon visual constants |
| 144-148 | Rooms: max rooms, max players, reconnect timeout |
| 149-165 | Nemesis boss: HP, speed, bullet/spiral/missile constants, body collision |

## Change Recipes

### Add a new entity kind
1. Add to `EntityKind` enum (L11)
2. Add any kind-specific optional fields to `EntitySchema` (L22-40)
3. Add HP, radius, speed constants to `constants.ts`

### Add a new wire message (client→server)
1. Define `FooMessageSchema` with `z.object({ v: z.literal(1), type: z.literal("foo"), ... })`
2. Add to `ClientMessageSchema` discriminated union (L224-230)
3. Export the type

### Add a new wire message (server→client)
1. Define schema same pattern
2. Add to `ServerMessageSchema` discriminated union (L233-240)

### Add a new agent command
1. Define `FooCommandSchema` with `command: z.literal("foo")`
2. Add to `AgentCommandSchema` discriminated union (L157-161)

### Add/tune a game constant
- Follow naming: `ENTITY_PROPERTY` (e.g., `NEMESIS_SPEED`, `TOWER_FIRE_RANGE`)
- Group with related constants
- Export from `constants.ts` (auto-exported via index.ts)

## Entity Kinds (current)
`player_ship`, `bullet`, `missile`, `minion_ship`, `tower`, `missile_tower`, `mothership`, `energy_orb`, `nemesis`

## Testing
- `protocol.test.ts` (~340 lines) validates all schemas accept/reject correctly
