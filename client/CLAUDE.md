# /client - Phaser 3 Game Client

Vite + TypeScript + Phaser 3 client. This is a **renderer + input device only** — no game logic runs here.

## Key Files
| File | Lines | Purpose |
|---|---|---|
| `src/game.ts` | ~603 | Main GameScene: input, rendering, prediction, camera, VFX/HUD wiring |
| `src/ui.ts` | ~463 | HUD class: phase display, XP bar, upgrade panel, health bars, victory screen, debug |
| `src/lobby.ts` | ~284 | LobbyScene: player list, start button, agent mode toggle, dev log toggle |
| `src/net.ts` | ~192 | WebSocket client: connect, send input/upgrade, receive snapshots, reconnect |
| `src/name-entry.ts` | ~157 | NameEntryScene: callsign text input, join button |
| `src/vfx.ts` | ~132 | VFXManager: explosions, hit flashes, spawn telegraphs, missile trails |
| `src/interpolation.ts` | ~79 | SnapshotInterpolator: lerp between snapshots, extrapolate |
| `src/teammate-arrows.ts` | ~73 | Off-screen teammate direction arrows |
| `src/main.ts` | ~13 | Entry point, Phaser config, scene registration |

## game.ts Section Map
| Lines | Section |
|---|---|
| 1-7 | Imports |
| 9-34 | GameScene class fields (net, interpolator, sprites, prediction, cannon sprites) |
| 35-138 | `create()` — setup camera, input, net handlers, HUD, mode text, leave button |
| 140-283 | `update()` — input reading, client prediction, reconciliation, camera, rendering, HUD |
| 285-308 | `drawGrid()`, `drawWorldBoundary()` |
| 310-355 | `detectEvents()` — HP change detection for hit flashes, death explosions |
| 357-434 | `renderEntities()` — sprite create/update/destroy lifecycle, cannon barrels, labels |
| 436-480 | `createOrUpdateCannons()`, `updateCannonPositions()` |
| 482-491 | `createEntitySprite()` |
| 494-566 | `updateTeammateArrows()` |
| 569-602 | `getColor()`, `getRadius()` — entity kind → visual properties |

## ui.ts Section Map
| Lines | Section |
|---|---|
| 1-31 | Imports, HUD class fields |
| 32-197 | `constructor()` — creates all HUD elements (phase, objectives, XP, upgrades, victory, debug) |
| 199-220 | `updatePhase()` — shield status, objectives text |
| 222-260 | `updateXP()` — XP bar drawing, level-up flash |
| 262-314 | `setUpgradeHandler()`, `updateUpgrades()` — button state, cannon notifications |
| 316-333 | `showVictory()` — victory overlay with stats |
| 335-415 | `setDebugEnabled()`, `updateDebug()`, `updateHealthBars()` |
| 440-463 | `getMaxHp()`, `getBarOffset()` — per-kind health bar sizing |

## Change Recipes

### Add a new entity kind (client side)
1. `game.ts` → `getColor()` (~L571): add color case
2. `game.ts` → `getRadius()` (~L589): add radius case
3. `ui.ts` → `getMaxHp()` (~L440): add max HP for health bars
4. `ui.ts` → `getBarOffset()` (~L454): add bar offset for health bar positioning
5. If it needs special VFX: add to `detectEvents()` or `renderEntities()`

### Add a new HUD element
1. Add field to HUD class in `ui.ts`
2. Create the Phaser text/graphics in `constructor()`
3. Add update method, call from `game.ts` → `update()`
4. Add to `destroy()` cleanup

### Change client prediction behavior
1. `game.ts` → `update()` L160-174 (prediction movement)
2. `game.ts` → `update()` L203-224 (reconciliation against server)
3. Prediction uses `this.predictedSpeed` which is synced from server upgrade data

### Add a new client scene
1. Create `src/new-scene.ts` with `class NewScene extends Phaser.Scene`
2. Register in `src/main.ts` scene array
3. Navigate with `this.scene.start("NewScene")`

### Send a new message to server
1. Add method to `NetClient` in `net.ts` (follow `sendUpgrade()` pattern)
2. Call from game scene or UI handler

## Rules
- **Never** compute game state client-side (no local bullet spawning, no local collision)
- Client-side prediction is ONLY for local player movement smoothness
- All rendering is driven by server snapshots
- Zod validates all incoming server messages
