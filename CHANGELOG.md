# Changelog

## Phase 0: Monorepo Boot + Hello Multiplayer

### Added
- Monorepo structure with `/client`, `/server`, `/shared` packages
- Shared Zod protocol schemas (`player_input`, `snapshot`)
- Shared constants (tick rate, player speed, world size)
- Server: WebSocket server with 30 Hz tick loop
- Server: Player connection/disconnection handling
- Server: Authoritative movement simulation
- Client: Phaser 3 game with Vite bundler
- Client: WebSocket client with Zod validation
- Client: Keyboard input (arrow keys) → server input messages
- Client: Snapshot rendering with entity sprites
- Phase documentation (PHASE_0 through PHASE_6)
- Dev scripts for running both client and server
