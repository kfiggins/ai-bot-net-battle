# Deployment Runbook

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `WS_PORT` | `3000` | WebSocket server port |
| `HTTP_PORT` | `3001` | HTTP API port |
| `NODE_ENV` | `development` | `development` or `production` |
| `WS_RATE_LIMIT` | `60` | Max WS messages per connection per second |
| `JOIN_RATE_LIMIT` | `5` | Max join attempts per connection per minute |
| `HTTP_COMMAND_RATE_LIMIT` | `30` | Max agent commands per IP per minute |

## Build & Run

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start server (production)
NODE_ENV=production pnpm --filter server start

# Start client dev server (or serve built files)
pnpm --filter client build
# Serve client/dist with any static file server
```

## Health Checks

- **Liveness**: `GET /healthz` on HTTP port (3001 by default)
  - Returns `{ ok: true, uptimeSec, rooms, players, tickRateTarget, tickRateObserved }`
- **Readiness**: `GET /readyz` on HTTP port
  - Returns `{ ready: true }` after 1 second of uptime
  - Returns 503 during startup

## Metrics

`GET /metrics` returns per-room observability data:
```json
{
  "uptimeSec": 3600,
  "totalRooms": 2,
  "rooms": [
    {
      "roomId": "alpha-001",
      "state": "in_progress",
      "players": 3,
      "tick": 5400,
      "phase": 2,
      "observedTickRate": 29.9,
      "maxTickMs": 2,
      "totalTicks": 5400,
      "createdAt": 1708000000000
    }
  ]
}
```

## Reverse Proxy / WSS

For production, place behind a reverse proxy (nginx, Caddy, etc.) to terminate TLS.

### Caddy (simplest)
```
yourdomain.com {
    # Client static files
    handle /* {
        root * /path/to/client/dist
        file_server
    }

    # WebSocket
    handle /ws {
        reverse_proxy localhost:3000
    }

    # HTTP API
    handle /healthz {
        reverse_proxy localhost:3001
    }
    handle /readyz {
        reverse_proxy localhost:3001
    }
    handle /metrics {
        reverse_proxy localhost:3001
    }
    handle /rooms/* {
        reverse_proxy localhost:3001
    }
}
```

### nginx
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Client static files
    location / {
        root /path/to/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # HTTP API
    location ~ ^/(healthz|readyz|metrics|rooms) {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
}
```

**Client note**: When behind a reverse proxy, the client needs to connect to `wss://yourdomain.com/ws` instead of `ws://localhost:3000`. Update the client's WebSocket URL to be relative or configurable.

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:
1. Stops accepting new WebSocket and HTTP connections
2. Destroys all rooms (stops tick loops, closes player connections)
3. Exits after a 500ms flush delay

For zero-downtime restarts, use a process manager like `pm2` or container orchestration.

## Free-Tier Hosting Options

### Fly.io (recommended)
- Supports WebSockets natively
- Free tier: 3 shared-CPU VMs
- Auto-TLS via Fly proxy
```bash
fly launch
fly deploy
```

### Railway
- WebSocket support via proxy
- Free trial tier available
- Push-to-deploy from GitHub

### Render
- WebSocket support on paid plans
- Free tier for static sites (client)
- Starter plan for server

### Self-hosted (VPS)
- Any $5/mo VPS (DigitalOcean, Linode, Vultr)
- Use Caddy for auto-TLS
- Use `pm2` for process management:
```bash
pm2 start pnpm --name "game-server" -- --filter server start
pm2 save
```

## Limits & Guardrails

| Limit | Value | Configurable |
|-------|-------|-------------|
| Max rooms | 10 | `MAX_ROOMS` in constants |
| Max players per room | 4 | `MAX_PLAYERS_PER_ROOM` in constants |
| Reconnect timeout | 30s | `RECONNECT_TIMEOUT_MS` in constants |
| WS messages/sec/connection | 60 | `WS_RATE_LIMIT` env var |
| Join attempts/min/connection | 5 | `JOIN_RATE_LIMIT` env var |
| Agent commands/min/IP | 30 | `HTTP_COMMAND_RATE_LIMIT` env var |
| Agent command budget | 10/30s | `AGENT_BUDGET_MAX` in constants |
