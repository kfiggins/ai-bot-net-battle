import { TICK_MS, SNAPSHOT_INTERVAL, SERVER_PORT } from "shared";
import { Simulation } from "./sim.js";
import { createWSServer, broadcastSnapshot } from "./ws.js";

const sim = new Simulation();
const { clients } = createWSServer(SERVER_PORT, sim);

console.log(`[server] WebSocket server listening on ws://localhost:${SERVER_PORT}`);

setInterval(() => {
  sim.update();

  if (sim.tick % SNAPSHOT_INTERVAL === 0) {
    broadcastSnapshot(clients, sim);
  }
}, TICK_MS);
