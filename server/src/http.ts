import http from "node:http";
import { Economy } from "./economy.js";
import { Simulation } from "./sim.js";
import { AgentAPI } from "./agent.js";
import { BossManager } from "./boss.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function createHTTPServer(
  port: number,
  sim: Simulation,
  economy: Economy,
  agent: AgentAPI,
  boss: BossManager
): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/state/summary") {
      const summary = economy.getSummary(sim);
      const budget = agent.getBudgetInfo();
      const phase = boss.getPhaseInfo(sim);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ...summary,
          strategy: agent.strategy,
          agentBudget: budget,
          phase,
        })
      );
      return;
    }

    if (req.method === "POST" && req.url === "/agent/command") {
      try {
        const body = await readBody(req);
        const data = JSON.parse(body);
        const result = agent.processCommand(data, sim, economy);
        res.writeHead(result.ok ? 200 : 400);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port + 1);
  return server;
}
