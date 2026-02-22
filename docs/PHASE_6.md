# Phase 6: Polish for Playtests (The "Make It Fun" Pass)

## Goal
Make it feel good without complicating the architecture.

## What Exists (from Phase 5)
- Complete game loop: combat, economy, AI enemies, boss fight
- Agent API for external AI commander
- Phase-based boss encounter with win condition

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Interpolation/extrapolation for smooth rendering between snapshots
- [x] Better weapons feel (hit flash feedback, responsive fire input)
- [x] Simple VFX: hit flashes, explosions, particle effects
- [x] Spawn telegraphs so towers/ships aren't "pop-in unfair"
- [ ] Sound effects (optional, deferred)
- [x] UI polish: health bars, phase indicator, objectives, victory screen

## Key Files to Create/Modify
- `/client/src/interpolation.ts` - Snapshot interpolation logic
- `/client/src/vfx.ts` - Visual effects system
- `/client/src/ui.ts` - HUD, health bars, resource display
- `/client/src/game.ts` - Integrate interpolation, VFX, UI
- `/shared/constants.ts` - Tune fire rates, speeds, damage values

## Acceptance Test
- 5-minute playtest doesn't feel janky
- Server performance stays stable
- No visible "pop-in" for spawned entities
- Smooth movement even at varying network conditions

## 60-Second Smoke Test
1. Run `pnpm dev`
2. Play for 60 seconds
3. Check: ship movement is smooth (no jitter between snapshots)
4. Fire bullets — should feel responsive with visual/audio feedback
5. Enemies spawn with telegraphs (warning indicator before appearing)
6. Explosions play on entity death

## Notes
- Interpolation: lerp between last two snapshots, extrapolate if needed
- Keep VFX client-only — server doesn't know about particles
- Fire rate tuning: fast enough to feel fun, slow enough to require aim
- This phase is about feel, not features

## After This Phase
The game is playtest-ready. Future work:
- LLM agent integration via MCP
- Leaderboards
- Multiple weapon types
- Map variety
