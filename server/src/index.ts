import { TICK_MS, SNAPSHOT_INTERVAL, SERVER_PORT } from "shared";
import { Simulation } from "./sim.js";
import { createWSServer, broadcastSnapshot } from "./ws.js";
import { AIManager } from "./ai.js";

const sim = new Simulation();
const ai = new AIManager();
const { clients } = createWSServer(SERVER_PORT, sim);

console.log(`[server] WebSocket server listening on ws://localhost:${SERVER_PORT}`);

// Temporary: spawn some enemies for testing
function spawnTestEnemies() {
  const m1 = sim.spawnEnemy("minion_ship", 700, 200);
  ai.registerEntity(m1.id);
  const m2 = sim.spawnEnemy("minion_ship", 750, 400);
  ai.registerEntity(m2.id);
  const t1 = sim.spawnEnemy("tower", 800, 300);
  ai.registerEntity(t1.id);
  console.log("[server] Spawned test enemies: 2 minions, 1 tower");
}

spawnTestEnemies();

setInterval(() => {
  sim.update();
  ai.update(sim);

  if (sim.tick % SNAPSHOT_INTERVAL === 0) {
    broadcastSnapshot(clients, sim);
  }
}, TICK_MS);
