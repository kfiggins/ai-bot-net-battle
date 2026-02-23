# Phase 12: Kids Mode Toggle + Built-in Fake AI (Agent Default OFF)

## Goal
Add a start-screen toggle in the **bottom-right** so the game can run in two modes:

1. **Agent Mode (ON)** → current behavior (external agent via `/agent/command` controls strategy)
2. **Kids Mode (OFF, default)** → no external babysitting needed; built-in fake AI makes basic tower/ship decisions automatically

This lets kids play immediately without requiring Ramsey to actively command the match.

## What Exists (from Phase 11)
- Multiplayer lobby/start flow
- Server-authoritative sim loop
- Agent API endpoint (`POST /agent/command`)
- Economy, build queue, spawn systems, and tower placement constraints
- Enemy patrol/chase AI updates

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Add lobby/start-screen toggle UI in bottom-right: `Agent Mode: OFF/ON`
- [ ] Default toggle state is **OFF** for every new room/session
- [ ] Include mode value in start message / room config so all clients share one source of truth
- [ ] When toggle is ON: keep current external agent path unchanged
- [ ] When toggle is OFF: enable server-side fake AI planner for the AI side
- [ ] Fake AI chooses from safe actions only (`spawn_ship`, `build_tower`, optional `set_strategy`)
- [ ] Fake AI runs on a cooldown cadence (not every tick) and obeys budget/rate limits
- [ ] Add visible indicator in HUD/lobby showing active mode
- [ ] Tests for mode defaults, mode propagation, and fake AI command behavior

## Key Files to Create/Modify
- `/shared/src/protocol.ts`
  - Add room/game mode enum and message field(s)
- `/client/src/lobby.ts`
  - Add bottom-right toggle UI, default OFF
- `/client/src/net.ts`
  - Include selected mode when sending `start_game`
- `/server/src/room.ts`
  - Persist room mode and expose it to game systems
- `/server/src/ws.ts`
  - Validate/start game with mode payload
- `/server/src/agent.ts`
  - Keep external agent path as-is for ON mode
- `/server/src/fake-ai.ts` (**NEW**)
  - Deterministic lightweight planner for OFF mode
- `/server/src/index.ts` or `/server/src/sim.ts`
  - Tick hook to run fake AI at fixed intervals when mode is OFF
- `/server/src/*.test.ts`, `/shared/src/protocol.test.ts`
  - New/updated tests

## Proposed Mode Contract

### Shared type
```ts
type AgentControlMode = "external_agent" | "builtin_fake_ai";
```

### Start game message (client → server)
```json
{
  "v": 1,
  "type": "start_game",
  "mode": "builtin_fake_ai"
}
```

If omitted, server defaults to `builtin_fake_ai` for safety.

## Fake AI Logic (Kids Mode)
Keep it intentionally simple and predictable:

### Cadence
- Evaluate every `N` ticks (example: every 20 ticks / ~0.67s at 30 TPS)
- Hard cooldown per action type to avoid spam

### Priority heuristic
1. **Defense first**: if low nearby defense and budget allows, build tower near mothership within allowed radius
2. **Pressure second**: spawn 1–2 minion ships when budget available
3. **Fallback**: hold/save budget if neither action is efficient

### Safety rules
- Reuse existing command validators and budget constraints
- Never bypass economy checks
- Never place towers outside legal range
- If mode is OFF, ignore external `/agent/command` writes for control (or mark read-only)

## Test Plan
- Protocol test: `mode` accepted and defaults to OFF path when missing
- Room test: new room starts with `builtin_fake_ai`
- Lobby test: toggle renders bottom-right and defaults OFF
- Server behavior test:
  - OFF mode triggers fake AI actions over time
  - ON mode does not trigger fake AI
- Budget/rate-limit test: fake AI never exceeds command budget/cooldown constraints
- Regression test: existing external agent flow still works unchanged when ON

## 60-Second Smoke Test
1. Start server/client and open lobby
2. Confirm bottom-right toggle exists and defaults to `Agent Mode: OFF`
3. Start match with OFF
4. Observe AI side automatically building towers/spawning ships without external API calls
5. Return to lobby, toggle ON
6. Start match and verify fake AI is idle while external agent API commands still work

## Notes
- Default OFF is deliberate for kid-friendly standalone play.
- ON mode preserves current “Ramsey live commander” behavior.
- Fake AI is not meant to be smart; it is meant to be stable, safe, and fun.

## After This Phase
- Difficulty presets for fake AI (easy/normal/hard)
- Scripted personalities (aggressive turtle, rusher, builder)
- Hybrid mode: fake AI baseline with occasional external agent overrides
