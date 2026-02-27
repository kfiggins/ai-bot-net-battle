export const TICK_RATE = 30; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // Hz (broadcast rate)
export const SNAPSHOT_INTERVAL = Math.ceil(TICK_RATE / SNAPSHOT_RATE); // ticks between snapshots

export const PLAYER_MAX_SPEED = 200; // pixels per second (max speed cap)
export const PLAYER_ACCEL = 800;      // px/s² — thrust acceleration (~0.33s to max speed)
export const PLAYER_BRAKE_FRICTION = 0.80; // per-tick vel multiplier when no input (~0.3s to stop)
export const PLAYER_HP = 100;
export const PLAYER_RADIUS = 16;

export const BULLET_SPEED = 500; // pixels per second
export const BULLET_HP = 1;
export const BULLET_RADIUS = 4;
export const BULLET_TTL_TICKS = 120; // 4 seconds at 30Hz
export const BULLET_DAMAGE = 10;
export const FIRE_COOLDOWN_TICKS = 12; // ~5 shots/second at 30Hz
export const BULLET_RECOIL_FORCE = 60; // px/s impulse per shot opposite to aim (applied to entity.vel)

export const MINION_SPEED = 120; // pixels per second (max speed cap)
export const MINION_ACCEL = 400;           // px/s² — thrust acceleration for minions
export const MINION_BRAKE_FRICTION = 0.78; // per-tick vel multiplier when braking
export const MINION_HP = 30;
export const MINION_RADIUS = 12;
export const MINION_FIRE_COOLDOWN_TICKS = 30; // fires every 1 second
export const MINION_FIRE_RANGE = 420; // pixels

export const TOWER_HP = 100;
export const TOWER_RADIUS = 20;
export const TOWER_FIRE_COOLDOWN_TICKS = 20; // fires every ~0.67 seconds
export const TOWER_FIRE_RANGE = 900; // pixels

export const MISSILE_TOWER_HP = 150;
export const MISSILE_TOWER_RADIUS = 24;
export const MISSILE_TOWER_FIRE_COOLDOWN_TICKS = 90; // fires every 3 seconds
export const MISSILE_TOWER_FIRE_RANGE = 700; // pixels
export const MISSILE_BURST_SIZE = 3;           // missiles per burst
export const MISSILE_BURST_DELAY_TICKS = 5;    // ~167ms between burst shots

export const MISSILE_SPEED = 250; // pixels per second (fast, homing)
export const MISSILE_HP = 1;
export const MISSILE_RADIUS = 6;
export const MISSILE_TTL_TICKS = 480; // 816 seconds at 30Hz
export const MISSILE_DAMAGE = 15;
export const MISSILE_TURN_RATE = 2.5; // radians per second

// Player right-click missile
export const PLAYER_MISSILE_COOLDOWN_TICKS = 900; // 30 seconds at 30Hz
export const PLAYER_MISSILE_DAMAGE_MULT = 5;      // 5x effective bullet damage

export const MOTHERSHIP_HP = 500;
export const MOTHERSHIP_RADIUS = 40;

export const ENEMY_TEAM = 2;

// Economy
export const STARTING_BALANCE = 200;
export const INCOME_PER_SECOND = 10;
export const INCOME_PER_TICK = INCOME_PER_SECOND / TICK_RATE;

export const UNIT_COSTS: Record<string, number> = {
  minion_ship: 50,
  tower: 100,
  missile_tower: 125,
  phantom_ship: 65,
};

export const UNIT_CAPS: Record<string, number> = {
  minion_ship: 20,
  tower: 10,
  missile_tower: 5,
  phantom_ship: 5,
};

export const BUILD_COOLDOWN_TICKS = 15; // 0.5 seconds between builds

// Agent API
export const AGENT_BUDGET_MAX = 10; // commands per budget window
export const AGENT_BUDGET_RESET_TICKS = 30 * 30; // 30 seconds at 30Hz

export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

