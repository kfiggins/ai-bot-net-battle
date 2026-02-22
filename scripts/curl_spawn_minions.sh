#!/usr/bin/env bash
# Spawn minion ships via the agent API
curl -s -X POST http://localhost:3001/agent/command \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"type":"agent_command","command":"spawn_ship","params":{"kind":"minion_ship","count":2,"lane":"mid"}}' \
  | python3 -m json.tool
