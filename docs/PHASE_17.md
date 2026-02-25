# Phase 17: Space-Physics Movement + Boost Particles

> **Planning prompt**: "I want to improve on the movement of the player. Currently the player goes to the top speed right away. I want to change it to be acceleration and have a max speed. This way it feels more like the player is in space. We want the player to have a direction and hitting the 'awsd' keys will start to apply acceleration in that direction. When the player is not hitting any 'awsd' keys to move it should cause the ship to break so they don't fly endlessly with that acceleration. Add this movement to the minions and ai units. Next we want to add boost particles to the player in the opposite direction the player wants to go. The particles should stop when the player is not hitting the 'awsd' keys (not moving). Same for the minions and other ai units. We just added PHASE_16 to have bullet recoil force. Lets change that to include the new movement in acceleration. Thinking that each cannon adds a speed opposite to where the player is aiming. There is probably some rewritting on how bullet recoil force works."

## Goal

Replace the current direct-velocity movement model with an inertia-based "space physics" model: WASD keys apply thrust acceleration, releasing all keys applies automatic braking. Extend the same model to minions and the Nemesis AI. Add boost-particle VFX that emit from the rear of the ship while thrusting. Rework Phase 16's bullet recoil to fold directly into the new velocity model — removing the separate `recoilVel` accumulator and instead applying recoil as an impulse straight into the ship's persistent velocity.

## What Exists (from Phase 16)

- Full boss fight: towers → minions → mothership → Nemesis
- XP/leveling (max 15), stat upgrades, 1–4 cannon barrels
- Cannon barrel visuals that rotate with aim angle
- Bullet recoil: `recoilVel: {x, y}` on `PlayerState`, decayed by `RECOIL_FRICTION` per tick, added on top of input velocity
- `BULLET_RECOIL_FORCE = 60` px/s, `RECOIL_FRICTION = 0.82`
- Current movement: WASD directly sets entity velocity to `effectiveSpeed` (200 px/s base) — instant top speed, no inertia

## How to Run

```bash
pnpm install
pnpm dev
```

## Design Overview

### The Velocity Model Change

**Current (Phase 16):**
```
vx, vy = normalized_input * effectiveSpeed   // set fresh each tick
entity.vel = (vx + recoilVel.x, vy + recoilVel.y)
entity.pos += entity.vel * dt
recoilVel *= RECOIL_FRICTION                  // separate decay
```

**New (Phase 17):**
```
// Acceleration phase (input held)
entity.vel += normalized_input * PLAYER_ACCEL * dt

// Braking phase (no input)
entity.vel *= PLAYER_BRAKE_FRICTION  // per-tick friction multiplier

// Max speed clamp (thrust only — recoil can exceed this briefly, see below)
if |entity.vel| > maxSpeed:
    entity.vel = normalize(entity.vel) * maxSpeed

entity.pos += entity.vel * dt
```

`entity.vel` is now **persistent across ticks** for all moving entities. It is the single source of truth — `recoilVel` is removed.

### Recoil Rework

The Phase 16 `recoilVel` accumulator is eliminated. Recoil now works as a direct impulse on `entity.vel`:

```
// In fireMultiCannon() — same as before but targeting entity.vel
entity.vel.x -= cos(aimAngle) * BULLET_RECOIL_FORCE
entity.vel.y -= sin(aimAngle) * BULLET_RECOIL_FORCE
```

**Key design decision — recoil can exceed max speed:**
Thrust-based acceleration is capped at `maxSpeed`, but recoil impulses are applied *after* the clamp. This preserves the Phase 16 "boost-by-shooting-backward" feel. The velocity naturally decays back to max speed via the brake friction on subsequent no-input ticks, or is absorbed when the player thrusts in the same direction.

**Effect examples:**
- Player stationary, fires right → recoil kicks ship left → brake friction decays vel back to zero over ~0.3s (braking naturally replaces RECOIL_FRICTION)
- Player moving right at max speed, fires left → recoil adds rightward impulse → brief overspeed → decays naturally when thrust is released
- Player moving right at max speed, fires right → recoil subtracts from vel → speed drops below max → thrust immediately refills it

