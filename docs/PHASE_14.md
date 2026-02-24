# Phase 14: Stat Upgrades & Multi-Cannon Milestones

## Goal
When a player levels up, they choose a stat upgrade. At milestone levels (5, 10, 15), they instead receive a cannon upgrade that adds an extra gun to their ship. Stat upgrades are capped per-stat so players must specialize — you can't max everything.

## What Exists (from Phase 13)
- Energy orbs spawn across the map (constant drip)
- Players collect orbs for XP, with scaling level curve (max level 15)
- Level and XP tracked server-side, included in snapshots
- Full reset on death
- XP bar + level indicator in HUD

## How to Run
```bash
pnpm install
pnpm dev
```

## Deliverables
- [ ] Shared: define upgrade types (damage, speed, health, fire_rate) and stat caps
- [ ] Shared: upgrade request message (`player_upgrade`) in protocol
- [ ] Shared: player upgrade state in snapshot (current upgrades per stat, cannon count)
- [ ] Server: track pending upgrade points per player (earned on level-up)
- [ ] Server: validate and apply stat upgrades (respect caps, deduct points)
- [ ] Server: auto-apply cannon milestones at levels 5, 10, 15
- [ ] Server: multi-cannon firing logic (2/3/4 bullets in spread pattern)
- [ ] Server: stat upgrades affect actual gameplay (damage, speed, hp, fire rate)
- [ ] Server: reset all upgrades on death (alongside XP/level reset from Phase 13)
- [ ] Client: upgrade selection UI (appears on level-up, pick one of available stats)
- [ ] Client: milestone notification (shows cannon upgrade at 5/10/15)
- [ ] Client: visual indicator for cannon count (HUD or ship display)
- [ ] Tests for upgrade application, cap enforcement, cannon milestones, multi-fire, death reset

## Key Files to Create/Modify
- `/shared/src/protocol.ts` - Upgrade types, player_upgrade message, upgrade state in snapshot
- `/shared/src/constants.ts` - Upgrade values, caps, cannon spread angles
- `/server/src/sim.ts` - Apply upgrades to player stats, multi-cannon firing, upgrade validation
- `/server/src/room.ts` - Handle upgrade messages, track pending points
- `/client/src/game.ts` - Render upgrade UI, show cannon count, apply visual cues
- `/client/src/ui.ts` - Upgrade selection panel, milestone popup
- `/client/src/net.ts` - Send upgrade choice to server

## New Constants
```typescript
// Stat Upgrades
export const UPGRADE_TYPES = ["damage", "speed", "health", "fire_rate"] as const;
export const MAX_UPGRADE_PER_STAT = 5;  // can't put more than 5 points into one stat

// Per-point bonuses (additive per upgrade level)
export const DAMAGE_PER_UPGRADE = 3;      // +3 bullet damage per point (base 10 → max 25)
export const SPEED_PER_UPGRADE = 25;      // +25 px/s per point (base 200 → max 325)
export const HEALTH_PER_UPGRADE = 20;     // +20 max HP per point (base 100 → max 200)
export const FIRE_RATE_PER_UPGRADE = 1;   // -1 tick off cooldown per point (base 6 → min 1)

// Cannon Milestones
export const CANNON_MILESTONES: Record<number, number> = {
  5: 2,   // level 5 → double cannon
  10: 3,  // level 10 → triple cannon
  15: 4,  // level 15 → quad cannon
};
export const CANNON_SPREAD_ANGLE = 0.15;  // radians between each cannon (~8.6 degrees)
```

## Upgrade System Design

### Upgrade Points
- Players earn **1 upgrade point** per level-up
- At milestone levels (5, 10, 15), the point is automatically spent on cannon upgrade — **no choice**
- At all other levels (2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14), player chooses a stat
- **12 stat upgrade points** available across a full run (levels 2-4, 6-9, 11-14)
- **3 cannon milestones** (automatic)

### Stat Caps
- Each stat maxes at **5 upgrades**
- With 12 points and 4 stats capped at 5: max possible = 20, available = 12
- Players can fully max **2 stats** (10 points) with 2 leftover, OR spread across 3-4 stats
- Forces meaningful specialization

### Upgrade Breakdown by Level
| Level | Upgrade Type | Notes |
|-------|-------------|-------|
| 2     | Stat choice  | Pick: damage, speed, health, or fire_rate |
| 3     | Stat choice  | |
| 4     | Stat choice  | |
| **5** | **Cannon → 2** | **Automatic — double cannon** |
| 6     | Stat choice  | |
| 7     | Stat choice  | |
| 8     | Stat choice  | |
| 9     | Stat choice  | |
| **10**| **Cannon → 3** | **Automatic — triple cannon** |
| 11    | Stat choice  | |
| 12    | Stat choice  | |
| 13    | Stat choice  | |
| 14    | Stat choice  | |
| **15**| **Cannon → 4** | **Automatic — quad cannon** |

## Protocol Changes

### New Message: `player_upgrade` (Client → Server)
```typescript
const PlayerUpgradeMessage = z.object({
  v: z.literal(1),
  type: z.literal("player_upgrade"),
  stat: z.enum(["damage", "speed", "health", "fire_rate"]),
});
```

