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
- [ ] Add `energy_orb` entity kind to shared protocol
- [ ] Add XP/level constants to `/shared/src/constants.ts`
- [ ] Server: orb spawning system (constant drip, random positions, max cap)
- [ ] Server: orb pickup detection (player overlaps orb → collect, award XP)
- [ ] Server: XP tracking per player, level-up calculation with scaling curve
- [ ] Server: full XP/level reset on player death
- [ ] Protocol: include `level` and `xp` fields in snapshot for each player entity
- [ ] Client: render energy orbs (small glowing circles)
- [ ] Client: XP bar + level indicator in HUD
- [ ] Client: level-up visual feedback (flash or pulse)
- [ ] Tests for orb spawning, pickup, XP scaling, level-up, death reset

## Key Files to Create/Modify
- `/shared/src/protocol.ts` - Add `energy_orb` kind, player `level`/`xp`/`xpToNext` fields in snapshot
- `/shared/src/constants.ts` - Orb and XP/leveling constants
- `/server/src/sim.ts` - Orb spawning, pickup collision, XP tracking, level calculation
- `/server/src/room.ts` - Hook orb system into tick loop
- `/client/src/game.ts` - Render orbs, show XP bar and level in HUD
- `/client/src/ui.ts` - XP bar component, level-up effects

## New Constants
```typescript
// Energy Orbs
export const ORB_RADIUS = 8;            // pixels
export const ORB_XP_VALUE = 5;          // XP per orb collected
export const ORB_SPAWN_INTERVAL_TICKS = 15;  // spawn 1 orb every 0.5s
export const ORB_MAX_ON_MAP = 150;      // cap to prevent endless buildup
export const ORB_SPAWN_PADDING = 100;   // pixels from world edge

// XP & Leveling
export const MAX_LEVEL = 15;
export const XP_BASE = 10;              // XP needed for level 1→2
export const XP_SCALING = 1.5;          // exponent for scaling curve
// Formula: xpToNext(level) = floor(XP_BASE * level^XP_SCALING)
// Level 1→2:  10 XP  (2 orbs)
// Level 2→3:  28 XP  (6 orbs)
// Level 3→4:  52 XP  (11 orbs)
// Level 5→6:  112 XP (23 orbs)
// Level 10→11: 316 XP (64 orbs)
// Level 14→15: 524 XP (105 orbs)
// Early levels fly by, late levels require real commitment.

// Milestone levels (cannon upgrades — handled in Phase 14)
export const MILESTONE_LEVELS = [5, 10, 15];
```

## Entity: Energy Orb
```typescript
// New entity kind added to EntityKind union
kind: "energy_orb"
// Orbs are stationary (vel: {x:0, y:0}), team: 0 (neutral), hp: 1
// Radius: ORB_RADIUS (8px)
// No TTL — persist until collected or map is full
```

## Implementation Notes

### Orb Spawning (Server)
- Every `ORB_SPAWN_INTERVAL_TICKS`, if current orb count < `ORB_MAX_ON_MAP`, spawn one orb
- Random position: `(random(PADDING, WORLD_WIDTH - PADDING), random(PADDING, WORLD_HEIGHT - PADDING))`
- Orbs are neutral (team 0) — no collision with bullets, only with player ships
- Orbs don't move, don't take damage, don't interact with AI

### Orb Pickup (Server)
- In the collision check phase, test player_ship vs energy_orb overlap
- On overlap: remove orb (hp → 0), award `ORB_XP_VALUE` XP to that player
- Only team 1 (players) can collect orbs

### XP & Level Tracking (Server)
- Each player entity gets: `xp: number`, `level: number`, `xpToNext: number`
- `xpToNext(level) = floor(XP_BASE * level^XP_SCALING)`
- When `xp >= xpToNext`: level up, subtract xpToNext from xp, recalculate xpToNext
- Handle multiple level-ups from a single orb (loop until xp < xpToNext)
- At `MAX_LEVEL`, stop accumulating XP
- Track pending upgrade points (used in Phase 14)

### Death Reset
- On player death: reset `xp = 0`, `level = 1`, `xpToNext = XP_BASE`
- Clear all upgrades (will matter more in Phase 14)
- Player respawns at level 1 fresh

### Snapshot Changes
- Player entities in snapshot include: `level`, `xp`, `xpToNext`
- Other entity kinds don't need these fields
- Energy orbs appear in the entity list like any other entity

### Client Rendering
- **Orbs**: Small glowing circle (radius 8), bright cyan/teal color (#00ffcc), subtle pulse animation
- **XP Bar**: Horizontal bar at bottom of screen, fills left→right as XP progresses toward next level
- **Level Badge**: "Lv. X" text near the XP bar or player's ship
- **Level-Up Flash**: Brief screen flash or ring animation when leveling up

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
2. See energy orbs scattered across the map (small glowing circles)
3. Fly over an orb — it disappears, XP bar fills slightly
4. Collect several orbs quickly — watch level counter increase (fast at first)
5. Check that orbs keep spawning over time (constant drip)
6. Die to an enemy — confirm level resets to 1 and XP bar empties
7. Respawn and collect orbs again — leveling starts over from scratch
8. Verify orbs don't exceed the max cap (no lag from thousands of orbs)

## After This Phase
- Phase 14 adds the upgrade tree: stat upgrades per level + cannon milestones at 5/10/15
