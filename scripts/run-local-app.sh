#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8765}"
APP_URL="http://${HOST}:${PORT}"
HEALTH_URL="${APP_URL}/api/health"

info() {
  printf '%s\n' "$1"
}

open_app_window() {
  if [[ "${MARIA_APP_NO_OPEN:-}" == "1" ]]; then
    return
  fi

  if [[ -d "/Applications/Google Chrome.app" ]]; then
    open -na "Google Chrome" --args --app="$APP_URL" >/dev/null 2>&1 || open "$APP_URL"
    return
  fi

  open "$APP_URL"
}

wait_for_health() {
  local attempts=60
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

if ! command -v node >/dev/null 2>&1; then
  info "Node.js가 필요합니다. https://nodejs.org 에서 설치한 뒤 다시 실행하세요."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  info "npm을 찾지 못했습니다. Node.js 설치 상태를 확인하세요."
  exit 1
fi

if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  info "Maria Story Planner가 이미 실행 중입니다: $APP_URL"
  open_app_window
  exit 0
fi

if [[ ! -d node_modules ]]; then
  info "처음 실행 준비 중입니다. 의존성을 설치합니다..."
  npm ci
fi

if [[ ! -f dist/index.html ]]; then
  info "처음 실행 준비 중입니다. 앱을 빌드합니다..."
  npm run build
fi

info "Maria Story Planner를 시작합니다: $APP_URL"
npm start &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup INT TERM

if ! wait_for_health; then
  info "서버가 제 시간에 시작되지 않았습니다. 위 로그를 확인하세요."
  cleanup
  exit 1
fi

open_app_window
info "브라우저 창을 닫아도 서버는 이 실행 창이 열려 있는 동안 유지됩니다."
wait "$SERVER_PID"
