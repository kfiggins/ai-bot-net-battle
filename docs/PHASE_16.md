# Phase 16: Bullet Recoil Physics + Cannon Visuals

## Goal
Two interrelated polish features: (1) firing bullets creates a physics recoil impulse on the player ship, enabling boost-by-shooting and drag-when-shooting mechanics; (2) player ships display cannon barrel rectangles that rotate with the aim angle, scale with level milestones, and bullets originate from cannon tips.

## What Exists (from Phase 15)
- Full boss fight: towers → minions → mothership → Nemesis
- XP/leveling (max 15) with stat upgrades and cannon milestones (L5→2, L10→3, L15→4)
- Body collision damage system
- Player ships rendered as plain circles with no directional indicator

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables

### Feature 1: Bullet Recoil
- [x] Shared: `BULLET_RECOIL_FORCE` (60 px/s), `RECOIL_FRICTION` (0.82 per tick)
- [x] Server: `recoilVel: {x, y}` field on `PlayerState`
- [x] Server: recoil decay in `updatePlayers()` — multiply by friction, snap to zero below 0.1
- [x] Server: combined velocity = input velocity + recoil velocity
- [x] Server: recoil impulse in `fireMultiCannon()` — opposite to aim direction
- [x] Server: `recoilVel` reset on player respawn
- [x] Tests: 7 recoil physics tests

### Feature 2: Cannon Visuals + Bullet Origin
- [x] Shared: `CANNON_LENGTH` (18px), `CANNON_WIDTH` (5px), `CANNON_OFFSET_LATERAL` (6px)
- [x] Shared: `aimAngle: z.number().optional()` added to `EntitySchema`
- [x] Server: `aimAngle` included in `getSnapshot()` player enrichment
- [x] Server: `lateralOffset` parameter on `spawnBullet()` — perpendicular offset per cannon
- [x] Server: lateral offsets computed in `fireMultiCannon()` per cannon barrel
- [x] Client: `cannonSprites` map — gray rectangles per cannon per player
- [x] Client: `updateCannonPositions()` — rotate with aim angle, spread with `CANNON_SPREAD_ANGLE`
- [x] Client: local `aimAngle` for self, snapshot `aimAngle` for other players
- [x] Client: cannon cleanup on entity destroy and scene restart
- [x] Tests: 3 bullet origin offset tests, 3 snapshot aimAngle tests, 2 protocol tests

## New Constants (`shared/src/constants.ts`)

| Constant | Value | Notes |
|---|---|---|
| `BULLET_RECOIL_FORCE` | 60 px/s | impulse per shot, ~30% of base speed |
| `RECOIL_FRICTION` | 0.82 | per-tick decay (~115ms half-life) |
| `CANNON_LENGTH` | 18 px | tip extends 2px beyond player radius |
| `CANNON_WIDTH` | 5 px | narrow barrel rectangle |
| `CANNON_OFFSET_LATERAL` | 6 px | spacing between cannon barrels |

## Message Contracts
`aimAngle: z.number().optional()` added to `EntitySchema` — backward compatible. No new message types.

## Files Modified
- `shared/src/constants.ts` — 5 new constants
- `shared/src/protocol.ts` — `aimAngle` optional field on `EntitySchema`
- `server/src/sim.ts` — `PlayerState.recoilVel`, recoil decay/impulse in `updatePlayers()`/`fireMultiCannon()`, `lateralOffset` in `spawnBullet()`, `aimAngle` in `getSnapshot()`
- `client/src/game.ts` — cannon sprite rendering, positioning, cleanup
- `server/src/sim.test.ts` — 13 new tests
- `shared/src/protocol.test.ts` — 2 new tests

## 60-Second Smoke Test
1. `pnpm dev` — open browser, join game
2. Verify gray cannon bar(s) appear on player ship pointing at cursor
3. Move mouse around — confirm cannon rotates smoothly
4. Fire while stationary — confirm brief backward kick (recoil)
5. Move right, shoot left — confirm forward speed boosts briefly
6. Move right, shoot right — confirm brief slowdown
7. Hold fire at max fire rate — confirm sustained drag while shooting in movement direction
8. Level to 5 — confirm 2 cannons appear with spread, bullets originate from each tip
9. Level to 10, 15 — confirm 3, 4 cannons respectively
10. Verify other players' cannons also rotate (from snapshot aimAngle)
11. `pnpm test` — all 315 tests pass
