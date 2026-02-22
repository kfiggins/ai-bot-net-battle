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

export const WORLD_WIDTH = 1024;
export const WORLD_HEIGHT = 768;

export const SERVER_PORT = 3000;
export const CLIENT_PORT = 5173;
