# Phase 19 — Phantom Ship

## Goal
Add a new enemy unit: the **Phantom**, a fast, evasive flanker that guards the mothership and attacks players from the far side.

---

## New Entity: `phantom_ship`

| Stat | Value |
|---|---|
| HP | 20 (very fragile — 2 base bullets to kill) |
| Radius | 10 px (small, hard to hit) |
| Speed | 280 px/s (faster than base player speed of 200) |
| Accel | 900 px/s² (very snappy) |
| Fire range | 450 px |
| Burst size | 3 bullets per burst |
| Burst cooldown | 90 ticks (3 s between bursts) |
| Kill XP | 20 XP |
| Economy cost | 65 resources |
| Economy cap | 5 phantoms max |

---

## Phantom AI Behaviour

### State Machine

| Mode | Trigger | Behaviour |
|---|---|---|
| `patrol` | No players alive / player outside guard zone | Orbits mothership at 200 px radius |
| `return_to_base` | Player left guard zone while attacking | Sprints back to mothership orbit |
| `flank` | Player within 800 px of mothership, phantom outside fire range | Moves to the far side of the mothership (opposite the player) |
| `chase` | Player within 450 px (fire range) | Charges directly at the player, fires burst |

### Flank Geometry
The flank position is computed each tick:
```
direction = normalize(mothership - player)
flank_pos = mothership + direction * 180px
```
This places the Phantom on the far side of the mothership as viewed from the player, so it sweeps in from behind the mothership.

### Predictive Aim
Rather than shooting where the player currently is, the Phantom leads its target:
```
travel_time = distance / BULLET_SPEED
predicted_pos = player.pos + player.vel * travel_time
aim_angle = atan2(predicted - phantom) + random_offset(±0.20 rad)
```

### Evasion
Each tick, the Phantom checks if the nearest player is aiming roughly at it (within a ±0.40 rad cone). If so, it applies a perpendicular velocity impulse to dodge sideways. The dodge direction is determined by the cross product of the player's aim vector and the player→phantom vector, so the Phantom always dodges *away* from the aim line rather than randomly oscillating.

### Burst Fire
Bursts of 3 bullets are fired in rapid succession (~133 ms between shots). The Phantom **keeps moving** during a burst — unlike the missile tower which pauses. The aim angle for all 3 shots in a burst is locked when the burst starts (with one random jitter applied once), so the bullets form a tight cluster aimed at the predicted target position.

---

## Files Changed

| File | Change |
|---|---|
| `shared/src/constants.ts` | Added `PHANTOM_*` constants; added `phantom_ship` to `UNIT_COSTS` and `UNIT_CAPS` |
| `shared/src/protocol.ts` | Added `phantom_ship` to `EntityKind` enum; added `phantom_ship` to `SpawnShipCommandSchema` |
| `server/src/sim.ts` | `spawnEnemy` handles `phantom_ship`; `entityRadius` returns 10; `checkBodyCollisions` includes phantom; `awardKillXP` grants `PHANTOM_KILL_XP` |
| `server/src/ai.ts` | Added `"flank"` to `AIMode`; dispatches `updatePhantom` in `update()`; added methods: `updatePhantom`, `phantomOrbit`, `phantomThrustTo`, `phantomEvade`, `phantomStartBurst` |
| `server/src/economy.ts` | `BuildRequest` and `QueuedBuild` union types include `phantom_ship`; spawn position logic shared with `minion_ship` |
| `server/src/fake-ai.ts` | Spawns up to 2 phantoms at a time (10 s cooldown, 150 resource minimum) |
| `client/src/game.ts` | Color `0x8844ff`; radius 10; sprite uses `phantom.png` (falls back to circle); boost particles; travel-direction rotation; loads `assets/phantom.png` |
| `client/src/ui.ts` | `getMaxHp` returns 20; `getBarOffset` returns 16 |
| `server/src/phantom.test.ts` | New test file — 15 tests covering spawn, patrol, guard zone, burst fire, XP, economy, and flank geometry |

---

## Adding the Phantom Sprite

Place your ship image at:
```
client/public/assets/phantom.png
```
The image should point **upward** (the client rotates it to match the travel direction). Recommended size: 32×32 px. Until the file is added, the Phantom renders as a purple circle (`0x8844ff`).

---

## Future Ideas

- **Cloak pulse**: Phantom goes semi-transparent (alpha ~0.3) for 0.5 s before launching its attack run, giving players a brief visual warning.
- **Coordinated flanks**: When 2+ Phantoms are alive, each picks a different flank angle (e.g., 120° apart around the mothership) to attack from multiple directions.
- **Dive bomb**: A one-time extreme speed burst (3× normal speed) on first contact with the player, with a long recharge (10 s). Makes the first pass terrifying.
- **Phase lock**: Phantoms only spawn in Phase 2 (minion phase) and become more aggressive as minion count drops — so clearing minions empowers the Phantoms.
- **Mine drop**: When evading, the Phantom has a small chance to drop an energy-mine that detonates on player contact.
