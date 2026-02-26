# Phase 18: Image Sprites, Speed-Upgrade Control, XP Rebalance, & Minion Sprite

## Goal

Replace placeholder circles for key entities with PNG image sprites, make speed upgrades meaningfully improve ship handling (reduced recoil + higher acceleration), propagate `ownerKind` on bullets so tower plasma renders distinctly, rebalance XP drops, and add a minion ship sprite.

## What Exists (from Phase 17)

- Inertia-based movement: `PLAYER_ACCEL`, `PLAYER_BRAKE_FRICTION`, `PLAYER_MAX_SPEED`
- Boost particles (VFX trailing opposite to thrust direction)
- Bullet recoil applied as a direct impulse to `entity.vel` post-speed-clamp
- Speed upgrades increase `effectiveMaxSpeed` only; acceleration was fixed

## Changes

### Client — Image Sprites (`client/src/game.ts`)

- Added `preload()` to `GameScene` — loads five PNGs: `tower`, `blue_plasma`, `nemesis`, `rocket`, `minion`
- `entitySprites` map type widened from `Arc` → `Arc | Image`
- `createEntitySprite()` now returns `Image` for: `tower`, `nemesis`, `minion_ship`, `missile`, and tower bullets (`bullet` where `ownerKind === "tower"`)
  - `tower` — sized to `radius * 2` square; rotates each tick to match `entity.aimAngle`
  - `nemesis` — sized to `radius * 2` square (76 × 76 px)
  - `minion_ship` — `36 × 36 px` (larger than the 24 px collision circle for visibility); rotates to travel direction
  - `missile` — `40 × 80 px`, depth `8` (above trail particles at depth 7), rotates to travel direction
  - `blue_plasma` (tower bullet) — `20 × 40 px`, rotates to travel direction
- Tower radius constant updated: `20 → 35` px (display size now matches the image)
- Rotation logic (per-tick, in the entity update loop):
  - `tower` — `(aimAngle ?? 0) + π/2` (image points up, +π/2 aligns to aimAngle)
  - `bullet` (Image), `missile`, and `minion_ship` — `atan2(vel.y, vel.x) + π/2`
- Hit-flash tint updated for Image sprites — uses `setTint(0xffffff)` / `clearTint()` instead of `setFillStyle`
- Explosion colour fallback — when a dying entity is an `Image` (no `fillColor`), uses new `getColorByKind(kind)` helper to pick the explosion colour
- Added `getColorByKind(kind: string): number` helper function

### Server — Tower Always Tracks `aimAngle` (`server/src/ai.ts`)

- `fireTower()` now sets `entity.aimAngle = atan2(dy, dx)` **every tick** (not just when firing), so the client can rotate the tower image continuously even between shots

### Server — Speed Upgrade Improves Ship Control (`server/src/sim.ts`)

- `effectiveAccel = PLAYER_ACCEL + upgrades.speed * ACCEL_PER_SPEED_UPGRADE` — each speed level adds 60 px/s² (base 800 → max 1100 at level 5)
- Recoil scales down with speed level: `recoil = BULLET_RECOIL_FORCE * (1 − upgrades.speed * RECOIL_REDUCTION_PER_SPEED_UPGRADE)` — 15% reduction per level (60 px/s at level 0 → 15 px/s at level 5)
- `fireMultiCannon()` gains `speedUpgrades: number = 0` parameter; call site passes `player.upgrades.speed`
- Spawned bullets now carry `ownerKind: owner.kind` so the client can distinguish tower bullets from player bullets

### Protocol (`shared/src/protocol.ts`)

- `EntitySchema` — added optional `ownerKind: z.string()` field

### Constants (`shared/src/constants.ts`)

| Constant | Value | Notes |
|---|---|---|
| `ACCEL_PER_SPEED_UPGRADE` | 60 px/s² | Added — acceleration bonus per speed level |
| `RECOIL_REDUCTION_PER_SPEED_UPGRADE` | 0.15 | Added — 15% recoil reduction per speed level |
| `ORB_XP_VALUE` | 8 (was 5) | Rebalanced upward |
| `MINION_KILL_XP` | 16 (was 10) | Rebalanced upward |
| `TOWER_KILL_XP` | 32 (was 25) | Rebalanced upward |

## Speed Upgrade Feel — Before vs After

| Level | Max Speed | Acceleration | Recoil |
|---|---|---|---|
| 0 | 200 px/s | 800 px/s² | 60 px/s |
| 1 | 225 px/s | 860 px/s² | 51 px/s |
| 3 | 275 px/s | 980 px/s² | 33 px/s |
| 5 | 325 px/s | 1100 px/s² | 15 px/s |

## Player Spaceship Sprites

### Client — `client/src/game.ts`

- Preloaded four player spaceship PNGs: `spaceship_green`, `spaceship_blue`, `spaceship_red`, `spaceship_purple`
- `createEntitySprite()` now returns an `Image` for `player_ship` instead of a colored circle
  - Texture key selected by `playerIndex`: index 1→green, 2→blue, 3→red, 4→purple (wraps with modulo)
  - Display size: `radius * 2` = 32 × 32 px
  - No rotation applied (sprites are orientation-neutral top-down ships)
  - Cannon rectangles (depth 0.5) sit on top of the ship image (depth 0) unchanged
- `getColorByKind()` — added `player_ship` case returning `0x88ddff` for death-explosion colour
- Added `PLAYER_SHIP_TEXTURES` constant array mapping player slot to texture key

### Assets

- `client/public/assets/` — added `spaceship_green.png`, `spaceship_blue.png`, `spaceship_red.png`, `spaceship_purple.png`

### Tests — `server/src/sim.test.ts`

- Added three tests under `addPlayer` to verify `playerIndex` is correctly stored and propagated:
  - Entity and player record both carry the passed `playerIndex`
  - All four player slots (1–4) receive distinct indices
  - `getSnapshot()` includes `playerIndex` on the serialised entity

## Files Modified

- `client/public/assets/` — added `tower.png`, `bluePlasma.png`, `nemesis.png`, `rocket.png`, `minion.png`, `spaceship_green.png`, `spaceship_blue.png`, `spaceship_red.png`, `spaceship_purple.png`
- `client/src/game.ts` — image sprites, rotation, tint, explosion colour, `getColorByKind`, player spaceship sprites
- `server/src/ai.ts` — tower always sets `aimAngle`
- `server/src/sim.ts` — `effectiveAccel`, recoil scaling, `ownerKind` on bullets
- `server/src/sim.test.ts` — `playerIndex` propagation tests
- `shared/src/constants.ts` — two new upgrade constants, three XP rebalances
- `shared/src/protocol.ts` — `ownerKind` field on `EntitySchema`
