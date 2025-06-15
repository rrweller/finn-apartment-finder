#!/usr/bin/env bash
###############################################################################
# Finn-Apartment-Finder – production launcher (Linux)
#   * creates/reuses venv
#   * persists GEOAPIFY_KEY in ~/.finn_apartment_finder_env
#   * builds React bundle once (or on --build)
#   * runs gunicorn on 127.0.0.1:5000
###############################################################################
set -euo pipefail
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
ENVFILE="$HOME/.finn_apartment_finder_env"
FORCE_BUILD=false
DAEMON=false

# ─── parse flags ─────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --build)   FORCE_BUILD=true ;;
    --daemon)  DAEMON=true      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done


# ───   0. GEOAPIFY_KEY persistence  ──────────────────────────────────────────
[[ -f "$ENVFILE" ]] && source "$ENVFILE"
if [[ -z "${GEOAPIFY_KEY:-}" ]]; then
  read -rp "Enter your GEOAPIFY_KEY: " GEOAPIFY_KEY
  echo "GEOAPIFY_KEY=$GEOAPIFY_KEY" >> "$ENVFILE"
fi
export GEOAPIFY_KEY
export FLASK_ENV=production

# ───   0a. generate React .env.production  ────────────────────────────────
ENV_OUT="$FRONTEND/.env.production"

echo "[Frontend] Syncing .env.production from $ENVFILE …"
grep -E '^(REACT_APP_|GEOAPIFY_KEY=)' "$ENVFILE" 2>/dev/null | sort >"$ENV_OUT.tmp" || true

# update only when content really changed (keeps inode date noise low)
if ! cmp -s "$ENV_OUT.tmp" "$ENV_OUT" 2>/dev/null; then
  mv "$ENV_OUT.tmp" "$ENV_OUT"
  echo "           wrote $(wc -l <"$ENV_OUT") variable(s)"
else
  rm "$ENV_OUT.tmp"
  echo "           unchanged"
fi

# ───   1. Python venv + deps     ─────────────────────────────────────────────
echo "[Backend]  Preparing virtual-env …"
if [[ ! -d "$BACKEND/venv" ]]; then
  python3 -m venv "$BACKEND/venv"
fi
source "$BACKEND/venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet --upgrade -r "$BACKEND/requirements.txt" gunicorn

# ───   2. React build            ─────────────────────────────────────────────
NEED_BUILD=$FORCE_BUILD
[[ ! -f "$BACKEND/index.html" ]] && NEED_BUILD=true

if $NEED_BUILD; then
  echo "[Frontend] Building production bundle …"
  cd "$FRONTEND"

  # install JS deps only when node_modules is missing
  [[ -d node_modules ]] || npm ci --silent

  npm run build --silent

  # ---------- copy bundle without nuking backend/python stuff -------------
  BUILD_DIR="$FRONTEND/build"
  STATIC_DST="$BACKEND/static"

  mkdir -p "$STATIC_DST"

  # 1) synchronise static assets, delete old chunks that are no longer built
  rsync -a --delete "$BUILD_DIR/static/" "$STATIC_DST/"

  # 2) copy top-level files that React puts next to static/
  cp -u "$BUILD_DIR"/{index.html,manifest.json,robots.txt,*.ico}  "$BACKEND/" 2>/dev/null || true
fi

# ───   3. Launch Gunicorn        ─────────────────────────────────────────────
cd "$BACKEND"
CMD=("$BACKEND/venv/bin/gunicorn" "-w" "3" "-b" "127.0.0.1:5000" "app:app")

if $DAEMON; then
  echo "[Backend] Starting Gunicorn in background → gunicorn.log"
  nohup "${CMD[@]}" >"$ROOT/gunicorn.log" 2>&1 &
  echo "PID $!"
else
  echo "[Backend] Gunicorn running on http://127.0.0.1:5000  (Ctrl-C to stop)"
  exec "${CMD[@]}"
fi