// Viewport (canvas) size — what the player sees at any moment
export const VIEWPORT_WIDTH = 1024;
export const VIEWPORT_HEIGHT = 768;

// Background grid spacing for spatial awareness
export const GRID_SPACING = 100;

// Bullet range
export const BULLET_MAX_RANGE = 600; // pixels from spawn point

// Tower placement
export const TOWER_MAX_SPAWN_DISTANCE = 500; // max pixels from mothership

// Enemy AI
export const ENEMY_AGGRO_RANGE = 700;   // pixels — start chasing when player enters
export const ENEMY_DEAGGRO_RANGE = 900;  // pixels — stop chasing when player leaves (hysteresis)
export const ENEMY_PATROL_RADIUS = 400;  // pixels — wander radius around mothership
export const ENEMY_PATROL_SPEED = 60;    // pixels/second — slower than chase speed

// Energy Orbs
export const ORB_RADIUS = 8;
export const ORB_XP_VALUE = 8;
export const MINION_KILL_XP = 16;
export const TOWER_KILL_XP = 32;
export const ORB_SPAWN_INTERVAL_TICKS = 15;  // spawn 1 orb every 0.5s
export const ORB_MAX_ON_MAP = 200;
export const ORB_SPAWN_PADDING = 100;        // pixels from world edge
export const ORB_INITIAL_COUNT = 100;        // orbs pre-seeded at game start

// Minion orb collection
export const MINION_ORB_RESOURCE = 10;       // mothership resources per orb collected

// XP & Leveling
export const MAX_LEVEL = 15;
export const XP_BASE = 10;
export const XP_SCALING = 1.5;
export const MILESTONE_LEVELS = [5, 10, 15];

/** XP needed to advance from `level` to `level+1` */
export function xpForLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(level, XP_SCALING));
}

export const SERVER_PORT = parseInt(process.env.WS_PORT ?? "3000", 10);
export const CLIENT_PORT = 5173;

// Stat Upgrades
export const UPGRADE_TYPES = ["damage", "speed", "health", "fire_rate"] as const;
export type UpgradeType = (typeof UPGRADE_TYPES)[number];
export const MAX_UPGRADE_PER_STAT = 5;

// Per-point bonuses (additive per upgrade level)
export const DAMAGE_PER_UPGRADE = 7;    // +3 bullet damage per point (base 10 → max 25)
export const SPEED_PER_UPGRADE = 30;    // +25 px/s per point raises max speed cap (base 200 → max 325)
export const ACCEL_PER_SPEED_UPGRADE = 70; // +40 px/s² per speed level (base 800 → max 1000)
export const HEALTH_PER_UPGRADE = 30;   // +20 max HP per point (base 100 → max 200)
export const FIRE_RATE_PER_UPGRADE = 1.2; // -1 tick off cooldown per point (base 6 → min 1)
export const RECOIL_REDUCTION_PER_SPEED_UPGRADE = 0.15; // 15% recoil reduction per speed level (max 5 → 25% of base)

// Cannon Milestones
export const CANNON_MILESTONES: Record<number, number> = {
  5: 2,   // level 5 → double cannon
  10: 3,  // level 10 → triple cannon
  15: 4,  // level 15 → quad cannon
};
export const CANNON_SPREAD_ANGLE = 0.15; // radians between each cannon (~8.6 degrees)
export const CANNON_LENGTH = 18;         // px from player center to cannon tip
export const CANNON_WIDTH = 5;           // px width of cannon barrel
export const CANNON_OFFSET_LATERAL = 6;  // px lateral spacing between cannon barrels

// Rooms
export const MAX_ROOMS = 10;
export const MAX_PLAYERS_PER_ROOM = 8;
export const RECONNECT_TIMEOUT_MS = 30_000; // 30 seconds to reconnect

