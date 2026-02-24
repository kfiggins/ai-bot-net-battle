# Phase 15: Nemesis Boss Fight & Body Collision Damage

## Goal
When the mothership is destroyed a new Phase 4 begins: the **Nemesis** bursts out of the explosion and flies directly at the nearest player. It fires a dense rotating spiral of 6 bullets at 10 volleys/sec and launches homing missiles at every player simultaneously every second. Players can no longer phase through solid enemies — mothership, towers, minions, and the Nemesis all deal collision damage on contact (with a 1.5 s per-entity immunity window). Player-vs-player collision does no damage.

## What Exists (from Phase 14)
- 3-phase boss fight: towers → minions → mothership
- XP/leveling system (max level 15) with per-level stat upgrades
- Cannon milestones at levels 5, 10, 15 (up to 4 simultaneous bullets)
- Homing missiles fired by missile towers
- Minion return-to-base when all towers destroyed
- Fake-AI opponent running the enemy economy

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Shared: add `"nemesis"` to `EntityKind`
- [x] Shared: Nemesis constants (HP 1200, radius 38, speed 170, spiral fire, missile fire)
- [x] Shared: body collision constants (`BODY_COLLISION_DAMAGE`, `NEMESIS_BODY_COLLISION_DAMAGE`, `BODY_COLLISION_COOLDOWN_TICKS`)
- [x] Server `sim.ts`: `spawnBullet()` accepts optional `speed` parameter (used for Nemesis spiral bullets)
- [x] Server `sim.ts`: `spawnMissile()` uses `entityRadius(owner.kind)` instead of hardcoded tower radius
- [x] Server `sim.ts`: `entityRadius()` handles `"nemesis"`
- [x] Server `sim.ts`: body collision system — `checkBodyCollisions()` + per-player immunity cooldown map
- [x] Server `sim.ts`: Nemesis kill awards `NEMESIS_KILL_XP` to all players
- [x] Server `boss.ts`: `spawnNemesis()` — spawns at mothership death position
- [x] Server `boss.ts`: mothership death → spawn Nemesis, transition to phase 4 (no match end)
- [x] Server `boss.ts`: `updateNemesis()` — chase, spiral fire, per-player missile launch
- [x] Server `boss.ts`: phase 4 win condition — match ends when Nemesis hp ≤ 0
- [x] Server `boss.ts`: `getPhaseInfo()` phase 4 branch — objective "Defeat the Nemesis"
- [x] Client `game.ts`: render Nemesis (purple `0xaa00ff`, radius 38)
- [x] Client `game.ts`: Nemesis arrival triggers large explosion VFX

## New Constants (`shared/src/constants.ts`)

| Constant | Value | Notes |
|---|---|---|
| `NEMESIS_HP` | 1200 | ~120 player bullets to kill |
| `NEMESIS_RADIUS` | 38 | slightly smaller than mothership (40) |
| `NEMESIS_SPEED` | 170 px/s | slightly slower than player (200) |
| `NEMESIS_BULLET_DAMAGE` | 12 | per spiral bullet |
| `NEMESIS_SPIRAL_BULLET_SPEED` | 400 px/s | faster than player — dodge laterally between arms |
| `NEMESIS_SPIRAL_COUNT` | 6 | bullets per volley, 60° apart |
| `NEMESIS_SPIRAL_FIRE_COOLDOWN_TICKS` | 3 | 10 volleys/sec — dense spiral |
| `NEMESIS_SPIRAL_ROTATE_PER_SHOT` | 0.12 rad | ~6.9° rotation per volley |
| `NEMESIS_MISSILE_COOLDOWN_TICKS` | 30 | one missile per player every 1 s |
| `NEMESIS_KILL_XP` | 500 | awarded to **all** players on kill |
| `BODY_COLLISION_DAMAGE` | 8 | mothership / tower / minion contact |
| `NEMESIS_BODY_COLLISION_DAMAGE` | 15 | Nemesis contact |
| `BODY_COLLISION_COOLDOWN_TICKS` | 45 | 1.5 s immunity per entity |

## Message Contracts
No new wire message types. The snapshot entity array already carries `kind: "nemesis"` via the extended `EntityKind` enum. Phase info `remaining.nemesis` carries current Nemesis HP for the HUD.

## Files Modified
- `shared/src/protocol.ts` — `EntityKind` enum
- `shared/src/constants.ts` — Nemesis + body collision constants
- `server/src/sim.ts` — `spawnBullet` speed param, `spawnMissile` radius fix, `entityRadius`, body collision system, `awardKillXP` nemesis branch
- `server/src/boss.ts` — complete rewrite: Nemesis spawn, AI loop, phase 4 lifecycle
- `client/src/game.ts` — `getColor` + `getRadius` nemesis cases, arrival explosion VFX

## 60-Second Smoke Test
1. `pnpm dev` — open browser, join game
2. Destroy all towers → verify phase transitions to 2
3. Destroy all minions → verify phase transitions to 3
4. Damage mothership to 0 → confirm mothership disappears and a **purple** entity appears at that position with a burst VFX
5. Confirm phase HUD reads "Defeat the Nemesis" and shows HP
6. Verify Nemesis chases the nearest player
7. Verify dense 6-bullet spiral fires continuously (~10 volleys/sec), rotating each volley — weave laterally between arms
8. Verify homing missiles launch at each player every ~1 second
9. Fly into the Nemesis → confirm player takes 15 damage, then is immune for ~1.5 s
10. Fly into a tower or minion → confirm player takes 8 damage with cooldown; no damage player-to-player
11. Destroy Nemesis → confirm "players win" match end screen
12. `pnpm test` — all tests pass
