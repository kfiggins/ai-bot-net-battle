import { SERVER_PORT } from "shared";
import { RoomManager } from "./room-manager.js";
import { createWSServer } from "./ws.js";
import { createHTTPServer } from "./http.js";

const roomManager = new RoomManager();
createWSServer(SERVER_PORT, roomManager);
createHTTPServer(SERVER_PORT, roomManager);

console.log(`[server] WebSocket server listening on ws://localhost:${SERVER_PORT}`);
console.log(`[server] HTTP server listening on http://localhost:${SERVER_PORT + 1}`);
console.log(`[server] Waiting for players to create rooms...`);
