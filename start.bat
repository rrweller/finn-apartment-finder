@echo off
REM ===========================================================
REM  Unified launcher – Windows (cmd or PowerShell)
REM  Usage:  start.bat          :: development
REM          start.bat prod     :: production
REM ===========================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ───── choose mode ─────────────────────────────────────────
if /I "%1"=="prod" (
    set "MODE=prod"
) else (
    set "MODE=dev"
)

REM ───── persist GEOAPIFY_KEY (once) ─────────────────────────
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v GEOAPIFY_KEY 2^>nul') do set "GEOAPIFY_KEY=%%b"
if "%GEOAPIFY_KEY%"=="" (
    echo Geoapify API key not found.
    set /p GEOAPIFY_KEY=Enter your Geoapify API key: 
    REM  store permanently for this user
    setx GEOAPIFY_KEY "%GEOAPIFY_KEY%" >nul
)

REM ───── BACKEND  (venv + deps) ─────────────────────────────
echo.
echo [Backend] Preparing Python env …
cd backend
if not exist venv (
    py -3 -m venv venv
)
call venv\Scripts\activate.bat
pip install -q -r requirements.txt

if "%MODE%"=="prod" (
    pip install -q waitress
) else (
    REM  dev helpers (optional)
    pip install -q flask
)

REM ───── FRONTEND (only for dev or first-time prod build) ───
cd ..
set "NEED_REACT_BUILD="
if "%MODE%"=="dev" (
    cd frontend
    if not exist node_modules npm install
    echo.
    echo [Frontend] Launching React dev server …
    npm start
    goto :EOF
) else (
    if not exist backend\index.html set "NEED_REACT_BUILD=1"
)

if defined NEED_REACT_BUILD (
    echo.
    echo [Frontend] Building React production bundle …
    cd frontend
    if not exist node_modules npm ci
    npm run build
    xcopy /EHY build\* ..\backend\ >nul
    cd ..
)

REM ───── Run backend server (production) ────────────────────
echo.
echo [Backend] Starting Waitress on 0.0.0.0:5000 …
cd backend
start "" cmd /k "call venv\Scripts\activate.bat && waitress-serve --listen=0.0.0.0:5000 app:app"
echo Done. Server is up.
