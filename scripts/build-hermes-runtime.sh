#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${HERMES_RUNTIME_OUT_DIR:-$repo_root/src-tauri/resources/hermes-runtime}"
expected_commit="${HERMES_AGENT_COMMIT:-343c54e35bfe8682dcf597aea1f0ea5278864156}"
# The upstream installer uses --branch during git clone/update; the explicit
# --commit below pins the final checkout to the official desktop version.
hermes_ref="${HERMES_AGENT_REF:-main}"
installer_ref="${HERMES_INSTALLER_REF:-$expected_commit}"
installer_url="${HERMES_INSTALLER_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/${installer_ref}/scripts/install.sh}"
keep_build="${HERMES_RUNTIME_KEEP_BUILD:-0}"
include_node_tools="${HERMES_RUNTIME_INCLUDE_NODE_TOOLS:-0}"
prune_runtime="${HERMES_RUNTIME_PRUNE:-1}"
validate_runtime="${HERMES_RUNTIME_VALIDATE:-1}"

case "$(uname -s)" in
  Darwin*) platform="darwin" ;;
  Linux*) platform="linux" ;;
  *)
    echo "Unsupported platform for this script. Build Windows runtime on Windows with a dedicated script." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

platform="${HERMES_RUNTIME_PLATFORM:-$platform}"
arch="${HERMES_RUNTIME_ARCH:-$arch}"
archive_name="hermes-runtime-${platform}-${arch}.tar.gz"
archive_path="$out_dir/$archive_name"
build_root="${HERMES_RUNTIME_BUILD_ROOT:-$(mktemp -d /tmp/hermes-runtime-build.XXXXXX)}"
stage_root="$(mktemp -d /tmp/hermes-runtime-stage.XXXXXX)"

for command in curl git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    echo "Install it yourself first. This script will not modify system dependencies." >&2
    exit 1
  fi
done

if [ "$include_node_tools" = "1" ]; then
  for command in node npm; do
    if ! command -v "$command" >/dev/null 2>&1; then
      echo "Missing required command: $command" >&2
      echo "Install it yourself first. This script will not modify system dependencies." >&2
      exit 1
    fi
  done

  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [ "$node_major" -lt 22 ]; then
    echo "Node.js 22 or newer is required to build Hermes Node/browser tools." >&2
    echo "Current Node.js: $(node --version)" >&2
    echo "Install/activate Node yourself first. This script will not install it for you." >&2
    exit 1
  fi
fi

cleanup() {
  rm -rf "$stage_root"
  if [ "$keep_build" != "1" ] && [ -z "${HERMES_RUNTIME_BUILD_ROOT:-}" ]; then
    rm -rf "$build_root"
  fi
}
trap cleanup EXIT

remove_python_caches() {
  local root="$1"

  find "$root" -type d -name '__pycache__' -prune -exec rm -rf {} +
  find "$root" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete
}

remove_macos_metadata() {
  local root="$1"

  find "$root" \
    \( \
      \( -type d -name '__MACOSX' -prune -exec rm -rf {} + \) \
      -o \( -name '._*' -exec rm -rf {} + \) \
      -o \( -name '.DS_Store' -exec rm -f {} + \) \
    \)
}

sign_macos_native_code() {
  local root="$1"
  local identity="${APPLE_SIGNING_IDENTITY:-}"

  if [ "$platform" != "darwin" ]; then
    return
  fi

  if [ -z "$identity" ] || [ "$identity" = "-" ]; then
    echo "Skipping macOS runtime native code signing (no Developer ID identity)."
    return
  fi

  for command in file codesign; do
    if ! command -v "$command" >/dev/null 2>&1; then
      echo "Missing required command for macOS runtime signing: $command" >&2
      exit 1
    fi
  done

  echo "Signing macOS runtime native code..."
  local signed_count=0
  local candidate
  local file_info

  while IFS= read -r -d '' candidate; do
    file_info="$(file -b "$candidate" || true)"
    case "$file_info" in
      *Mach-O*)
        codesign --force --timestamp --options runtime --sign "$identity" "$candidate"
        signed_count=$((signed_count + 1))
        ;;
    esac
  done < <(find "$root" -type f -print0)

  echo "Signed $signed_count macOS runtime native file(s)."
}

