export const TICK_RATE = 30; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 15; // Hz (broadcast rate)
export const SNAPSHOT_INTERVAL = Math.ceil(TICK_RATE / SNAPSHOT_RATE); // ticks between snapshots

export const PLAYER_SPEED = 200; // pixels per second
export const PLAYER_HP = 100;

export const WORLD_WIDTH = 1024;
export const WORLD_HEIGHT = 768;

export const SERVER_PORT = 3000;
export const CLIENT_PORT = 5173;
