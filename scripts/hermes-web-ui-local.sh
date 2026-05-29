#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_url="${HERMES_WEB_UI_REPO:-https://github.com/EKKOLearnAI/hermes-web-ui.git}"
repo_ref="${HERMES_WEB_UI_REF:-main}"

case "$(uname -s)" in
  Darwin*) default_app_data_dir="$HOME/Library/Application Support/app.hermes.desktop" ;;
  Linux*) default_app_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/app.hermes.desktop" ;;
  *) default_app_data_dir="$HOME/.hermes-desktop" ;;
esac

app_data_dir="${HERMES_DESKTOP_APP_DATA_DIR:-$default_app_data_dir}"
runtime_agent_dir="${HERMES_DESKTOP_RUNTIME_DIR:-$app_data_dir/runtime/hermes-agent}"
web_ui_dir="${HERMES_WEB_UI_DIR:-$runtime_agent_dir/hermes-web-ui}"
web_ui_home="${HERMES_WEB_UI_HOME:-$app_data_dir/hermes-web-ui-home}"
port="${PORT:-8648}"
frontend_url="http://localhost:8649"

usage() {
  cat <<EOF
Usage: scripts/hermes-web-ui-local.sh <command>

Commands:
  setup          Clone/install dependencies without starting the UI
  dev            Run the source dev server (frontend: $frontend_url, backend: http://localhost:8647)
  build          Build the Web UI source
  start          Start the built Web UI daemon on PORT=${port}
  foreground     Run the built Web UI in the foreground on PORT=${port}
  stop           Stop the Web UI daemon
  status         Show Web UI daemon status
  reset-login    Reset default login to admin / 123456
  update         Fast-forward the local hermes-web-ui checkout
  path           Print the local checkout path

Environment overrides:
  HERMES_DESKTOP_APP_DATA_DIR  App-managed Hermes Desktop data directory
  HERMES_DESKTOP_RUNTIME_DIR   Hermes Agent runtime directory
  HERMES_WEB_UI_DIR            hermes-web-ui checkout directory
  HERMES_WEB_UI_HOME           hermes-web-ui state directory
  HERMES_WEB_UI_REF            Git ref to clone/update, default: main
  PORT                         Built daemon/foreground port, default: 8648
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_tools() {
  require_command git
  require_command node
  require_command npm
}

ensure_runtime() {
  if [ ! -x "$runtime_agent_dir/hermes" ]; then
    cat >&2 <<EOF
Hermes Desktop runtime was not found at:
  $runtime_agent_dir

Start Hermes Desktop once or run its runtime prepare flow, then try again.
EOF
    exit 1
  fi
}

ensure_checkout() {
  ensure_tools
  ensure_runtime

  if [ -d "$web_ui_dir/.git" ]; then
    return
  fi

  if [ -e "$web_ui_dir" ]; then
    echo "Path exists but is not a Git checkout: $web_ui_dir" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$web_ui_dir")"
  git clone --depth 1 --branch "$repo_ref" "$repo_url" "$web_ui_dir"
}

ensure_dependencies() {
  ensure_checkout

  if [ -d "$web_ui_dir/node_modules" ]; then
    return
  fi

  (cd "$web_ui_dir" && npm ci)
}

update_checkout() {
  ensure_checkout

  if [ -n "$(git -C "$web_ui_dir" status --porcelain)" ]; then
    echo "Local hermes-web-ui checkout has changes; commit/stash them before updating:" >&2
    echo "  $web_ui_dir" >&2
    exit 1
  fi

  git -C "$web_ui_dir" fetch --depth 1 origin "$repo_ref"
  git -C "$web_ui_dir" checkout -B "$repo_ref" FETCH_HEAD
}

export_web_ui_env() {
  export HERMES_HOME="${HERMES_HOME:-$app_data_dir/hermes-home}"
  export HERMES_BIN="${HERMES_BIN:-$runtime_agent_dir/hermes}"
  export HERMES_AGENT_ROOT="${HERMES_AGENT_ROOT:-$runtime_agent_dir}"
  export HERMES_AGENT_BRIDGE_PYTHON="${HERMES_AGENT_BRIDGE_PYTHON:-$runtime_agent_dir/venv/bin/python}"
  export PYTHON="${PYTHON:-$runtime_agent_dir/venv/bin/python}"
  export HERMES_WEB_UI_HOME="$web_ui_home"
  export WORKSPACE_BASE="${WORKSPACE_BASE:-$repo_root}"
  export BIND_HOST="${BIND_HOST:-127.0.0.1}"
  export HERMES_WEB_UI_MANAGED_GATEWAY="${HERMES_WEB_UI_MANAGED_GATEWAY:-0}"
  export HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN="${HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN:-0}"
  export HERMES_AGENT_BRIDGE_ENDPOINT="${HERMES_AGENT_BRIDGE_ENDPOINT:-ipc:///tmp/hermes-desktop-web-ui-bridge.sock}"
  export HERMES_AGENT_BRIDGE_PLATFORM="${HERMES_AGENT_BRIDGE_PLATFORM:-desktop-web-ui-test}"
}

run_cli() {
  ensure_dependencies
  export_web_ui_env
  (cd "$web_ui_dir" && node bin/hermes-web-ui.mjs "$@")
}

command="${1:-}"

case "$command" in
  setup)
    ensure_dependencies
    printf 'hermes-web-ui is ready at:\n  %s\n' "$web_ui_dir"
    ;;
  dev)
    ensure_dependencies
    export_web_ui_env
    (cd "$web_ui_dir" && npm run dev)
    ;;
  build)
    ensure_dependencies
    export_web_ui_env
    (cd "$web_ui_dir" && npm run build)
    ;;
  start)
    ensure_dependencies
    export_web_ui_env
    if [ ! -f "$web_ui_dir/dist/server/index.js" ]; then
      (cd "$web_ui_dir" && npm run build)
    fi
    (cd "$web_ui_dir" && node bin/hermes-web-ui.mjs start --port "$port")
    ;;
  foreground)
    ensure_dependencies
    export_web_ui_env
    if [ ! -f "$web_ui_dir/dist/server/index.js" ]; then
      (cd "$web_ui_dir" && npm run build)
    fi
    (cd "$web_ui_dir" && node bin/hermes-web-ui.mjs "$port")
    ;;
  stop)
    run_cli stop
    ;;
  status)
    run_cli status
    ;;
  reset-login)
    run_cli reset-default-login
    ;;
  update)
    update_checkout
    rm -rf "$web_ui_dir/node_modules"
    ensure_dependencies
    ;;
  path)
    printf '%s\n' "$web_ui_dir"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