`RECOIL_FRICTION` constant is **removed**. The per-tick decay for recoil is now governed entirely by `PLAYER_BRAKE_FRICTION` when no keys are held.

### Speed Upgrades

`PLAYER_SPEED` is renamed to `PLAYER_MAX_SPEED`. Speed upgrades continue to increase the max speed cap (`PLAYER_MAX_SPEED + upgrades.speed * SPEED_PER_UPGRADE`). Acceleration stays constant — it represents "engine power" which doesn't upgrade. This means at low levels, reaching max speed takes the same time as at high levels, but the ceiling is higher.

### Minion / AI Inertia

Minions currently call `updateMinionChase()`, `updateMinionPatrol()`, `updateMinionReturnToBase()`, each of which sets `entity.vel` directly. The refactor:

- Each movement function computes a **desired direction** (normalized) toward its waypoint or target
- Applies `MINION_ACCEL * dt` in that direction to `entity.vel`
- When the minion reaches its waypoint (or switches modes), let `MINION_BRAKE_FRICTION` decay vel naturally — no special "stop" logic needed
- Clamp `|entity.vel|` to `MINION_SPEED` (existing constant becomes the max speed cap)
- Strafe behavior (existing `strafeAmplitude`, `strafePhase`) still applies as a perpendicular offset to the desired direction before the acceleration step

**Nemesis (boss.ts):** Same pattern — desired direction toward target, acceleration toward it, brake when overshooting. The Nemesis already chases players; this just makes it feel heavier and more threatening.

### Client-Side Prediction Update

The client currently predicts local player position by directly computing velocity from WASD. It must now replicate the acceleration model:

1. Track `predictedVelX`, `predictedVelY` as persistent client state alongside the existing predicted position
2. Apply `PLAYER_ACCEL * dt` from WASD input to predictedVel each frame
3. Apply `PLAYER_BRAKE_FRICTION` when no input
4. Clamp to `PLAYER_MAX_SPEED`
5. Apply predictedVel to predictedPos

**Velocity reconciliation:** Snapshots already include `entity.vel`. During snapshot reconciliation, sync `predictedVelX/Y` from the snapshot alongside the position sync. This is important because recoil is applied server-side — without vel reconciliation, the client's predicted velocity would diverge every time the player fires. The lerp threshold for vel should be relatively loose (e.g., only hard-sync if delta > 50 px/s) to avoid jarring corrections.

### Boost Particles

Purely client-side VFX. No server or protocol changes required.

**Player:**
- Maintain a `boostEmitters: Map<string, Phaser.GameObjects.Particles.ParticleEmitter>` keyed by entity id
- While any thrust key is held (input.up / down / left / right), emit particles at the ship's center offset backward from the thrust direction
- Particle emit point: `ship.pos - normalize(thrustInput) * PLAYER_RADIUS`
- No emission when no keys held (ship is braking or coasting)
- For other players (from snapshots), infer thrust from `entity.vel` — emit if `|vel| > BOOST_PARTICLE_THRESHOLD`

**Minions / Nemesis:**
- Emit if `|entity.vel| > BOOST_PARTICLE_THRESHOLD` (e.g., 30 px/s)
- Emit point opposite to velocity direction from entity center
- Opacity/rate proportional to `|vel| / maxSpeed`

**Particle config:**
- Color: white fading to transparent (or faint team-tinted blue for enemy units)
- Count: 2–4 particles per emission
- Lifespan: 180–250 ms
- Speed: 40–80 px/s with ±20° spread
- Scale: 2–4 px (small dots)
- Alpha: 0.8 → 0 fade over lifetime

**Cleanup:** Emitters destroyed on entity remove and scene restart (same pattern as `cannonSprites` from Phase 16).

## Deliverables

### Feature 1: Inertia-Based Player Movement

