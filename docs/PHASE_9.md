# Phase 9: Deployment + Multiplayer Hardening

## Goal
Make multiplayer (including boss role) deployable and stable for real remote playtests.

## What Exists (from Phase 8)
- Room-based multiplayer sessions
- Human-playable boss role
- Match lifecycle and role-aware outcomes

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Production deployment profile (env vars, ports, host binding)
- [ ] Reverse proxy/WSS support (TLS for browser WebSocket clients)
- [ ] Health endpoints + startup/readiness checks
- [ ] Structured logs with room/player correlation IDs
- [ ] Rate limits and guardrails (join spam, input spam, command abuse)
- [ ] Graceful process restart behavior (active rooms handled safely)
- [ ] Basic observability dashboard/reporting (latency, tick drift, room count)
- [ ] Deployment runbook for free-tier hosting options

## Key Files to Create/Modify
- `/server/src/index.ts` - Env-driven host/port/startup checks
- `/server/src/ws.ts` - Connection limits, abuse throttles, logging hooks
- `/server/src/http.ts` - `/healthz`, `/readyz`, room metrics endpoint
- `/server/src/sim.ts` - Tick drift instrumentation
- `/shared/src/constants.ts` - Tunable limits/timeouts
- `/docs/DEPLOYMENT.md` - Hosting and rollout instructions
- `/scripts/` - Start/restart/health probe scripts

## Message Contracts

### Health response
```json
{
  "ok": true,
  "uptimeSec": 8640,
  "rooms": 3,
  "players": 9,
  "tickRateTarget": 30,
  "tickRateObserved": 29.8
}
```

### Metrics summary
```json
{
  "rooms": [
    {
      "roomId": "alpha-001",
      "players": 4,
      "phase": 2,
      "avgLatencyMs": 63,
      "snapshotDrops": 1
    }
  ]
}
```

## 60-Second Smoke Test
1. Deploy server to chosen target
2. Connect 3+ remote clients to one room
3. Verify WSS connection succeeds over TLS
4. Run boss match for 3 minutes
5. Check `/healthz` and metrics while match runs
6. Restart process gracefully and verify no corrupt room state

## Notes
- Prefer conservative limits first; relax after observing stable behavior.
- Separate game loop health from process health (a running process can still be unhealthy).
- Free hosting tiers are fine for playtests, but expect cold starts and constrained CPU.

## After This Phase
You have a practical multiplayer beta baseline. Next work can focus on content depth:
- Progression/leaderboards
- Matchmaking and private invites
- Spectator mode
- Additional boss abilities/maps
