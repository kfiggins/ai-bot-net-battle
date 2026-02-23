import { RoomManager } from "./room-manager.js";
import { createWSServer } from "./ws.js";
import { createHTTPServer } from "./http.js";
import { config } from "./config.js";
import { log, setLogLevel } from "./logger.js";

if (config.isDev) {
  setLogLevel("debug");
}

const roomManager = new RoomManager();
const wss = createWSServer(config.wsPort, roomManager);
const httpServer = createHTTPServer(config.wsPort, roomManager);

log.info("Server started", {
  wsPort: config.wsPort,
  httpPort: config.httpPort,
  host: config.host,
  env: config.nodeEnv,
});

// Graceful shutdown
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  wss.close(() => {
    log.info("WebSocket server closed");
  });

  httpServer.close(() => {
    log.info("HTTP server closed");
  });

  // Destroy all rooms (stops tick loops, closes player connections)
  for (const room of roomManager.rooms.values()) {
    room.destroy();
  }
  roomManager.rooms.clear();
  log.info("All rooms destroyed");

  // Give pending I/O a moment to flush, then exit
  setTimeout(() => {
    log.info("Shutdown complete");
    process.exit(0);
  }, 500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
