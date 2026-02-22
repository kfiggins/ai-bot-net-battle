# Phase 3: Economy + Build System (The "LLM Brain Socket")

## Goal
The server has a resource system and a build queue, even before MCP.

## What Exists (from Phase 2)
- Player combat working (movement, shooting, collisions)
- Minion ships and towers with AI behavior
- Server console spawning

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Resource income per second (configurable rate)
- [x] Costs defined for `minion_ship` and `tower`
- [x] Build queue with cooldowns and unit caps
- [x] Server-side validation: insufficient funds → reject
- [x] `/state/summary` HTTP endpoint returns game state (port 3001)

## Key Files to Create/Modify
- `/shared/protocol.ts` - Add economy types, costs, build commands
- `/shared/constants.ts` - Unit costs, income rates, caps
- `/server/src/economy.ts` - Resource tracking, build queue
- `/server/src/http.ts` - HTTP endpoint for state summary
- `/server/src/sim.ts` - Integrate economy into tick loop

## Message Contracts

### Build command (internal, pre-agent)
```json
{
  "type": "build_command",
  "unitKind": "minion_ship",
  "count": 3
}
```

### `/state/summary` response
```json
{
  "balance": 500,
  "incomeRate": 10,
  "unitCounts": {
    "minion_ship": 5,
    "tower": 2,
    "player_ship": 1
  },
  "buildQueue": [],
  "phase": "combat"
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Wait for resources to accumulate
3. Issue spawn commands — verify they deduct resources
4. Issue spawn when broke — verify rejection
5. `curl http://localhost:3001/state/summary` — verify JSON response with balance, income, counts

## Notes
- Economy runs on server tick, not wall clock
- Build queue enforces cooldowns between spawns
- Unit caps prevent infinite army spam
- This phase prepares the "socket" that the LLM agent will plug into

## What to Implement Next → Phase 4
See [PHASE_4.md](./PHASE_4.md)
