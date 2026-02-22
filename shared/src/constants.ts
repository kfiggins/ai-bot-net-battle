export const TICK_RATE = 30; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 15; // Hz (broadcast rate)
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
export const MINION_FIRE_RANGE = 250; // pixels

export const TOWER_HP = 100;
export const TOWER_RADIUS = 20;
export const TOWER_FIRE_COOLDOWN_TICKS = 20; // fires every ~0.67 seconds
export const TOWER_FIRE_RANGE = 300; // pixels

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
};

export const UNIT_CAPS: Record<string, number> = {
  minion_ship: 20,
  tower: 10,
};

export const BUILD_COOLDOWN_TICKS = 15; // 0.5 seconds between builds

// Agent API
export const AGENT_BUDGET_MAX = 10; // commands per budget window
export const AGENT_BUDGET_RESET_TICKS = 30 * 30; // 30 seconds at 30Hz

export const WORLD_WIDTH = 1024;
export const WORLD_HEIGHT = 768;

export const SERVER_PORT = 3000;
export const CLIENT_PORT = 5173;
