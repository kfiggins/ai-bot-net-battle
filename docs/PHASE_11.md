# Phase 11: Combat Ranges & Enemy AI Patrol

## Goal
Tune gameplay for the larger map: give bullets a max range, constrain tower placement near the mothership, and add aggro-based enemy AI so minion ships patrol instead of endlessly chasing across the entire map.

## What Exists (from Phase 10)
- 4000×4000 world with follow camera, grid background, visible boundaries
- Mothership at map center, players spawn near edges
- Minion ships chase nearest player across entire map
- Bullets have TTL (90 ticks / 3 seconds) but no explicit distance cap
- Towers can be spawned anywhere on the map
- All stats are constants in `/shared/src/constants.ts`

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Add `BULLET_MAX_RANGE` constant — despawn bullets that travel beyond this distance from their spawn point
- [ ] Add `TOWER_MAX_SPAWN_DISTANCE` constant — reject tower builds too far from mothership
- [ ] Add `ENEMY_AGGRO_RANGE` constant — minion ships only chase players within this radius
- [ ] Add `ENEMY_PATROL_RADIUS` constant — idle minions wander randomly near the mothership
- [ ] Implement idle patrol behavior: minions pick random waypoints near mothership and drift between them
- [ ] Transition smoothly between patrol → chase → patrol (no teleporting or jerky switches)
- [ ] Agent API tower build validates distance constraint (returns error if too far)
- [ ] Tests for bullet range despawn, tower distance validation, aggro/patrol transitions

## Key Files to Create/Modify
- `/shared/src/constants.ts` - New range/distance constants
- `/server/src/sim.ts` - Track bullet spawn position, despawn on max range exceeded
- `/server/src/ai.ts` - Aggro range check, patrol state machine, waypoint wandering
- `/server/src/economy.ts` - Validate tower spawn distance from mothership
- `/server/src/boss.ts` - Expose mothership position for distance checks

## New Constants
```typescript
// Bullet range
export const BULLET_MAX_RANGE = 600; // pixels from spawn point

// Tower placement
export const TOWER_MAX_SPAWN_DISTANCE = 500; // max pixels from mothership

// Enemy AI
export const ENEMY_AGGRO_RANGE = 700;   // pixels — start chasing when player enters
export const ENEMY_DEAGGRO_RANGE = 900;  // pixels — stop chasing when player leaves (hysteresis)
export const ENEMY_PATROL_RADIUS = 400;  // pixels — wander radius around mothership
export const ENEMY_PATROL_SPEED = 60;    // pixels/second — slower than chase speed
```

## Implementation Notes

### Bullet Max Range
- When a bullet is spawned, record its origin position (could be a new field on the entity or tracked in a side map)
- Each tick, compute distance from origin; if > `BULLET_MAX_RANGE`, set hp to 0 (despawn)
- Keep TTL as a secondary safety net — range is the primary limiter now
- At 500 px/s speed and 600px range, bullets live ~1.2 seconds (shorter than old 3s TTL)

### Tower Spawn Distance
- On `build_tower` command, compute distance from requested position to mothership position
- If distance > `TOWER_MAX_SPAWN_DISTANCE`, reject with error message
- If no position specified (random), generate random position within the allowed radius
- This creates a "defended base" zone around the mothership

### Enemy AI: Aggro + Patrol State Machine
Each minion has two states:

**Patrol (idle):**
- Pick a random waypoint within `ENEMY_PATROL_RADIUS` of the mothership
- Move toward it at `ENEMY_PATROL_SPEED` (slower than chase)
- On arrival (or after a timer), pick a new random waypoint
- Do not fire while patrolling

**Chase (aggro):**
- Triggered when any player is within `ENEMY_AGGRO_RANGE` of the minion
- Use existing seek/strafe/fire behavior (unchanged)
- Continue chasing until all players are beyond `ENEMY_DEAGGRO_RANGE`
- Hysteresis (aggro at 700, deaggro at 900) prevents flickering at the boundary

**Transitions:**
- Patrol → Chase: nearest player distance < `ENEMY_AGGRO_RANGE`
- Chase → Patrol: nearest player distance > `ENEMY_DEAGGRO_RANGE`
- On transition back to patrol, pick a new waypoint toward the mothership

### Why Hysteresis?
Without it, a player hovering at exactly 700px would cause minions to flicker between chase and patrol every tick. The 200px gap ensures clean transitions.

## 60-Second Smoke Test
1. Run `pnpm dev` and start a match
2. Fly toward the mothership — at ~700px away, minion ships start chasing you
3. Fly away from the mothership — minions stop chasing and drift back to patrol
4. Watch idle minions near the mothership — they wander around, not standing still
5. Shoot bullets — they disappear after traveling ~600px (well before crossing the map)
6. Use agent API to build a tower at (100, 100) — should be rejected (too far from mothership)
7. Build a tower near the mothership — should succeed
8. Check that combat still works normally within range (no regressions)

## Notes
- All new constants are designed to be upgradeable later (player progression, agent strategy).
- The patrol behavior makes the mothership area feel alive even when no players are nearby.
- Bullet range is intentionally short — it forces players to get close, creating risk/reward tension.
- Tower constraint creates a visual "base" around the mothership that players must breach.
- The aggro/deaggro hysteresis pattern is standard in game AI — keeps behavior clean.

## After This Phase
- Minimap showing entity positions on the larger world
- Fog of war / limited vision radius
- Upgradeable bullet range, ship speed, fire rate
- Different enemy types with varying aggro ranges
