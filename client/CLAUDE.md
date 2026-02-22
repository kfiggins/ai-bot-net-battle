# /client - Phaser 3 Game Client

Vite + TypeScript + Phaser 3 client. This is a **renderer + input device only** — no game logic runs here.

## Key Files
- `src/main.ts` - Entry point, creates the Phaser game
- `src/game.ts` - Main game scene: handles input, renders snapshots, manages entity sprites, VFX, HUD
- `src/net.ts` - WebSocket client, sends player input, receives/validates snapshots with Zod
- `src/interpolation.ts` - Snapshot interpolation: lerps entity positions between server snapshots for smooth rendering
- `src/vfx.ts` - Visual effects: death explosions (particle bursts), hit flashes (white tint), spawn telegraphs (pulsing rings)
- `src/ui.ts` - HUD: phase indicator, objectives display, health bars (color-coded by HP ratio), victory screen
- `index.html` - Vite entry HTML

## Architecture
- **Input**: Arrow keys or WASD for movement, spacebar/mouse-click for firing, mouse position for aim angle
- **Rendering**: Entities rendered as colored circles based on `entity.kind` and `entity.team`
  - `player_ship`: green (0x00ff88), r=16
  - `bullet`: yellow (team 1) or red (team 2), r=4
  - `minion_ship`: orange (0xff6644), r=12
  - `tower`: red (0xff2222), r=20
  - `mothership`: magenta (0xff00ff), r=40
- **Networking**: Sends `join_room` on connect (room from URL hash, e.g. `#my-room`), then `player_input` each frame. Auto-reconnects with token on disconnect.
- **Sprite lifecycle**: Creates sprites on first appearance, updates positions, destroys when entity leaves snapshot
- **Interpolation**: SnapshotInterpolator lerps between last two snapshots at 15Hz for smooth 60fps rendering
- **VFX**: Client-only visual effects — particle explosions on death, white hit flashes, pulsing spawn telegraphs
- **HUD**: Phase indicator with shield status, objective text, per-entity health bars (hidden at full HP), victory overlay

## Rules
- **Never** compute game state client-side (no local bullet spawning, no local collision)
- All rendering is driven by server snapshots
- Zod validates all incoming server messages
