# Phase 10: Expanded World, Camera & Background

## Goal
Transform the game from a single-screen arena into a large explorable map with a follow camera, visible grid background, and clear world boundaries. Think agar.io-style navigation in space.

## What Exists (from Phase 9)
- 1024×768 fixed world where camera shows everything at once
- Room-based multiplayer with lobby, match lifecycle, victory screen
- Full combat/economy/boss loop with 3-phase progression
- Mothership spawns at right edge (964, 384)
- Players spawn randomly in interior
- No background grid — solid dark blue (#111122)
- Entities clamped to world bounds but no visible boundary

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Expand world size from 1024×768 to 4000×4000 (new constants)
- [ ] Move mothership spawn to center of map (2000, 2000)
- [ ] Update player spawn positions to be away from center (near edges or random quadrant)
- [ ] Server-side boundary clamping updated for new world size
- [ ] Client follow camera that smoothly tracks the local player
- [ ] Grid-line background (agar.io style) for spatial awareness when flying through empty space
- [ ] Visible world boundary edges (thick border or color change at map edges)
- [ ] All UI elements (HUD, health bars, buttons, victory overlay) stay fixed on screen
- [ ] Tests for new world bounds and spawn position logic

## Key Files to Create/Modify
- `/shared/src/constants.ts` - Update `WORLD_WIDTH`, `WORLD_HEIGHT` to 4000×4000
- `/server/src/sim.ts` - Update boundary clamping for larger world
- `/server/src/boss.ts` - Move mothership spawn to world center
- `/server/src/room.ts` - Update player spawn positions (spread away from center)
- `/server/src/economy.ts` - Update default tower/minion spawn ranges for bigger map
- `/client/src/game.ts` - Follow camera setup, grid background rendering, boundary visuals
- `/client/src/ui.ts` - Ensure all HUD/overlay elements use `setScrollFactor(0)`
- `/client/src/lobby.ts` - No changes expected (lobby is pre-game)

## Implementation Notes

### World Size
```
WORLD_WIDTH = 4000
WORLD_HEIGHT = 4000
```
Square map keeps things simple and symmetric. 4000px is large enough to explore but manageable for the server (just position math, no spatial partitioning needed at this entity count).

### Camera
Use Phaser's built-in `camera.startFollow(playerSprite, true, lerpX, lerpY)` with:
- Lerp of ~0.1 for smooth tracking (not snappy, not sluggish)
- `camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)` to prevent seeing outside the map
- The camera viewport stays at the canvas size; the world is what's large

### Background Grid
Render thin lines (or dots) at regular intervals across the entire world:
- Grid spacing: ~100px
- Color: subtle gray/blue (e.g., `#1a1a2e` or `#222244`) — visible but not distracting
- Use a Phaser TileSprite or draw lines in a Graphics object that scrolls with the world
- Consider rendering only visible grid lines each frame for performance

### World Boundary
- Render a thick visible border at the world edges (e.g., red or white lines, 4-6px wide)
- Server already clamps entity positions — this is the visual indicator
- Optionally add a "danger zone" tint near edges

### Spawn Positions
- Mothership: exact center `(WORLD_WIDTH / 2, WORLD_HEIGHT / 2)`
- Players: spawn in a ring ~1500–1800px from center (outside initial combat zone)
- Minions/towers: spawn near mothership (existing economy logic, updated ranges)

## 60-Second Smoke Test
1. Run `pnpm dev` and start a match from the lobby
2. You spawn far from center — see grid lines in the background
3. Fly around with WASD — camera follows your ship smoothly
4. Fly toward a map edge — see the visible boundary, ship stops at the edge
5. Fly toward center — see the mothership and enemy towers come into view
6. Open second tab, join same room — both players have independent cameras
7. HUD, health bars, and phase text stay fixed on screen while moving

## Notes
- The camera is the biggest UX shift — playtest the lerp value to make sure it feels good.
- Grid lines are essential; without them, flying through empty space feels like standing still.
- Server simulation is unchanged in terms of game logic — just bigger numbers for positions.
- Snapshot size does not grow (same entity count, just larger position values).

## What to Implement Next → Phase 11
See [PHASE_11.md](./PHASE_11.md)
