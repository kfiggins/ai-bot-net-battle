# Phase 13: Energy Orbs & XP/Leveling System

## Goal
Add collectible energy orbs scattered across the map. Players fly over them to collect XP. XP feeds a leveling system (max level 15) with a scaling curve — early levels come fast, later levels take real effort. Dying resets all progress (full Agar.io-style stakes).

## What Exists (from Phase 12)
- 4000×4000 world with camera follow, grid background
- Server-authoritative simulation at 30Hz
- Entity system with kinds: player_ship, bullet, minion_ship, tower, missile_tower, missile, mothership
- Snapshot broadcasting at 20Hz with client interpolation
- Player spawning, death, and respawn flow
- Zod-validated protocol in `/shared`

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Add `energy_orb` entity kind to shared protocol
- [x] Add XP/level constants to `/shared/src/constants.ts`
- [x] Server: orb spawning system (constant drip, random positions, max cap)
- [x] Server: orb pickup detection (player overlaps orb → collect, award XP)
- [x] Server: XP tracking per player, level-up calculation with scaling curve
- [x] Server: full XP/level reset on player death
- [x] Protocol: include `level` and `xp` fields in snapshot for each player entity
- [x] Client: render energy orbs (small glowing circles)
- [x] Client: XP bar + level indicator in HUD
- [x] Client: level-up visual feedback (flash or pulse)
- [x] Tests for orb spawning, pickup, XP scaling, level-up, death reset

### Phase 13 Additions (beyond original plan)
- [x] **Initial orb seeding**: `sim.initOrbs()` pre-seeds `ORB_INITIAL_COUNT` (100) orbs at match start so the map isn't empty at the opening
- [x] **Kill XP**: Killing enemy units awards XP — `MINION_KILL_XP` (10) for minion_ship, `TOWER_KILL_XP` (25) for tower/missile_tower
- [x] **Minion orb collection**: Enemy minions collect energy orbs while patrolling, converting each to `MINION_ORB_RESOURCE` (10) enemy economy resources via `sim.pendingEnemyResources`
- [x] **Enemy economy drain**: `Economy.update()` drains `sim.pendingEnemyResources` into the enemy balance each tick
- [x] Orb spawning simplified to **fully random** positions (removed player-bias that caused orb clustering)

## Key Files Created/Modified
- `/shared/src/protocol.ts` — Added `energy_orb` kind, player `level`/`xp`/`xpToNext` fields in snapshot
- `/shared/src/constants.ts` — Orb and XP/leveling constants
- `/server/src/sim.ts` — Orb spawning, `initOrbs()`, `collectOrbForEnemy()`, orb pickup collision, XP tracking, level calculation, kill XP via `awardKillXP()`
- `/server/src/room.ts` — `sim.initOrbs()` called on match start and reset
- `/server/src/economy.ts` — Drains `pendingEnemyResources` into balance
- `/client/src/game.ts` — Renders orbs, XP bar and level in HUD

## Constants (actual values)
```typescript
// Energy Orbs
export const ORB_RADIUS = 8;
export const ORB_XP_VALUE = 5;           // XP per orb player collects
export const ORB_SPAWN_INTERVAL_TICKS = 15;  // spawn 1 orb every 0.5s
export const ORB_MAX_ON_MAP = 200;       // cap to prevent endless buildup
export const ORB_SPAWN_PADDING = 100;    // pixels from world edge
export const ORB_INITIAL_COUNT = 100;    // orbs pre-seeded at match start

// Kill XP
export const MINION_KILL_XP = 10;        // XP awarded for killing a minion_ship
export const TOWER_KILL_XP = 25;         // XP awarded for killing a tower/missile_tower

// Minion orb collection (enemy economy)
export const MINION_ORB_RESOURCE = 10;   // mothership resources per orb collected
export const MINION_ORB_PICKUP_RANGE = 20; // pixels (minion radius + orb radius)

// XP & Leveling
export const MAX_LEVEL = 15;
export const XP_BASE = 10;
export const XP_SCALING = 1.5;
// Formula: xpToNext(level) = floor(XP_BASE * level^XP_SCALING)
// Level 1→2:  10 XP  (2 orbs)
// Level 2→3:  28 XP  (6 orbs)
// Level 5→6:  112 XP (23 orbs)
// Level 10→11: 316 XP (64 orbs)
// Level 14→15: 524 XP (105 orbs)

export const MILESTONE_LEVELS = [5, 10, 15];
```

