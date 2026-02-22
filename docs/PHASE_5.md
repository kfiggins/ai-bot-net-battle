# Phase 5: The "Boss Fight" Structure (Mothership + Phases)

## Goal
Your win condition becomes a real arc with a mothership boss and phase gates.

## What Exists (from Phase 4)
- Full combat, enemy AI, economy, build system
- Agent API with rate limiting
- State summary endpoint

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Mothership entity with shield/vulnerability rules
- [ ] Shield up while towers/ships alive
- [ ] Phase gates:
  - Phase 1: towers only
  - Phase 2: minions unlocked
  - Phase 3: elite minions (optional)
  - Final: mothership vulnerable
- [ ] State summary includes current phase + remaining objectives
- [ ] Win condition: kill mothership ends match

## Key Files to Create/Modify
- `/shared/protocol.ts` - Mothership entity, phase state, objectives
- `/shared/constants.ts` - Phase definitions, mothership stats
- `/server/src/boss.ts` - Boss logic, phase transitions, shield rules
- `/server/src/sim.ts` - Integrate boss phases into tick loop
- `/client/src/game.ts` - Render mothership, phase indicators

## Message Contracts

### Snapshot with mothership
```json
{
  "v": 1,
  "type": "snapshot",
  "tick": 1000,
  "entities": [
    { "id": "boss", "kind": "mothership", "pos": { "x": 800, "y": 300 }, "vel": { "x": 0, "y": 0 }, "hp": 1000, "team": 2, "shielded": true }
  ],
  "phase": {
    "current": 2,
    "objectives": ["Destroy all towers", "Destroy remaining minions"],
    "remaining": { "tower": 3, "minion_ship": 7 }
  }
}
```

### Enhanced state summary
```json
{
  "balance": 800,
  "incomeRate": 15,
  "unitCounts": { "minion_ship": 7, "tower": 3, "mothership": 1 },
  "phase": {
    "current": 2,
    "objectives": ["Destroy all towers"],
    "remaining": { "tower": 3 }
  },
  "mothershipHp": 1000,
  "mothershipShielded": true
}
```

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Verify mothership appears with shield
3. Try to shoot mothership — verify no damage while shielded
4. Destroy all towers → verify phase transition
5. Destroy minions → verify mothership becomes vulnerable
6. Kill mothership → verify match end

## Notes
- Shield mechanics: mothership takes 0 damage while shielded
- Phase transitions are server-authoritative
- Elite minions in Phase 3 are optional stretch goal

## What to Implement Next → Phase 6
See [PHASE_6.md](./PHASE_6.md)
