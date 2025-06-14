#!/usr/bin/env bash
# ===================== Project launcher (bash) =====================
set -euo pipefail
cd "$(dirname "$0")"

# ---------- BACKEND --------------------------------------------------
echo "[1/2] Backend – creating / activating virtual-env …"
cd backend

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi

# Robust activation – stop if it fails
if [[ -f venv/bin/activate ]]; then
  source venv/bin/activate
else
  echo "ERROR: venv/bin/activate not found. Virtual-env corrupted."; exit 1
fi

pip install --upgrade -r requirements.txt >/dev/null

: "${GEOAPIFY_KEY:?GEOAPIFY_KEY not set – export it or type it now}"
# If you really want an interactive prompt, uncomment:
# if [[ -z "$GEOAPIFY_KEY" ]]; then read -rp "Enter GEOAPIFY_KEY: " GEOAPIFY_KEY; fi

flask run --port 5000 &
BACKEND_PID=$!
cd ..

# ---------- FRONTEND -------------------------------------------------
echo "[2/2] Frontend – installing npm packages …"
cd frontend
[[ -d node_modules ]] || npm install
npm start

echo "Stopping backend (PID $BACKEND_PID)…"
kill "$BACKEND_PID" 2>/dev/null || true
