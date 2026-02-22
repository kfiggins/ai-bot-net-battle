import { TICK_MS, SNAPSHOT_INTERVAL, SERVER_PORT } from "shared";
import { Simulation } from "./sim.js";
import { createWSServer, broadcastSnapshot } from "./ws.js";
import { AIManager } from "./ai.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";
import { BossManager } from "./boss.js";
import { createHTTPServer } from "./http.js";

const sim = new Simulation();
const ai = new AIManager();
const economy = new Economy();
const agent = new AgentAPI();
const boss = new BossManager();
const { clients } = createWSServer(SERVER_PORT, sim);

createHTTPServer(SERVER_PORT, sim, economy, agent, boss);
console.log(`[server] WebSocket server listening on ws://localhost:${SERVER_PORT}`);
console.log(`[server] HTTP server listening on http://localhost:${SERVER_PORT + 1}`);

// Set up initial game state
function initGame() {
  // Spawn mothership
  boss.spawnMothership(sim);

  // Spawn initial enemy forces
  const m1 = sim.spawnEnemy("minion_ship", 700, 200);
  ai.registerEntity(m1.id);
  const m2 = sim.spawnEnemy("minion_ship", 750, 400);
  ai.registerEntity(m2.id);
  const t1 = sim.spawnEnemy("tower", 800, 300);
  ai.registerEntity(t1.id);
  const t2 = sim.spawnEnemy("tower", 750, 500);
  ai.registerEntity(t2.id);
  console.log("[server] Game initialized: mothership, 2 minions, 2 towers");
}

initGame();

setInterval(() => {
  sim.update();
  ai.update(sim);
  economy.update(sim, ai);
  agent.update(sim);
  boss.update(sim);

  if (sim.tick % SNAPSHOT_INTERVAL === 0) {
    const phaseInfo = boss.getPhaseInfo(sim);
    broadcastSnapshot(clients, sim, phaseInfo);
  }
}, TICK_MS);
