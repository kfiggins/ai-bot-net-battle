# Phase 14: Stat Upgrades, Multi-Cannon Milestones & Minion Rally

## Goal
When a player levels up, they choose a stat upgrade. At milestone levels (5, 10, 15), they instead receive a cannon upgrade that adds an extra gun to their ship. Stat upgrades are capped per-stat so players must specialize. Enemy minions now rally back to defend the mothership once all turrets are destroyed.

## What Exists (from Phase 13)
- Energy orbs spawn across the map (constant drip, 100 pre-seeded at match start)
- Players collect orbs for XP, with scaling level curve (max level 15)
- Kill XP: minion kills give 10 XP, tower kills give 25 XP
- Level and XP tracked server-side, included in snapshots
- Full reset on death
- XP bar + level indicator in HUD
- Enemy minions collect orbs while patrolling to fund enemy economy

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [x] Shared: define upgrade types (damage, speed, health, fire_rate) and stat caps
- [x] Shared: upgrade request message (`player_upgrade`) in protocol
- [x] Shared: player upgrade state in snapshot (current upgrades per stat, cannon count)
- [x] Server: track pending upgrade points per player (earned on level-up)
- [x] Server: validate and apply stat upgrades (respect caps, deduct points)
- [x] Server: auto-apply cannon milestones at levels 5, 10, 15
- [x] Server: multi-cannon firing logic (2/3/4 bullets in spread pattern)
- [x] Server: stat upgrades affect actual gameplay (damage, speed, hp, fire rate)
- [x] Server: reset all upgrades on death (alongside XP/level reset from Phase 13)
- [x] Client: upgrade selection UI (appears on level-up, pick one of available stats)
- [x] Client: milestone notification (shows cannon upgrade at 5/10/15)
- [x] Client: visual indicator for cannon count (HUD or ship display)
- [x] Tests for upgrade application, cap enforcement, cannon milestones, multi-fire, death reset

### Phase 14 Additions (beyond original plan)
- [x] **Minion `return_to_base` behavior**: when all towers and missile towers are destroyed, enemy minions stop collecting orbs and rally back toward the mothership. If a player enters aggro range during the retreat, they switch to `chase` to attack; once the player leaves deaggro range they resume returning.
- [x] **FakeAI tuning**: tower cap raised 2 → 3, missile tower cap raised 1 → 2 so the AI field is more of a threat
- [x] **Missile tower rebalance**: fire range reduced 1400 → 700 px, missile speed increased 170 → 250 px/s (missiles arrive faster but from shorter distance)
- [x] **Missile tower cost reduced**: 200 → 125 resources (more accessible to enemy economy)
- [x] **ORB_MAX_ON_MAP increased**: 150 → 200 (denser orb field)

## Key Files Modified
- `/shared/src/protocol.ts` — Upgrade types, `player_upgrade` message, upgrade state in snapshot
- `/shared/src/constants.ts` — Upgrade values, caps, cannon spread, rebalanced missile tower constants
- `/server/src/sim.ts` — Apply upgrades to player stats, multi-cannon firing, upgrade validation, kill XP
- `/server/src/room.ts` — Handle upgrade messages, track pending points
- `/server/src/ai.ts` — `return_to_base` AI mode, `allTurretsDestroyed()`, `updateMinionReturnToBase()`
- `/server/src/fake-ai.ts` — Increased tower/missile-tower build caps
- `/client/src/game.ts` — Upgrade UI, cannon count display, milestone popup

## Constants (actual values)
```typescript
// Stat Upgrades
export const UPGRADE_TYPES = ["damage", "speed", "health", "fire_rate"] as const;
export const MAX_UPGRADE_PER_STAT = 5;

// Per-point bonuses
export const DAMAGE_PER_UPGRADE = 3;    // +3 bullet damage per point (base 10 → max 25)
export const SPEED_PER_UPGRADE = 25;    // +25 px/s per point (base 200 → max 325)
export const HEALTH_PER_UPGRADE = 20;   // +20 max HP per point (base 100 → max 200)
export const FIRE_RATE_PER_UPGRADE = 1; // -1 tick off cooldown per point (base 6 → min 1)

// Cannon Milestones
export const CANNON_MILESTONES: Record<number, number> = {
  5: 2,   // level 5 → double cannon
  10: 3,  // level 10 → triple cannon
  15: 4,  // level 15 → quad cannon
};
export const CANNON_SPREAD_ANGLE = 0.15; // radians between each cannon (~8.6 degrees)

// Missile tower (rebalanced)
export const MISSILE_TOWER_FIRE_RANGE = 700;            // was 1400 px
export const MISSILE_TOWER_FIRE_COOLDOWN_TICKS = 90;    // fires every 3 seconds
export const MISSILE_SPEED = 250;                       // was 170 px/s
// missile_tower cost: 125 resources (was 200)

// Orb cap
export const ORB_MAX_ON_MAP = 200;  // was 150
```

## Upgrade System Design

### Upgrade Points
- Players earn **1 upgrade point** per level-up
- At milestone levels (5, 10, 15): point auto-spent on cannon — **no stat choice**
- At all other levels (2–4, 6–9, 11–14): player picks a stat
- **12 stat upgrade points** + **3 cannon milestones** across a full run

### Stat Caps
- Each stat maxes at 5 upgrades
- Players can fully max **2 stats** (10 points) with 2 leftover — forces specialization

## Minion Return-to-Base Behavior

When all towers and missile towers are destroyed:

```
patrol / return_to_base → chase   when player enters ENEMY_AGGRO_RANGE (700px)
chase → return_to_base             when player leaves ENEMY_DEAGGRO_RANGE (900px) with no turrets
patrol → return_to_base            immediately when allTurretsDestroyed() = true
```

- Minions move toward `patrolCenter` (mothership position) at `ENEMY_PATROL_SPEED`
- Stop within `ENEMY_PATROL_RADIUS * 0.25` (100px) of the mothership
- Orb collection only happens in `patrol` mode — retreating minions are focused on returning

## Protocol Changes

### Message: `player_upgrade` (Client → Server)
```typescript
const PlayerUpgradeMessage = z.object({
  v: z.literal(1),
  type: z.literal("player_upgrade"),
  stat: z.enum(["damage", "speed", "health", "fire_rate"]),
});
```

### Snapshot (per player entity)
```typescript
upgrades: { damage: number; speed: number; health: number; fire_rate: number },
cannons: number,           // 1–4
pendingUpgrades: number,   // points available to spend
```

## Death Reset
- `level = 1`, `xp = 0`
- `upgrades = { damage: 0, speed: 0, health: 0, fire_rate: 0 }`
- `cannons = 1`, `pendingUpgrades = 0`
- Effective stats restored to base values, HP restored to base `PLAYER_HP`

## 60-Second Smoke Test
1. Run `pnpm dev` and start a match
2. Collect orbs until level 2 — upgrade panel appears with 4 stat choices
3. Pick "Damage" — confirm kills are faster
4. Hit level 5 — "CANNON UPGRADE!" notification, ship fires 2 bullets in spread
5. Destroy all towers and missile towers — watch minions retreat toward center
6. Approach a retreating minion — it breaks off to attack, then resumes retreat
7. Continue to level 10 — triple cannon
8. Die — confirm full reset: level 1, 1 cannon, base stats
9. Respawn — all upgrades available fresh again

## After This Phase
- Minion upgrades / leveling over time — enemy units that get stronger as the match goes on
- More upgrade types: bullet size, bullet range, shield, dash ability
- Prestige/class system at max level
- Visual ship evolution based on upgrade path chosen
