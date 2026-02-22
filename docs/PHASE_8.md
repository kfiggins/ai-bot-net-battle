# Phase 8: Playable Boss Role (Human-Controlled Mothership)

## Goal
Allow a human to join a room as the boss and directly play the mothership, while preserving fair server-authoritative rules.

## What Exists (from Phase 7)
- Room/lobby system with isolated per-room simulations
- Match lifecycle and reconnect logic
- Existing boss mechanics and phase gates (currently AI/system-driven)

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Role selection at join (`player` or `boss`) with server-side gating
- [ ] One-boss-per-room enforcement
- [ ] Boss input schema and command handling (movement/abilities if enabled)
- [ ] Human-controlled mothership state transitions integrated with phase logic
- [ ] Boss-specific HUD (HP/shield/cooldowns/objectives)
- [ ] Role-aware win/loss conditions and match-end summary
- [ ] Spectator-safe behavior when boss slot is empty

## Key Files to Create/Modify
- `/shared/src/protocol.ts` - Add role selection + boss input contracts
- `/shared/src/constants.ts` - Boss role tuning (cooldowns/speeds/ability caps)
- `/server/src/ws.ts` - Role assignment + validation
- `/server/src/boss.ts` - Integrate human-control pathway
- `/server/src/sim.ts` - Apply boss input server-side
- `/client/src/game.ts` - Boss controls + camera/targeting rules
- `/client/src/ui.ts` - Boss HUD + role-based objective display

## Message Contracts

### Client → Server: Join as boss
```json
{
  "v": 1,
  "type": "join_room",
  "roomId": "alpha-001",
  "displayName": "FigMan",
  "role": "boss"
}
```

### Server → Client: Role assignment
```json
{
  "v": 1,
  "type": "role_assigned",
  "roomId": "alpha-001",
  "playerId": "player_9",
  "role": "boss",
  "entityId": "boss"
}
```

### Client → Server: Boss input
```json
{
  "v": 1,
  "type": "boss_input",
  "roomId": "alpha-001",
  "input": {
    "moveX": -0.2,
    "moveY": 0.8,
    "ability": "pulse_burst",
    "target": { "x": 760, "y": 320 }
  }
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Join one tab as `boss`, two tabs as normal players in same room
3. Verify boss receives boss HUD and controls mothership entity
4. Verify only one boss can exist per room
5. Verify player shots respect shield/vulnerability phase rules
6. End match and verify role-specific outcome messages

## Notes
- Keep all boss authority on server; client can only request actions.
- If boss disconnects, choose deterministic fallback (AI takeover or pause).
- Avoid role swap mid-match unless explicitly implemented with migration rules.

## What to Implement Next → Phase 9
See [PHASE_9.md](./PHASE_9.md)
