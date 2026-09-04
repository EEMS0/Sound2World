#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m http.server 5173 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1
if command -v open >/dev/null 2>&1; then
  open http://localhost:5173
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:5173
else
  echo "Open http://localhost:5173 in your browser."
fi
wait "$SERVER_PID"
