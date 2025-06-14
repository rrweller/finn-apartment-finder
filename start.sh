#!/usr/bin/env bash
# ===========================================================
#  Unified launcher – Linux/macOS
#  Usage:  ./start.sh          # development
#          ./start.sh prod     # production
# ===========================================================
set -euo pipefail
MODE=${1:-dev}

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOT"

# ───── persist GEOAPIFY_KEY (once) ───────────────────────────
ENVFILE="$HOME/.finn_apartment_finder_env"
[[ -f "$ENVFILE" ]] && source "$ENVFILE"

if [[ -z "${GEOAPIFY_KEY:-}" ]]; then
  read -rp "Enter your Geoapify API key: " GEOAPIFY_KEY
  echo "export GEOAPIFY_KEY=$GEOAPIFY_KEY" >> "$ENVFILE"
fi
export GEOAPIFY_KEY

# ───── BACKEND  (venv + deps) ───────────────────────────────
echo "[Backend] Preparing Python env …"
cd backend
[[ -d venv ]] || python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt
[[ $MODE == prod ]] && pip install -q gunicorn

# ───── FRONTEND  ─────────────────────────────────────────────
cd "$ROOT"
if [[ $MODE == dev ]]; then
  echo "[Frontend] Dev server …"
  cd frontend
  [[ -d node_modules ]] || npm install
  # backend (dev) in background
  FLASK_ENV=development flask --app "$ROOT/backend/app.py" run --port 5000 &
  BACK_PID=$!
  npm start
  kill "$BACK_PID"
  exit
else
  # production – build once if index.html is missing
  if [[ ! -f backend/index.html ]]; then
    echo "[Frontend] Building production bundle …"
    cd frontend
    [[ -d node_modules ]] || npm ci
    npm run build
    rsync -a --delete build/ ../backend/
  fi
fi

# ───── Run backend server (production) ──────────────────────
echo "[Backend] Starting Gunicorn on 0.0.0.0:5000 …"
exec gunicorn --workers 3 --bind 0.0.0.0:5000 app:app
