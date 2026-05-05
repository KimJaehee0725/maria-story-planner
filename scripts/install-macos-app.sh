#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Maria Story Planner"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${MARIA_INSTALL_ROOT:-$HOME/Applications/$APP_NAME}"
DESKTOP_LINK="${MARIA_DESKTOP_LINK:-$HOME/Desktop/$APP_NAME.app}"

info() {
  printf '%s\n' "$1"
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 20 || (major === 20 && minor >= 6) ? 0 : 1);
  ' >/dev/null 2>&1
}

install_node_with_pkg() {
  require_command curl "Node.js 설치를 위해 curl이 필요합니다."
  require_command sudo "Node.js 설치를 위해 sudo가 필요합니다."

  local index_json
  local version
  local pkg_path

  info "Node.js 공식 설치 패키지를 찾습니다..."
  index_json="$(curl -fsSL https://nodejs.org/dist/index.json)"
  version="$(printf '%s' "$index_json" | sed -n 's/.*"version":"\(v24\.[^"]*\)".*/\1/p' | head -n 1)"

  if [[ -z "$version" ]]; then
    version="$(printf '%s' "$index_json" | sed -n 's/.*"version":"\(v[0-9][^"]*\)".*/\1/p' | head -n 1)"
  fi

  [[ -n "$version" ]] || fail "Node.js 최신 버전을 확인하지 못했습니다. 네트워크 연결을 확인하세요."

  pkg_path="$TMP_DIR/node-$version.pkg"
  info "Node.js $version 설치 패키지를 다운로드합니다..."
  curl -fL "https://nodejs.org/dist/$version/node-$version.pkg" -o "$pkg_path"

  info "Node.js를 설치합니다. macOS 비밀번호 입력이 필요할 수 있습니다."
  sudo installer -pkg "$pkg_path" -target /
}

ensure_node() {
  if node_version_ok && command -v npm >/dev/null 2>&1; then
    info "Node.js 확인 완료: $(node -v)"
    return
  fi

  info "Node.js 20.6 이상이 필요합니다. 설치를 시도합니다."

  if command -v brew >/dev/null 2>&1; then
    info "Homebrew로 Node.js를 설치/업데이트합니다..."
    brew install node || brew upgrade node || true
  else
    install_node_with_pkg
  fi

  hash -r
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

  node_version_ok || fail "Node.js 설치 후에도 20.6 이상을 확인하지 못했습니다. 터미널을 다시 열고 설치기를 다시 실행하세요."
  command -v npm >/dev/null 2>&1 || fail "npm을 찾지 못했습니다. Node.js 설치 상태를 확인하세요."
  info "Node.js 설치 확인 완료: $(node -v)"
}

require_command rsync "rsync를 찾지 못했습니다. macOS 기본 rsync가 필요합니다."

PARENT_DIR="$(dirname "$INSTALL_ROOT")"
mkdir -p "$PARENT_DIR"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maria-story-planner-install.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

info "Maria Story Planner 설치를 준비합니다."
info "설치 위치: $INSTALL_ROOT"

ensure_node

if [[ -d "$INSTALL_ROOT/storage" ]]; then
  info "기존 저장 데이터를 보존합니다."
  mkdir -p "$TMP_DIR/preserved"
  rsync -a "$INSTALL_ROOT/storage/" "$TMP_DIR/preserved/storage/"
fi

if [[ -f "$INSTALL_ROOT/.env" && ! -f "$SOURCE_DIR/.env" ]]; then
  mkdir -p "$TMP_DIR/preserved"
  cp "$INSTALL_ROOT/.env" "$TMP_DIR/preserved/.env"
fi

rsync -a --delete \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "dist/" \
  --exclude ".tmp/" \
  --exclude "playwright-report/" \
  --exclude "test-results/" \
  --exclude "$APP_NAME.app/" \
  "$SOURCE_DIR/" "$TMP_DIR/app/"

if [[ -d "$TMP_DIR/preserved/storage" ]]; then
  rm -rf "$TMP_DIR/app/storage"
  mkdir -p "$TMP_DIR/app/storage"
  rsync -a "$TMP_DIR/preserved/storage/" "$TMP_DIR/app/storage/"
fi

if [[ -f "$TMP_DIR/preserved/.env" ]]; then
  cp "$TMP_DIR/preserved/.env" "$TMP_DIR/app/.env"
fi

if [[ ! -f "$TMP_DIR/app/.env" ]]; then
  info "주의: .env가 없습니다. LLM 기능을 쓰려면 설치 후 $INSTALL_ROOT/.env를 설정하세요."
fi

mkdir -p "$INSTALL_ROOT"
rsync -a --delete \
  --exclude "node_modules/" \
  --exclude "dist/" \
  --exclude "$APP_NAME.app/" \
  "$TMP_DIR/app/" "$INSTALL_ROOT/"

cd "$INSTALL_ROOT"

info "의존성을 설치합니다..."
npm ci

info "앱을 빌드합니다..."
npm run build

info "macOS 앱 번들을 생성합니다..."
npm run app:mac

if [[ "${MARIA_INSTALL_NO_DESKTOP:-}" != "1" ]]; then
  if [[ -e "$DESKTOP_LINK" && ! -L "$DESKTOP_LINK" ]]; then
    info "Desktop에 같은 이름의 항목이 있어 바로가기를 덮어쓰지 않았습니다: $DESKTOP_LINK"
  else
    rm -f "$DESKTOP_LINK"
    ln -s "$INSTALL_ROOT/$APP_NAME.app" "$DESKTOP_LINK"
    info "Desktop 바로가기를 만들었습니다: $DESKTOP_LINK"
  fi
fi

info "설치 완료."
info "실행 파일: $INSTALL_ROOT/$APP_NAME.app"