fake_bin="$build_root/fake-bin"
home_dir="$build_root/home"
hermes_home="$build_root/hermes-home"
install_dir="$build_root/hermes-agent"
uv_python_dir="$build_root/uv/python"
uv_bin_dir="$build_root/uv/bin"
cache_dir="$build_root/cache"
npm_cache_dir="$build_root/npm-cache"

mkdir -p "$fake_bin" "$home_dir" "$hermes_home" "$uv_python_dir" "$uv_bin_dir" "$cache_dir" "$npm_cache_dir" "$out_dir"

# Prevent the upstream installer from touching system package managers for
# optional tools during runtime packaging.
cat > "$fake_bin/ffmpeg" <<'EOF'
#!/usr/bin/env bash
echo "ffmpeg version hermes-runtime-build-placeholder"
EOF
chmod +x "$fake_bin/ffmpeg"

if ! command -v rg >/dev/null 2>&1; then
  cat > "$fake_bin/rg" <<'EOF'
#!/usr/bin/env bash
echo "ripgrep 0.0.0 hermes-runtime-build-placeholder"
EOF
  chmod +x "$fake_bin/rg"
fi

if [ "$include_node_tools" != "1" ]; then
  cat > "$fake_bin/node" <<'EOF'
#!/usr/bin/env bash
echo "v22.0.0"
EOF
  cat > "$fake_bin/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm skipped for minimal Hermes runtime packaging" >&2
exit 0
EOF
  cat > "$fake_bin/npx" <<'EOF'
#!/usr/bin/env bash
echo "npx skipped for minimal Hermes runtime packaging" >&2
exit 0
EOF
  chmod +x "$fake_bin/node" "$fake_bin/npm" "$fake_bin/npx"
fi

export HOME="$home_dir"
export HERMES_HOME="$hermes_home"
export UV_PYTHON_INSTALL_DIR="$uv_python_dir"
export UV_PYTHON_BIN_DIR="$uv_bin_dir"
export XDG_CACHE_HOME="$cache_dir"
export NPM_CONFIG_CACHE="$npm_cache_dir"
export HOMEBREW_NO_AUTO_UPDATE=1
export PATH="$fake_bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

echo "Building Hermes runtime"
echo "  ref:     $hermes_ref"
echo "  commit:  ${expected_commit:-not checked}"
echo "  target:  $platform-$arch"
echo "  build:   $build_root"
echo "  output:  $archive_path"
echo "  profile: $([ "$include_node_tools" = "1" ] && echo full || echo minimal)"
echo ""
echo "The upstream installer runs with temporary paths:"
echo "  HOME=$home_dir"
echo "  HERMES_HOME=$hermes_home"
echo "If it prints ~/.local/bin/hermes, that path is inside the temporary HOME above."
echo ""

curl -fsSL "$installer_url" -o "$build_root/install.sh"
install_args=(
  --branch "$hermes_ref"
  --skip-setup
  --skip-browser
  --hermes-home "$hermes_home"
  --dir "$install_dir"
)

if [ -n "$expected_commit" ]; then
  install_args+=(--commit "$expected_commit")
fi

bash "$build_root/install.sh" "${install_args[@]}"

actual_commit="$(cd "$install_dir" && git rev-parse HEAD)"
if [ -n "$expected_commit" ] && [ "$actual_commit" != "$expected_commit" ]; then
  echo "Hermes Agent commit mismatch." >&2
  echo "  expected: $expected_commit" >&2
  echo "  actual:   $actual_commit" >&2
  echo "Update HERMES_AGENT_COMMIT intentionally when bumping the bundled runtime." >&2
  exit 1
fi

