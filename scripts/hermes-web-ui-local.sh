#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-8648}"

case "$(uname -s)" in
  Darwin*) default_app_data_dir="$HOME/Library/Application Support/dev.cyole.ash" ;;
  Linux*) default_app_data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/dev.cyole.ash" ;;
  *) default_app_data_dir="$HOME/.ash-desktop" ;;
esac

app_data_dir="${ASH_DESKTOP_APP_DATA_DIR:-$default_app_data_dir}"
runtime_agent_dir="${ASH_DESKTOP_RUNTIME_DIR:-$app_data_dir/runtime/hermes-agent}"
web_ui_home="${HERMES_WEB_UI_HOME:-$app_data_dir/hermes-web-ui-home}"

usage() {
  cat <<EOF
Usage: scripts/hermes-web-ui-local.sh <command>

Commands:
  start          Start official hermes-web-ui daemon on PORT=${port}
  foreground     Run official hermes-web-ui in the foreground on PORT=${port}
  stop           Stop official hermes-web-ui daemon
  restart        Restart official hermes-web-ui daemon
  status         Show official hermes-web-ui daemon status
  reset-login    Reset default login to admin / 123456
  env            Print the Ash environment used by this wrapper

Environment overrides:
  ASH_DESKTOP_APP_DATA_DIR     App-managed Ash data directory
  ASH_DESKTOP_RUNTIME_DIR      Hermes Agent runtime directory
  HERMES_WEB_UI_HOME           hermes-web-ui state directory
  PORT                         Web UI port, default: 8648
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    return 1
  fi
}

ensure_official_cli() {
  if command -v hermes-web-ui >/dev/null 2>&1; then
    return
  fi

  cat >&2 <<EOF
Official hermes-web-ui CLI is not installed.

Install it with:
  npm install -g hermes-web-ui
EOF
  exit 1
}

ensure_runtime() {
  if [ ! -x "$runtime_agent_dir/hermes" ]; then
    cat >&2 <<EOF
Ash runtime was not found at:
  $runtime_agent_dir

Start Ash once or run its runtime prepare flow, then try again.
EOF
    exit 1
  fi

  if [ ! -x "$runtime_agent_dir/venv/bin/python" ]; then
    echo "Ash runtime Python was not found at:" >&2
    echo "  $runtime_agent_dir/venv/bin/python" >&2
    exit 1
  fi
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
  export HERMES_AGENT_BRIDGE_ENDPOINT="${HERMES_AGENT_BRIDGE_ENDPOINT:-ipc:///tmp/ash-web-ui-bridge.sock}"
}

print_env() {
  export_web_ui_env
  cat <<EOF
HERMES_HOME=$HERMES_HOME
HERMES_BIN=$HERMES_BIN
HERMES_AGENT_ROOT=$HERMES_AGENT_ROOT
HERMES_AGENT_BRIDGE_PYTHON=$HERMES_AGENT_BRIDGE_PYTHON
PYTHON=$PYTHON
HERMES_WEB_UI_HOME=$HERMES_WEB_UI_HOME
WORKSPACE_BASE=$WORKSPACE_BASE
BIND_HOST=$BIND_HOST
HERMES_WEB_UI_MANAGED_GATEWAY=$HERMES_WEB_UI_MANAGED_GATEWAY
HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN=$HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN
HERMES_AGENT_BRIDGE_ENDPOINT=$HERMES_AGENT_BRIDGE_ENDPOINT
PORT=$port
EOF
}

run_official_cli() {
  ensure_runtime
  ensure_official_cli
  export_web_ui_env
  hermes-web-ui "$@"
}

command="${1:-start}"
case "$command" in
  start)
    run_official_cli start --port "$port"
    ;;
  foreground)
    run_official_cli "$port"
    ;;
  stop|restart|status)
    run_official_cli "$command"
    ;;
  reset-login)
    run_official_cli reset-default-login
    ;;
  env)
    ensure_runtime
    print_env
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