### Snapshot Additions (per player entity)
```typescript
// Added to player entity in snapshot
upgrades: {
  damage: number;     // 0-5
  speed: number;      // 0-5
  health: number;     // 0-5
  fire_rate: number;  // 0-5
},
cannons: number;        // 1-4
pendingUpgrades: number; // points available to spend
```

## Implementation Notes

### Server: Upgrade Application
- On level-up, increment `pendingUpgrades` for that player
- If level is a milestone (5, 10, 15): auto-apply cannon upgrade, do NOT increment pendingUpgrades
- On `player_upgrade` message:
  - Validate: player has pendingUpgrades > 0
  - Validate: chosen stat < MAX_UPGRADE_PER_STAT
  - Apply: increment stat, decrement pendingUpgrades
  - Recalculate effective stats immediately

### Server: Effective Stats Calculation
```typescript
function getEffectiveStats(player) {
  return {
    damage: BULLET_DAMAGE + player.upgrades.damage * DAMAGE_PER_UPGRADE,
    speed: PLAYER_SPEED + player.upgrades.speed * SPEED_PER_UPGRADE,
    maxHp: PLAYER_HP + player.upgrades.health * HEALTH_PER_UPGRADE,
    fireCooldown: Math.max(1, FIRE_COOLDOWN_TICKS - player.upgrades.fire_rate * FIRE_RATE_PER_UPGRADE),
  };
}
```

### Server: Multi-Cannon Firing
When a player fires with N cannons:
- For 1 cannon: fire straight ahead (current behavior)
- For 2 cannons: fire at `aimAngle ± CANNON_SPREAD_ANGLE/2`
- For 3 cannons: fire at `aimAngle - CANNON_SPREAD_ANGLE`, `aimAngle`, `aimAngle + CANNON_SPREAD_ANGLE`
- For 4 cannons: fire at `aimAngle ± CANNON_SPREAD_ANGLE/2` and `aimAngle ± 3*CANNON_SPREAD_ANGLE/2`
- All bullets spawned on the same tick, same cooldown applies
- Each bullet uses the player's current effective damage

### Server: Death Reset
On player death (extending Phase 13 reset):
- `level = 1`, `xp = 0`
- `upgrades = { damage: 0, speed: 0, health: 0, fire_rate: 0 }`
- `cannons = 1`
- `pendingUpgrades = 0`
- Recalculate effective stats to base values
- Restore HP to base PLAYER_HP

### Client: Upgrade Selection UI
- When `pendingUpgrades > 0`, show upgrade panel (overlay or bottom bar)
- Display 4 stat buttons: Damage, Speed, Health, Fire Rate
- Each shows current level (e.g., "Damage 2/5") and what the upgrade does
- Grey out stats that are at max (5/5)
- Panel stays visible until all pending points are spent
- Player can still move and shoot while choosing (not paused)
- Clicking a stat sends `player_upgrade` message to server

### Client: Milestone Notification
- At levels 5, 10, 15: show a prominent "CANNON UPGRADE!" notification
- Brief animation or flash effect
- Update cannon count indicator in HUD

### Client: Cannon Count Display
- Small icon or number near the player's ship or in HUD showing current cannon count
- Could also visually change the ship sprite/circle to hint at multiple barrels

## Stat Upgrade Effects Summary
| Stat | Base | Per Point | At Max (5) | Feel |
|------|------|-----------|------------|------|
| Damage | 10 | +3 | 25 (+150%) | Hits much harder |
| Speed | 200 px/s | +25 | 325 px/s (+63%) | Noticeably faster |
| Health | 100 HP | +20 | 200 HP (+100%) | Twice as tanky |
| Fire Rate | 6 ticks (5/s) | -1 tick | 1 tick (30/s) | Bullet hose |

## 60-Second Smoke Test
1. Run `pnpm dev` and start a match
2. Collect orbs until level 2 — upgrade panel appears with 4 stat choices
3. Pick "Damage" — panel closes, confirm damage increases (kills faster)
4. Level up a few more times — pick different stats, verify effects
5. Hit level 5 — "CANNON UPGRADE!" notification, ship now fires 2 bullets in a spread
6. Try to upgrade a stat to 6/5 — button should be greyed out / rejected
7. Continue to level 10 — triple cannon kicks in
8. Die to an enemy — confirm everything resets: level 1, 1 cannon, base stats
9. Respawn and re-level — all upgrades available fresh again

## Notes
- The upgrade panel is non-blocking — players keep fighting while choosing. This avoids frustrating pauses during combat.
- Fire rate going from 5/s to 30/s is dramatic — balanced by the opportunity cost of not upgrading damage/speed/health.
- Cannon spread is tight (8.6 degrees between barrels) so multi-cannon is a DPS multiplier, not a shotgun.
- All calculations are server-authoritative. Client sends intent ("I want to upgrade damage"), server validates and applies.
- Upgrade values are intentionally in constants — easy to tune without code changes.

## After This Phase
- More upgrade types in the future (bullet size, bullet range, shield, dash ability)
- Prestige/class system at max level
- Visual ship evolution based on upgrade path
- Enemy ships that also level up over time
