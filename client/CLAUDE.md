# /client - Phaser 3 Game Client

Vite + TypeScript + Phaser 3 client. This is a **renderer + input device only** — no game logic runs here.

## Key Files
- `src/main.ts` - Entry point, creates the Phaser game
- `src/game.ts` - Main game scene: handles input, renders snapshots, manages entity sprites
- `src/net.ts` - WebSocket client, sends player input, receives/validates snapshots with Zod
- `index.html` - Vite entry HTML

## Architecture
- **Input**: Arrow keys for movement, spacebar/mouse-click for firing, mouse position for aim angle
- **Rendering**: Entities rendered as colored circles based on `entity.kind` and `entity.team`
  - `player_ship`: green (0x00ff88), r=16
  - `bullet`: yellow (team 1) or red (team 2), r=4
  - `minion_ship`: orange (0xff6644), r=12
  - `tower`: red (0xff2222), r=20
- **Networking**: Sends `player_input` messages every frame, receives `snapshot` messages from server
- **Sprite lifecycle**: Creates sprites on first appearance, updates positions, destroys when entity leaves snapshot

## Rules
- **Never** compute game state client-side (no local bullet spawning, no local collision)
- All rendering is driven by server snapshots
- Zod validates all incoming server messages
