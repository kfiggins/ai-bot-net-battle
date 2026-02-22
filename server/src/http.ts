import http from "node:http";
import { RoomManager } from "./room-manager.js";

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
  roomManager: RoomManager
): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // List all rooms
    if (req.method === "GET" && req.url === "/rooms") {
      res.writeHead(200);
      res.end(JSON.stringify({ rooms: roomManager.getRoomSummaries() }));
      return;
    }

    // Room-specific state summary: /rooms/:roomId/summary
    const summaryMatch = req.url?.match(/^\/rooms\/([^/]+)\/summary$/);
    if (req.method === "GET" && summaryMatch) {
      const room = roomManager.getRoom(summaryMatch[1]);
      if (!room) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "room_not_found" }));
        return;
      }

      const summary = room.economy.getSummary(room.sim);
      const budget = room.agent.getBudgetInfo();
      const phase = room.boss.getPhaseInfo(room.sim);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          roomId: room.roomId,
          state: room.state,
          ...summary,
          strategy: room.agent.strategy,
          agentBudget: budget,
          phase,
        })
      );
      return;
    }

    // Room-specific agent command: /rooms/:roomId/agent/command
    const cmdMatch = req.url?.match(/^\/rooms\/([^/]+)\/agent\/command$/);
    if (req.method === "POST" && cmdMatch) {
      const room = roomManager.getRoom(cmdMatch[1]);
      if (!room) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "room_not_found" }));
        return;
      }

      try {
        const body = await readBody(req);
        const data = JSON.parse(body);
        const result = room.agent.processCommand(data, room.sim, room.economy);
        res.writeHead(result.ok ? 200 : 400);
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
      }
      return;
    }

    // Legacy endpoints hint
    if (req.url === "/state/summary" || req.url === "/agent/command") {
      res.writeHead(400);
      res.end(JSON.stringify({
        error: "use_room_endpoints",
        detail: "Use /rooms/:roomId/summary or /rooms/:roomId/agent/command",
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port + 1);
  return server;
}
