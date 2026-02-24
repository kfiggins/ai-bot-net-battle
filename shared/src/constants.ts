export const TICK_RATE = 30; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // Hz (broadcast rate)
export const SNAPSHOT_INTERVAL = Math.ceil(TICK_RATE / SNAPSHOT_RATE); // ticks between snapshots

export const PLAYER_SPEED = 200; // pixels per second
export const PLAYER_HP = 100;
export const PLAYER_RADIUS = 16;

export const BULLET_SPEED = 500; // pixels per second
export const BULLET_HP = 1;
export const BULLET_RADIUS = 4;
export const BULLET_TTL_TICKS = 90; // 3 seconds at 30Hz
export const BULLET_DAMAGE = 10;
export const FIRE_COOLDOWN_TICKS = 6; // ~5 shots/second at 30Hz

export const MINION_SPEED = 120; // pixels per second
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
};

export const UNIT_CAPS: Record<string, number> = {
  minion_ship: 20,
  tower: 10,
  missile_tower: 5,
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
export const ORB_XP_VALUE = 5;
export const MINION_KILL_XP = 10;
export const TOWER_KILL_XP = 25;
export const ORB_SPAWN_INTERVAL_TICKS = 15;  // spawn 1 orb every 0.5s
export const ORB_MAX_ON_MAP = 200;
export const ORB_SPAWN_PADDING = 100;        // pixels from world edge
export const ORB_INITIAL_COUNT = 100;        // orbs pre-seeded at game start

// Minion orb collection
export const MINION_ORB_RESOURCE = 10;       // mothership resources per orb collected
export const MINION_ORB_PICKUP_RANGE = 20;   // pixels (minion radius + orb radius)

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

// Rooms
export const MAX_ROOMS = 10;
export const MAX_PLAYERS_PER_ROOM = 4;
export const RECONNECT_TIMEOUT_MS = 30_000; // 30 seconds to reconnect
