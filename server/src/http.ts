import http from "node:http";
import { Economy } from "./economy.js";
import { Simulation } from "./sim.js";

export function createHTTPServer(
  port: number,
  sim: Simulation,
  economy: Economy
): http.Server {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET" && req.url === "/state/summary") {
      const summary = economy.getSummary(sim);
      res.writeHead(200);
      res.end(JSON.stringify(summary));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port + 1); // HTTP on port 3001
  return server;
}
