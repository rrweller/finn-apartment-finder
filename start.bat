@echo off
REM ════════════════════════════════════════════════════════════════════
REM  Finn-Apartment-Finder – DEV launcher (Windows 10/11)
REM  • Creates/re-uses Python venv in backend\
REM  • Installs backend + frontend dependencies if missing
REM  • Persists GEOAPIFY_KEY in your user environment (prompt once)
REM  • Opens two consoles:
REM       ① Flask dev server  → http://localhost:5000
REM       ② React dev server  → http://localhost:3000 (auto-proxy /api/*)
REM ════════════════════════════════════════════════════════════════════
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ─── 0.  Persist GEOAPIFY_KEY (prompt once) ──────────────────────────
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v GEOAPIFY_KEY 2^>nul') do set "GEOAPIFY_KEY=%%b"
if "%GEOAPIFY_KEY%"=="" (
    echo.
    echo  You need a GEOAPIFY API key for reverse-geocoding.
    set /p GEOAPIFY_KEY=  Enter your GEOAPIFY_KEY: 
    echo.
    REM  Store permanently for this Windows user
    setx GEOAPIFY_KEY "%GEOAPIFY_KEY%" >nul
)

REM ─── 1.  Backend  – venv + deps ─────────────────────────────────────
echo [Backend]  Checking Python virtual-env …
cd backend
if not exist venv (
    echo    Creating venv …
    py -3 -m venv venv
)

call venv\Scripts\activate.bat

REM  Install/upgrade deps only if needed (quiet)
pip install -q --upgrade pip
pip install -q -r requirements.txt
REM  Flask is usually already in requirements, but ensure it:
pip install -q flask

REM ─── 2.  Launch Flask dev server in a new window  ────────────────────
echo [Backend]  Starting Flask dev server on http://localhost:5000 …
start "Flask-Dev" cmd /k ^
    "cd /d %cd% && call venv\Scripts\activate.bat && set FLASK_ENV=development && python app.py"

cd ..

REM ─── 3.  Frontend – node install (first time) + npm start ───────────
echo.
echo [Frontend] Preparing React dev server …
cd frontend
if not exist node_modules (
    echo    Installing npm packages – this may take a minute …
    npm install
)

echo.
echo [Frontend] Launching http://localhost:3000  (Ctrl+C to stop) …
npm start

REM ─── 4.  Cleanup notice ─────────────────────────────────────────────
echo.
echo  React dev server stopped.  Close the "Flask-Dev" window too.
pause