resolve_python_runtime() {
  local runtime=""
  local venv_python="$install_dir/venv/bin/python"

  runtime="$(
    find "$uv_python_dir" -maxdepth 1 -type d -name 'cpython-3.11.*' \
      | sort \
      | tail -1
  )"
  if [ -n "$runtime" ] && [ -d "$runtime" ]; then
    printf '%s\n' "$runtime"
    return 0
  fi

  if [ ! -x "$venv_python" ]; then
    venv_python="$install_dir/venv/bin/python3"
  fi
  if [ -x "$venv_python" ]; then
    runtime="$("$venv_python" - <<'PY'
import pathlib
import sys

base_prefix = pathlib.Path(sys.base_prefix).resolve()
if base_prefix.exists():
    print(base_prefix)
PY
)"
    if [ -n "$runtime" ] && [ -d "$runtime" ]; then
      printf '%s\n' "$runtime"
      return 0
    fi
  fi

  return 1
}

python_runtime="$(resolve_python_runtime || true)"
if [ -z "$python_runtime" ]; then
  echo "Could not find CPython runtime under $uv_python_dir or from the staged venv base prefix." >&2
  exit 1
fi
python_version="$("$install_dir/venv/bin/python" - <<'PY'
import sys

print(".".join(str(part) for part in sys.version_info[:3]))
PY
)"
echo "Using CPython runtime: $python_runtime"

staged_agent="$stage_root/hermes-agent"
cp -a "$install_dir" "$staged_agent"
remove_macos_metadata "$staged_agent"

if [ "$prune_runtime" = "1" ]; then
  echo "Pruning development-only runtime content..."
  rm -rf \
    "$staged_agent/.agents" \
    "$staged_agent/.dockerignore" \
    "$staged_agent/.git" \
    "$staged_agent/.gitattributes" \
    "$staged_agent/.github" \
    "$staged_agent/.gitignore" \
    "$staged_agent/.hadolint.yaml" \
    "$staged_agent/.plans" \
    "$staged_agent/docker" \
    "$staged_agent/Dockerfile" \
    "$staged_agent/docker-compose.yml" \
    "$staged_agent/docker-compose.windows.yml" \
    "$staged_agent/docs" \
    "$staged_agent/datagen-config-examples" \
    "$staged_agent/flake.lock" \
    "$staged_agent/flake.nix" \
    "$staged_agent/infographic" \
    "$staged_agent/nix" \
    "$staged_agent/node_modules" \
    "$staged_agent/packaging" \
    "$staged_agent/plans" \
    "$staged_agent/tests" \
    "$staged_agent/ui-tui" \
    "$staged_agent/web" \
    "$staged_agent/website"

  find "$staged_agent" -type d -name 'node_modules' -prune -exec rm -rf {} +
  find "$staged_agent" -type d -name '.pytest_cache' -prune -exec rm -rf {} +
  find "$staged_agent" -type d -name '.ruff_cache' -prune -exec rm -rf {} +
  find "$staged_agent" -type d -name '.agents' -prune -exec rm -rf {} +
  find "$staged_agent" -type d -name 'dist' -path '*/dashboard/*' -prune -exec rm -rf {} +
else
  rm -rf "$staged_agent/.git"
fi

remove_python_caches "$staged_agent"
remove_macos_metadata "$staged_agent"

mkdir -p "$staged_agent/python"
python_runtime_name="$(basename "$python_runtime")"
cp -a "$python_runtime" "$staged_agent/python/$python_runtime_name"
remove_macos_metadata "$staged_agent/python/$python_runtime_name"

rm -f "$staged_agent/venv/bin/python" \
  "$staged_agent/venv/bin/python3" \
  "$staged_agent/venv/bin/python3.11"
ln -s "../../python/$python_runtime_name/bin/python3.11" "$staged_agent/venv/bin/python"
ln -s "python" "$staged_agent/venv/bin/python3"
ln -s "python" "$staged_agent/venv/bin/python3.11"

