#!/usr/bin/env bash
# QA stack: local PocketBase with seeded persona accounts + optional mock LLM.
#
#   tools/qa_stack.sh start   # start local PB (localhost:8090) + seed + mock LLM (localhost:8099)
#   tools/qa_stack.sh stop
#   tools/qa_stack.sh reset   # wipe data, re-seed
#
# The app points at this stack with:
#   EXPO_PUBLIC_PB_URL=http://localhost:8090
# and the coach talks to the mock LLM (EXPO_PUBLIC_MOCK_LLM=1) or real OpenRouter
# with a budget (see tools/qa_swarm.mjs for the per-persona budget guard).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK="$ROOT/.scratch/qa-stack"
PB="$STACK/pocketbase"
PB_DIR="$STACK/pb_data"
PB_PORT="${PB_PORT:-8090}"
LLM_PORT="${LLM_PORT:-8099}"
SUPER_EMAIL="qa-admin@intervals.test"
SUPER_PASS="qa-admin-pass"

is_up() { curl -s -o /dev/null "http://127.0.0.1:$PB_PORT/api/health" 2>/dev/null; }

start_pb() {
  if is_up; then echo "PB already up on :$PB_PORT"; return; fi
  mkdir -p "$STACK/logs"
  nohup "$PB" serve --http "127.0.0.1:$PB_PORT" --dir "$PB_DIR" > "$STACK/logs/pb.log" 2>&1 &
  echo $! > "$STACK/pb.pid"
  for i in $(seq 1 30); do is_up && break; sleep 1; done
  is_up || { echo "PB failed to start"; exit 1; }
  echo "PB up on :$PB_PORT"
}

super_token() {
  curl -s -X POST "http://127.0.0.1:$PB_PORT/api/collections/_superusers/auth-with-password" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}" | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))"
}

# Provision schema identical to production (same script of record), then seed
# persona accounts with DIFFERENT data shapes.
seed() {
  start_pb
  # superuser create (idempotent) — PB requires one before /api/collections works
  nohup "$PB" superuser upsert "$SUPER_EMAIL" "$SUPER_PASS" --dir "$PB_DIR" >/dev/null 2>&1 || true
  sleep 1
  echo "provisioning schema…"
  PB_URL="http://127.0.0.1:$PB_PORT" PB_EMAIL="$SUPER_EMAIL" PB_PASSWORD="$SUPER_PASS" \
    node "$ROOT/tools/pb_setup.mjs" >/dev/null 2>&1 || { echo "pb_setup failed"; exit 1; }
  echo "seeding personas…"
  PB_URL="http://127.0.0.1:$PB_PORT" PB_EMAIL="$SUPER_EMAIL" PB_PASSWORD="$SUPER_PASS" \
    node "$ROOT/tools/qa_seed_personas.mjs"
}

stop_all() {
  [ -f "$STACK/pb.pid" ] && kill "$(cat "$STACK/pb.pid")" 2>/dev/null || true
  [ -f "$STACK/llm.pid" ] && kill "$(cat "$STACK/llm.pid")" 2>/dev/null || true
  pkill -f "pocketbase serve --http 127.0.0.1:$PB_PORT" 2>/dev/null || true
  pkill -f "qa_mock_llm.mjs" 2>/dev/null || true
  echo "stopped"
}

case "${1:-start}" in
  start) start_pb; seed; node "$ROOT/tools/qa_mock_llm.mjs" "$LLM_PORT" & echo $! > "$STACK/llm.pid"; sleep 1; curl -s -o /dev/null "http://127.0.0.1:$LLM_PORT/health" && echo "mock LLM up on :$LLM_PORT" ;;
  reset) stop_all; rm -rf "$PB_DIR"; start_pb; seed ;;
  stop) stop_all ;;
  *) echo "usage: $0 [start|stop|reset]"; exit 1 ;;
esac
