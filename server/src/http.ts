import http from "node:http";
import { TICK_RATE } from "shared";
import { RoomManager } from "./room-manager.js";
import { config } from "./config.js";
import { log } from "./logger.js";

const startTime = Date.now();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** Per-IP rate limiter for HTTP command endpoint */
const commandRateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkCommandRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = commandRateLimiter.get(ip);
  if (!entry || now >= entry.resetAt) {
    commandRateLimiter.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= config.httpCommandRateLimitPerMin;
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

    // Health check — is the process alive and accepting connections?
    if (req.method === "GET" && req.url === "/healthz") {
      const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
      let totalPlayers = 0;
      let avgObservedRate = 0;
      let roomCount = 0;
      for (const room of roomManager.rooms.values()) {
        totalPlayers += room.connectedCount;
        if (room.state === "in_progress") {
          avgObservedRate += room.tickMetrics.observedTickRate;
          roomCount++;
        }
      }
      if (roomCount > 0) avgObservedRate /= roomCount;

      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        uptimeSec,
        rooms: roomManager.rooms.size,
        players: totalPlayers,
        tickRateTarget: TICK_RATE,
        tickRateObserved: Math.round(avgObservedRate * 10) / 10,
      }));
      return;
    }

    // Readiness check — is the server ready to accept game traffic?
    if (req.method === "GET" && req.url === "/readyz") {
      const uptimeSec = (Date.now() - startTime) / 1000;
      // Ready after 1 second of uptime (allow initialization)
      const ready = uptimeSec >= 1;
      res.writeHead(ready ? 200 : 503);
      res.end(JSON.stringify({ ready }));
      return;
    }

    // Metrics — detailed room-level observability
    if (req.method === "GET" && req.url === "/metrics") {
      const rooms = Array.from(roomManager.rooms.values()).map((room) => {
        const metrics = room.tickMetrics;
        return {
          roomId: room.roomId,
          state: room.state,
          players: room.connectedCount,
          tick: room.sim.tick,
          phase: room.boss.getPhaseInfo(room.sim).current,
          observedTickRate: Math.round(metrics.observedTickRate * 10) / 10,
          maxTickMs: metrics.maxTickMs,
          totalTicks: metrics.totalTicks,
          createdAt: room.createdAt,
        };
      });
      res.writeHead(200);
      res.end(JSON.stringify({
        uptimeSec: Math.floor((Date.now() - startTime) / 1000),
        totalRooms: roomManager.rooms.size,
        rooms,
      }));
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
          mode: room.agentControlMode,
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
      const ip = req.socket.remoteAddress ?? "unknown";
      if (!checkCommandRateLimit(ip)) {
        log.warn("HTTP command rate limit hit", { ip });
        res.writeHead(429);
        res.end(JSON.stringify({ ok: false, error: "rate_limited", detail: "Too many requests" }));
        return;
      }

      const room = roomManager.getRoom(cmdMatch[1]);
      if (!room) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "room_not_found" }));
        return;
      }

      try {
        if (room.state !== "in_progress") {
          res.writeHead(409);
          res.end(JSON.stringify({
            ok: false,
            error: "room_not_in_progress",
            detail: `Room is '${room.state}'. Start a match before issuing agent commands.`,
          }));
          return;
        }

        if (room.agentControlMode !== "external_agent") {
          res.writeHead(409);
          res.end(JSON.stringify({
            ok: false,
            error: "agent_mode_disabled",
            detail: "Room is running built-in fake AI mode. Enable Agent Mode in lobby to use external commands.",
          }));
          return;
        }

        const phase = room.boss.getPhaseInfo(room.sim);
        if (phase.matchOver) {
          res.writeHead(409);
          res.end(JSON.stringify({
            ok: false,
            error: "match_over",
            detail: "Match is over. Return to lobby and start a new game.",
          }));
          return;
        }

        const body = await readBody(req);
        const data = JSON.parse(body);
        const mothershipPos = room.boss.getMothershipPos(room.sim);
        const result = room.agent.processCommand(data, room.sim, room.economy, mothershipPos);
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

  // Periodic cleanup of stale rate limit entries
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of commandRateLimiter) {
      if (now >= entry.resetAt) commandRateLimiter.delete(ip);
    }
  }, 60_000);

  server.listen(port + 1, config.host);
  return server;
}
