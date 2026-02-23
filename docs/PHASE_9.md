# Phase 9: Lobby / Start Screen

## Goal
Add a pre-game lobby screen where players can see who has joined before starting the match. The game no longer auto-starts when the first player connects.

## What Exists (from Phase 8)
- Room-based multiplayer with isolated simulations
- Match lifecycle (waiting → in_progress → finished)
- Client-side prediction, snapshot interpolation, VFX, HUD
- Player labels and distinct colors per player
- Deployment hardening (rate limits, structured logging, health endpoints)

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Lobby scene (client) with game title, player list, and Start button
- [x] New wire messages: `start_game` (client→server), `lobby_update` + `match_start` (server→client)
- [x] Server room no longer auto-starts on first join; waits for `start_game` signal
- [x] Server broadcasts `lobby_update` on player join/disconnect/reconnect
- [x] Late joiners to an in_progress room skip lobby and enter game directly
- [x] Scene transition: LobbyScene → GameScene via Phaser scene system
- [x] Tests for new protocol messages, room state changes, and lobby broadcast

## Key Files to Create/Modify
- `/shared/src/protocol.ts` - New message schemas
- `/server/src/room.ts` - Public startMatch, broadcastLobbyUpdate, remove auto-start
- `/server/src/ws.ts` - Handle `start_game` message
- `/client/src/lobby.ts` - **NEW** LobbyScene (title, player list, start button)
- `/client/src/net.ts` - Lobby event handlers, sendStartGame method
- `/client/src/game.ts` - Get NetClient from Phaser registry instead of creating
- `/client/src/main.ts` - Register both scenes, start with LobbyScene

## Message Contracts

### Client → Server: start_game
```json
{ "v": 1, "type": "start_game" }
```

### Server → Client: lobby_update
```json
{
  "v": 1,
  "type": "lobby_update",
  "players": [
    { "name": "Player 1", "playerIndex": 1 },
    { "name": "Player 2", "playerIndex": 2 }
  ]
}
```

### Server → Client: match_start
```json
{ "v": 1, "type": "match_start" }
```

## 60-Second Smoke Test
1. Open `http://localhost:5173/` — see lobby with "AI BOT NET BATTLE" title
2. You appear as "Player 1" in the player list
3. Open second tab — "Player 2" appears in both tabs
4. Click "Start Game" in either tab — both transition to the game
5. Close one tab, reopen — late joiner enters game directly (no lobby)

## Notes
- Any connected player can start the game (no host/owner concept yet).
- The lobby is a Phaser scene, keeping the architecture consistent.
- NetClient is shared between scenes via the Phaser registry.
- During lobby, no tick loop runs and no snapshots are sent.

## Post-Phase 9 Hotfix Notes (2026-02-23)

These were added after initial Phase 9 completion to fix real playtest issues.

### Why these changes were made
- Players needed a clear end-of-match UX (not just phase text).
- Agent commands were still possible in edge cases after match end/lobby state.
- Minion groups looked unnatural (stacking and synchronized movement).
- Re-introduced towers in phase 3 were expected to re-enable boss shielding.

### What changed
- Added victory overlay in client with:
  - match time
  - final phase
  - remaining objective summary
  - **Return to Lobby** button
- Server now rejects agent commands when:
  - room is not `in_progress`
  - match is already over
- `resetToLobby()` now works from `finished` state too (button path fix).
- Mothership match-over detection handles entity-removed-first ordering.
- Boss shielding logic now treats active towers as global shield source in any phase.
- Minion spawn/movement now includes variation:
  - spawn spread/jitter (x+y)
  - per-minion movement/fire cadence variance

### Design intent (for future agents)
- **Return to Lobby must always be safe/idempotent** from post-win states.
- **Match authority is server-side**; client UI can be stale, command APIs must gate by room+phase state.
- **Gameplay readability > strict deterministic symmetry** for enemy swarms.
- **Tower presence always implies boss shield ON** (phase-agnostic override).

## After This Phase
- Player name input (custom names instead of "Player N")
- Ready-up system (require all players to ready before start)
- Chat in lobby
- Room browser / matchmaking