// Nemesis Boss (Phase 15)
export const NEMESIS_HP = 1200;
export const NEMESIS_RADIUS = 38;
export const NEMESIS_SPEED = 220;               // px/s — max speed cap (slower than player)
export const NEMESIS_ACCEL = 300;               // px/s² — high accel so it feels reactive
export const NEMESIS_BULLET_DAMAGE = 12;
export const NEMESIS_SPIRAL_BULLET_SPEED = 400; // px/s (slower bullets, dodgeable by moving fast)
export const NEMESIS_SPIRAL_COUNT = 6;          // bullets per volley
export const NEMESIS_SPIRAL_FIRE_COOLDOWN_TICKS = 3;
export const NEMESIS_SPIRAL_ROTATE_PER_SHOT = 0.12;   // radians per volley (~6.9°) for spiral arms
export const NEMESIS_MISSILE_COOLDOWN_TICKS = 30;     // one missile per player every 2 seconds
export const NEMESIS_KILL_XP = 500;                   // awarded to all players on Nemesis death

// Phantom Ship — fast flanker that attacks from behind the mothership
export const PHANTOM_HP = 20;                      // very fragile (2 base bullets to kill)
export const PHANTOM_RADIUS = 10;                   // small target — hard to hit
export const PHANTOM_SPEED = 450;                   // faster than player (200 base)
export const PHANTOM_ACCEL = 500;                   // snappy, reactive thrust
export const PHANTOM_BRAKE_FRICTION = 0.82;
export const PHANTOM_FIRE_RANGE = 800;              // switches from pursuit to orbit-and-fire
export const PHANTOM_FIRE_COOLDOWN_TICKS = 90;      // 3 s between bursts
export const PHANTOM_BURST_SIZE = 5;                // bullets per burst
export const PHANTOM_BURST_DELAY_TICKS = 4;         // ~133 ms between shots in a burst
export const PHANTOM_GUARD_RADIUS = 800;            // px from mothership — activates when player enters
export const PHANTOM_ORBIT_RADIUS = 200;            // orbit radius around mothership while guarding
export const PHANTOM_ORBIT_ANGULAR_SPEED = 0.5;     // rad/s orbit speed (~12.6 s period)
export const PHANTOM_FLANK_DIST = 180;              // px past mothership center to park on far side
export const PHANTOM_FLANK_LOOK_AHEAD_S = 1.5;     // seconds to predict player pos when computing flank direction
export const PHANTOM_AIM_RANDOM_SPREAD = 0.20;      // max half-angle random offset on aim (radians)
export const PHANTOM_CHASE_ORBIT_RADIUS = 280;      // px — preferred circle radius when attacking player
export const PHANTOM_CHASE_ORBIT_SPEED = 1.6;       // rad/s — how fast the phantom circles the player
export const PHANTOM_KILL_XP = 20;                  // XP awarded to the shooter

// Boost particles
export const BOOST_PARTICLE_THRESHOLD = 30; // px/s — min speed to emit boost particles on AI/remote entities

// Sub-Base — secondary defensive structures around mothership
export const SUB_BASE_HP = 300;
export const SUB_BASE_RADIUS = 30;
export const SUB_BASE_DISTANCE = 700;               // px from mothership center (diagonal placement)
export const SUB_BASE_TOWER_RANGE = 250;             // max tower placement distance from sub-base
export const SUB_BASE_MAX_TOWERS = 2;                // per sub-base (any mix of tower/missile_tower)
export const SUB_BASE_POP_MINIONS = 5;               // +5 minion cap per alive sub-base
export const SUB_BASE_POP_PHANTOMS = 1;              // +1 phantom cap per alive sub-base
export const SUB_BASE_KILL_XP = 50;                  // XP award for destroying

// Body collision damage (player rams into solid enemy — not player vs player)
export const BODY_COLLISION_DAMAGE = 8;           // for mothership, towers, minions
export const NEMESIS_BODY_COLLISION_DAMAGE = 15;  // Nemesis does more on contact
export const BODY_COLLISION_COOLDOWN_TICKS = 45;  // 1.5s per-entity immunity window