## Entity: Energy Orb
```typescript
kind: "energy_orb"
// Stationary (vel: {x:0, y:0}), team: 0 (neutral), hp: 1
// Radius: ORB_RADIUS (8px)
// No TTL — persists until collected
```

## Implementation Notes

### Orb Spawning (Server)
- Every `ORB_SPAWN_INTERVAL_TICKS`, if current orb count < `ORB_MAX_ON_MAP`, spawn one orb at a fully random position within world bounds (padded by `ORB_SPAWN_PADDING`)
- `initOrbs()` pre-seeds 100 orbs at match start
- Orbs are neutral (team 0) — only collected by player ships (and enemy minions while patrolling)

### Orb Pickup (Server)
- In the collision check phase, test player_ship vs energy_orb overlap
- On overlap: remove orb (hp → 0), award `ORB_XP_VALUE` XP to that player

### Minion Orb Collection (Server)
- During `updateMinionPatrol()`, minions check for orbs within `MINION_ORB_PICKUP_RANGE`
- On contact: `sim.collectOrbForEnemy(orbId)` marks orb dead and adds `MINION_ORB_RESOURCE` to `sim.pendingEnemyResources`
- `Economy.update()` drains pending resources into enemy balance each tick

### Kill XP (Server)
- `awardKillXP(ownerEntityId, killedKind)` called when a bullet/missile kills an enemy
- `minion_ship` → 10 XP, `tower`/`missile_tower` → 25 XP
- XP awarded to the player who fired the killing shot

### XP & Level Tracking (Server)
- Each player tracks: `xp`, `level`, `xpToNext`
- When `xp >= xpToNext`: level up, subtract xpToNext, recalculate — handles multi-level in one shot
- At `MAX_LEVEL`, no further XP accumulation
- Pending upgrade points tracked for Phase 14

### Death Reset
- `xp = 0`, `level = 1`, `xpToNext = XP_BASE`

## XP Curve Reference Table
| Level | XP to Next | Cumulative XP | Orbs Needed (cumul.) |
|-------|-----------|---------------|---------------------|
| 1→2   | 10        | 10            | 2                   |
| 2→3   | 28        | 38            | 8                   |
| 3→4   | 52        | 90            | 18                  |
| 4→5   | 80        | 170           | 34                  |
| 5→6   | 112       | 282           | 57                  |
| 6→7   | 147       | 429           | 86                  |
| 7→8   | 185       | 614           | 123                 |
| 8→9   | 226       | 840           | 168                 |
| 9→10  | 269       | 1109          | 222                 |
| 10→11 | 316       | 1425          | 285                 |
| 11→12 | 364       | 1789          | 358                 |
| 12→13 | 415       | 2204          | 441                 |
| 13→14 | 469       | 2673          | 535                 |
| 14→15 | 524       | 3197          | 640                 |

## 60-Second Smoke Test
1. Run `pnpm dev` and start a match
2. See 100 energy orbs pre-seeded across the map at game start
3. Fly over an orb — it disappears, XP bar fills slightly
4. Kill a minion — XP bar jumps by 10; kill a tower — jumps by 25
5. Collect several orbs quickly — watch level counter increase
6. Die to an enemy — confirm level resets to 1 and XP bar empties
7. Respawn and re-level — confirms orbs keep spawning over time
8. Watch enemy minions collect orbs while patrolling between attacks

## After This Phase
- Phase 14 adds the upgrade tree: stat upgrades per level + cannon milestones at 5/10/15 ✅ (complete)
