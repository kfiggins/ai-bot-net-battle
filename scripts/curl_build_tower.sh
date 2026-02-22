#!/usr/bin/env bash
# Build a tower via the agent API
curl -s -X POST http://localhost:3001/agent/command \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"type":"agent_command","command":"build_tower","params":{"x":600,"y":400}}' \
  | python3 -m json.tool