- [ ] Shared: Add `PLAYER_ACCEL` (600 px/s²), `PLAYER_BRAKE_FRICTION` (0.80 per tick), `PLAYER_MAX_SPEED` (200 px/s); rename `PLAYER_SPEED` → `PLAYER_MAX_SPEED`; remove `RECOIL_FRICTION`
- [ ] Server (`sim.ts`): Remove `recoilVel: {x, y}` from `PlayerState` interface
- [ ] Server (`sim.ts`): `updatePlayers()` — accumulate `entity.vel` from thrust instead of overwriting; apply brake friction when no input; clamp to `effectiveMaxSpeed`
- [ ] Server (`sim.ts`): `fireMultiCannon()` — apply recoil directly to `entity.vel` (not a removed `recoilVel`); recoil applied after speed clamp so it can briefly exceed max speed
- [ ] Server (`sim.ts`): Respawn logic — reset `entity.vel = {x: 0, y: 0}` on player respawn (replaces `recoilVel` reset)
- [ ] Client (`game.ts`): Add `predictedVelX`, `predictedVelY` to local player state; replicate acceleration + brake model in `update()`; reconcile vel from snapshot during snapshot handling
- [ ] Tests: acceleration from rest reaches max speed within expected ticks; braking from max speed reaches near-zero within expected ticks; recoil-via-vel tests; speed upgrade scales max speed cap not acceleration; diagonal movement clamps correctly

### Feature 2: AI Unit Inertia (Minions + Nemesis)

