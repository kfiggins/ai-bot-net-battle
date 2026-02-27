# Architecture — Current State

> This is the **living reference** for how the game works RIGHT NOW.
> Phase docs (`PHASE_*.md`) are historical — do NOT read them for implementation context.

## Game Overview

Multiplayer browser game: 1-8 players cooperate to destroy enemy towers, minions, a mothership boss, and a final Nemesis boss. An AI agent (external HTTP or built-in fake AI) manages the enemy economy — spawning minions and building towers.

## Entity Kinds

| Kind | Team | HP | Radius | Moves? | Notes |
|---|---|---|---|---|---|
| `player_ship` | 1 | 100 (+ upgrades) | 16 | yes | WASD/arrows, mouse aim, space/click fire |
| `bullet` | any | 1 | 4 | yes | TTL 120 ticks, max range 600px, 10 dmg base |
| `missile` | any | 1 | 6 | yes | Homing, TTL 480 ticks, 15 dmg, turn rate 2.5 rad/s |
| `minion_ship` | 2 | 30 | 12 | yes | AI: patrol/chase/return, collects orbs, fires bullets |
| `tower` | 2 | 100 | 20 | no | Fires bullets at players in 900px range |
| `missile_tower` | 2 | 150 | 24 | no | Fires 3-missile bursts at players in 700px range |
| `mothership` | 2 | 500 | 40 | no | Center of map, shielded until towers/minions cleared |
| `nemesis` | 2 | 1200 | 38 | yes | Spawns after mothership dies, chases players, spiral bullets + homing missiles |
| `phantom_ship` | 2 | 20 | 10 | yes | Fast flanker — orbits mothership, approaches from far side, predictive burst fire, dodges player aim |
| `sub_base` | 2 | 300 | 30 | no | 4 diagonal structures ~700px from mothership, shielded while its towers live, provides population bonuses |
| `energy_orb` | 0 | 1 | 8 | no | Neutral, gives 5 XP to players or 10 resources to enemy |

## Game Flow (Boss Phases)

1. **Phase 1**: Destroy all towers and sub-bases — mothership shielded while ANY tower exists (including sub-base towers). Sub-bases are shielded while their own towers are alive. AI rebuilds towers around living sub-bases, so players must destroy sub-bases to stop tower rebuilding.
2. **Phase 2**: Destroy all minions — mothership shielded while minions alive
3. **Phase 3**: Destroy the mothership — now vulnerable
4. **Mothership Death Sequence**: 2-second bullet ring barrage (6 rings of 12 bullets)
5. **Phase 4 (Nemesis)**: Defeat the Nemesis boss — chases players, spiral fire + missiles
6. **Victory**: Nemesis destroyed → `matchOver = true`

### Sub-Base System
- 4 sub-bases at diagonal positions (~700px from mothership center)
- Each starts with 1 regular tower + 1 missile tower (shielded while towers alive)
- Each alive sub-base adds +5 minion cap and +1 phantom cap
- AI can rebuild towers around living sub-bases (up to 2 per sub-base, any tower type mix)
- Destroying a sub-base permanently removes its population bonus and tower slots
- Strategic choice: players must decide which sub-bases to attack first

## Player Progression

- **XP sources**: Energy orbs (5 XP), minion kills (10 XP), tower kills (25 XP), nemesis kill (500 XP to all)
- **Max level**: 15, XP formula: `floor(10 * level^1.5)`
- **Stat upgrades** (4 types, max 5 each): damage (+3), speed (+25 px/s), health (+20 HP), fire_rate (-1 tick cooldown)
- **Cannon milestones** (auto): level 5 → 2 cannons, level 10 → 3, level 15 → 4
- **On death**: Player respawns with level/upgrades reset to 1

## Server Tick Loop (30 Hz)

```
sim.update()           // players → bullets → missiles → collisions → body collisions → orb pickups → remove dead → respawn
ai.update(sim)         // minion patrol/chase/fire, tower fire, missile tower bursts
economy.update(sim,ai) // accrue income, collect minion orb resources, process build queue
agent.update(sim)      // reset budget if window expired
fakeAI.update(...)     // (if builtin mode) auto-spawn minions/towers
boss.update(sim)       // shield enforcement, phase transitions, mothership death sequence, nemesis AI
```

Snapshots broadcast every `SNAPSHOT_INTERVAL` ticks (~20 Hz).

## Economy (Enemy Side)

- Starting balance: 200, income: 10/s, plus minion orb collection (10 per orb)
- **Unit costs**: minion 50, tower 100, missile_tower 125, phantom 65
- **Unit caps**: minion 20 (+5 per alive sub-base), tower 10, missile_tower 5, phantom 5 (+1 per alive sub-base)
- **Build cooldown**: 0.5s queue delay
- **Tower placement**: Must be within 500px of mothership OR 250px of an alive sub-base

## Agent API

External agent sends HTTP POST to `/rooms/:roomId/agent/command`:
- `spawn_ship` — spawn 1-5 minions in a lane (top/mid/bottom)
- `build_tower` — place tower at x,y
- `set_strategy` — aggressive/defensive/balanced (stored, not yet gameplay-affecting)
- **Budget**: 10 commands per 30-second window

## Wire Protocol

All messages: `{ v: 1, type: "...", ... }` validated with Zod schemas.

**Client → Server**: `player_input`, `join_room`, `start_game`, `leave_room`, `player_upgrade`
**Server → Client**: `welcome`, `room_error`, `snapshot`, `lobby_update`, `match_start`, `match_end`
**Agent → Server**: `agent_command` (via HTTP)

## Client Scenes

1. **NameEntryScene** → enter callsign → **LobbyScene** → start game → **GameScene**
2. On leave/disconnect → back to NameEntryScene
3. On match end → back to LobbyScene (via `match_end` message)

## Client Rendering

- Phaser 3 circles for all entities, colored by kind
- Client-side prediction for local player movement (reconciled against server snapshots)
- Snapshot interpolation (lerp between last two snapshots, extrapolate up to 0.5x interval)
- Cannon barrel rectangles rendered per aim angle
- VFX: death explosions, hit flashes, spawn telegraphs, missile trails, mothership chain explosions
- HUD: phase/shield status, objectives, health bars, XP bar, upgrade panel, debug overlay

## Networking

- WS on port 3000 (configurable), HTTP on port 3001
- Room-based: join via `join_room` with roomId (from URL hash, default "default")
- Reconnect: 30s window with token
- Rate limits: 60 msg/s WS, 5 joins/min, 30 HTTP commands/min/IP
- Max 10 rooms, 8 players per room

## World

- 4000x4000 px map
- Players spawn in ring 1500-1800px from center
- Mothership at center (2000, 2000)
- Viewport: 1024x768, camera follows player
