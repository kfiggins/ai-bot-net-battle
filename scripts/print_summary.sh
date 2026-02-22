#!/usr/bin/env bash
# Print the current game state summary
curl -s http://localhost:3001/state/summary | python3 -m json.tool