- [ ] Shared: Add `MINION_ACCEL` (400 px/s²), `MINION_BRAKE_FRICTION` (0.78 per tick); existing `MINION_SPEED` (120 px/s) becomes the max speed cap
- [ ] Server (`ai.ts`): `updateMinionChase()`, `updateMinionPatrol()`, `updateMinionReturnToBase()` — replace direct vel assignment with desired-direction acceleration; apply `MINION_BRAKE_FRICTION` when decelerating
- [ ] Server (`boss.ts`): Nemesis movement uses same inertia pattern — accelerate toward target, brake when close/overshooting
- [ ] Tests: minion reaches waypoint with inertia (doesn't overshoot infinitely); minion brakes when mode switches; nemesis approaches player with inertia

### Feature 3: Boost Particles

- [ ] Client (`vfx.ts` or `game.ts`): `boostEmitters: Map<string, Phaser.GameObjects.Particles.ParticleEmitter>` map
- [ ] Client: Player boost — emit while thrust input held, backward from input direction; silent when braking/coasting
- [ ] Client: Other players boost — emit when `|snapshot.vel| > BOOST_PARTICLE_THRESHOLD`, direction opposite to `snapshot.vel`
- [ ] Client: Minion/Nemesis boost — same threshold check, direction opposite to entity vel
- [ ] Client: Emitter cleanup on entity destroy and `destroy()` / `shutdown()` scene events
- [ ] Shared: Add `BOOST_PARTICLE_THRESHOLD` (30 px/s) to constants (used client-side only, but keeps magic numbers out of client code)
- [ ] Manual smoke test only — no automated tests for VFX

### Feature 4: Recoil System Rework

- [ ] Shared: Remove `RECOIL_FRICTION` constant
- [ ] Server (`sim.ts`): Remove `recoilVel` field from `PlayerState`; remove all references to `recoilVel` in `updatePlayers()` and `fireMultiCannon()`
- [ ] Server (`sim.ts`): `fireMultiCannon()` applies impulse to `entity.vel` post-clamp
- [ ] Tests: fire while stationary → vel has recoil impulse; fire while moving → vel changes correctly; rapid fire accumulates recoil in vel (no accumulator leakage)

## New Constants (`shared/src/constants.ts`)

| Constant | Value | Replaces / Notes |
|---|---|---|
| `PLAYER_MAX_SPEED` | 200 px/s | Renames `PLAYER_SPEED` — now a max speed cap, not direct-set velocity |
| `PLAYER_ACCEL` | 600 px/s² | Thrust acceleration; reaches max speed in ~0.33s |
| `PLAYER_BRAKE_FRICTION` | 0.80 | Per-tick velocity multiplier when no input; ~0.3s to stop from max |
| `MINION_ACCEL` | 400 px/s² | Slightly more sluggish than player |
| `MINION_BRAKE_FRICTION` | 0.78 | Slightly faster brake for minions so they don't drift past waypoints |
| `BOOST_PARTICLE_THRESHOLD` | 30 px/s | Min speed before boost particles emit on AI / remote players |
| ~~`RECOIL_FRICTION`~~ | removed | Recoil decay now handled by `PLAYER_BRAKE_FRICTION` |

> Note: `BULLET_RECOIL_FORCE` (60 px/s) is kept unchanged — only its application target changes from `recoilVel` to `entity.vel`.

## Message Contracts

No new wire messages required. The snapshot `vel` field already exists on every entity and will now carry meaningful persistent velocity (instead of a one-tick computed value). The client prediction reconciliation reads `vel` from the snapshot — this is already in the protocol.

## Files to Modify

- `shared/src/constants.ts` — add 5 new constants, rename `PLAYER_SPEED` → `PLAYER_MAX_SPEED`, remove `RECOIL_FRICTION`
- `server/src/sim.ts` — remove `PlayerState.recoilVel`; refactor `updatePlayers()` for acceleration model; change `fireMultiCannon()` recoil to target `entity.vel`
- `server/src/ai.ts` — refactor `updateMinionChase()`, `updateMinionPatrol()`, `updateMinionReturnToBase()` to use acceleration model
- `server/src/boss.ts` — refactor Nemesis movement to use inertia model
- `client/src/game.ts` — add `predictedVelX/Y`; replicate acceleration model in `update()`; reconcile vel from snapshot
- `client/src/vfx.ts` (or `game.ts`) — add `boostEmitters` map, particle config, emit/cleanup logic
- `server/src/sim.test.ts` — update recoil tests; add acceleration/braking/clamp tests
- `docs/ARCHITECTURE.md` — update movement description from "direct velocity" to "inertia-based"

## Potential Risks / Watch Points

1. **Minion overshoot**: With acceleration and no hard stop, minions can overshoot their waypoints. Mitigation: when the minion is within `MINION_BRAKE_FRICTION` distance of its waypoint, switch to a braking-only mode and set a new waypoint on arrival.
2. **Client prediction drift from recoil**: The server applies recoil but the client prediction does not. The vel reconciliation step handles this, but the lerp threshold must be tuned so snap corrections aren't jarring. Consider smoothing the vel correction over 3–5 frames.
3. **Existing tests**: Many server tests use current movement constants. `PLAYER_SPEED` → `PLAYER_MAX_SPEED` rename will break imports — update all references.
4. **Nemesis feel**: The Nemesis is already scary. With inertia it will feel heavier but may feel slower to react. Consider a higher `NEMESIS_ACCEL` (e.g., 800 px/s²) so it doesn't feel sluggish.

## 60-Second Smoke Test

1. `pnpm dev` — open browser, join game
2. Tap W briefly — confirm ship accelerates gradually, doesn't teleport to max speed
3. Release W while moving — confirm ship brakes and stops (doesn't drift forever)
4. Hold W+D diagonal — confirm smooth acceleration to max speed, diagonal normalized
5. Fire while stationary — confirm ship kicks backward (recoil on entity.vel)
6. Fire backward while moving forward — confirm brief speed boost, then natural decay
7. Fire forward while moving forward — confirm brief slowdown, thrust refills speed
8. Observe boost particles — white dots trailing opposite to thrust direction while WASD held; stop immediately on key release
9. Let minions approach — confirm they no longer snap to speed, accelerate toward you, brake near you
10. Watch minion boost particles — faint particles trailing minions when moving
11. Reach Nemesis phase — confirm Nemesis has inertia feel (heavy, not twitchy)
12. `pnpm test` — all tests pass