cat > "$staged_agent/venv/pyvenv.cfg" <<EOF
home = ../../python/$python_runtime_name/bin
implementation = CPython
version_info = $python_version
include-system-site-packages = false
EOF

site_packages="$staged_agent/venv/lib/python3.11/site-packages"
rm -f "$site_packages"/__editable__.hermes_agent-*.pth
rm -f "$site_packages"/__editable___hermes_agent_*_finder.py

cat > "$staged_agent/hermes" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
unset PYTHONHOME
export VIRTUAL_ENV="$DIR/venv"
export PYTHONPATH="$DIR${PYTHONPATH:+:$PYTHONPATH}"
exec "$DIR/venv/bin/python" -m hermes_cli.main "$@"
EOF
chmod +x "$staged_agent/hermes"

cat > "$staged_agent/venv/bin/hermes" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
exec "$ROOT/hermes" "$@"
EOF
chmod +x "$staged_agent/venv/bin/hermes"

echo "Testing staged runtime..."
version_output="$(PYTHONDONTWRITEBYTECODE=1 HERMES_HOME="$hermes_home" "$staged_agent/hermes" --version)"
printf '%s\n' "$version_output"
version_line="$(printf '%s\n' "$version_output" | sed -n '1p')"
remove_python_caches "$staged_agent"
remove_macos_metadata "$staged_agent"

cat > "$staged_agent/runtime-build-manifest.json" <<EOF
{
  "hermesAgentRef": "$hermes_ref",
  "hermesAgentCommit": "$actual_commit",
  "installerUrl": "$installer_url",
  "installerRef": "$installer_ref",
  "platform": "$platform",
  "arch": "$arch",
  "profile": "$([ "$include_node_tools" = "1" ] && echo full || echo minimal)",
  "version": "$version_line",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

if [ "$validate_runtime" = "1" ]; then
  echo "Validating staged runtime..."

  disallowed_paths=(
    "$staged_agent/.git"
    "$staged_agent/.github"
    "$staged_agent/.plans"
    "$staged_agent/docker"
    "$staged_agent/Dockerfile"
    "$staged_agent/docker-compose.yml"
    "$staged_agent/docker-compose.windows.yml"
    "$staged_agent/node_modules"
    "$staged_agent/packaging"
    "$staged_agent/plans"
    "$staged_agent/tests"
    "$staged_agent/ui-tui"
    "$staged_agent/web"
    "$staged_agent/website"
  )

  found_disallowed=0
  for path in "${disallowed_paths[@]}"; do
    if [ -e "$path" ]; then
      echo "Disallowed runtime path remains: ${path#$staged_agent/}" >&2
      found_disallowed=1
    fi
  done

  cache_hit="$(
    find "$staged_agent" \
      \( \
        \( -type d \( -name '__pycache__' -o -name 'node_modules' -o -name '.pytest_cache' -o -name '.ruff_cache' -o -name '__MACOSX' \) \) \
        -o \( -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '._*' -o -name '.DS_Store' \) \) \
      \) \
      -print \
      -quit
  )"

  if [ -n "$cache_hit" ]; then
    echo "Disallowed cache path remains: ${cache_hit#$staged_agent/}" >&2
    echo "Disallowed Python or dependency cache files remain in the staged runtime." >&2
    found_disallowed=1
  fi

  if [ "$found_disallowed" != "0" ]; then
    echo "Runtime validation failed. Re-run with HERMES_RUNTIME_VALIDATE=0 only for local debugging." >&2
    exit 1
  fi
fi

sign_macos_native_code "$staged_agent"

tmp_archive="$archive_path.tmp"
rm -f "$tmp_archive" "$archive_path"
tar -czf "$tmp_archive" -C "$stage_root" hermes-agent
mv "$tmp_archive" "$archive_path"

echo "Wrote $archive_path"
du -sh "$archive_path"

if [ "$keep_build" = "1" ] || [ -n "${HERMES_RUNTIME_BUILD_ROOT:-}" ]; then
  echo "Kept build root: $build_root"
fi
