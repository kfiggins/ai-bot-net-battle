# Phase 4: Agent API (MCP-Ready)

## Goal
An external agent can play "RTS manager" safely via HTTP endpoints.

## What Exists (from Phase 3)
- Full combat system with player ships, bullets, enemies
- Economy with resources, costs, build queue
- `/state/summary` endpoint

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] `POST /agent/command` endpoint
- [ ] `GET /state/summary` endpoint (enhanced from Phase 3)
- [ ] Rate limiting + command budget (anti-spam)
- [ ] Command types: `spawn_ship`, `build_tower`, `set_strategy`
- [ ] Structured, terse command results
- [ ] Commands applied on tick boundaries (not immediately)

## Key Files to Create/Modify
- `/shared/protocol.ts` - Agent command schemas
- `/server/src/http.ts` - Agent API endpoints
- `/server/src/agent.ts` - Command validation, rate limiting, budget
- `/server/src/sim.ts` - Apply queued agent commands on tick

## Message Contracts

### `POST /agent/command` request
```json
{
  "v": 1,
  "type": "agent_command",
  "command": "spawn_ship",
  "params": {
    "kind": "minion_ship",
    "count": 2,
    "lane": "top"
  }
}
```

### `POST /agent/command` response (success)
```json
{
  "ok": true,
  "applied_at_tick": 450,
  "cost": 100,
  "remaining_balance": 400,
  "remaining_budget": 8
}
```

### `POST /agent/command` response (error)
```json
{
  "ok": false,
  "error": "insufficient_funds",
  "detail": "Need 100, have 50"
}
```

### Enhanced `/state/summary`
```json
{
  "balance": 500,
  "incomeRate": 10,
  "unitCounts": { "minion_ship": 5, "tower": 2 },
  "buildQueue": [{ "kind": "minion_ship", "readyAtTick": 500 }],
  "phase": "combat",
  "agentBudget": { "remaining": 8, "resetAtTick": 600 }
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. `curl -X POST http://localhost:3000/agent/command -H 'Content-Type: application/json' -d '{"v":1,"type":"agent_command","command":"spawn_ship","params":{"kind":"minion_ship","count":1}}'`
3. Verify success response with tick info
4. Repeat rapidly — verify rate limiting kicks in
5. Send invalid command — verify clear error message
6. Check `GET /state/summary` reflects spawned units

## Notes
- Rate limit: e.g., 10 commands per 30 seconds
- Commands queue and apply at next tick boundary for determinism
- This is the interface the LLM agent (Claude via MCP) will use

## What to Implement Next → Phase 5
See [PHASE_5.md](./PHASE_5.md)
