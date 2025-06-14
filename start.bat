@echo off
REM ===================== Project launcher (Windows) =====================
cd /d "%~dp0"

REM ---------- BACKEND ---------------------------------------------------
echo [1/2] Backend – creating / activating virtual-env …

cd backend

IF NOT EXIST venv (
    echo Creating venv with "py -3" …
    py -3 -m venv venv || (
        echo.
        echo Failed to create virtual-env. Do you have Python 3 installed?
        pause
        exit /b 1
    )
)

REM --- find an activation script that exists ---------------------------
SET "ACTIVATE_BAT=venv\Scripts\activate.bat"
SET "ACTIVATE_PS=venv\Scripts\Activate.ps1"

IF EXIST "%ACTIVATE_BAT%" (
    call "%ACTIVATE_BAT%"
) ELSE IF EXIST "%ACTIVATE_PS%" (
    REM Invoke PowerShell to source the PS1 if cmd version missing
    powershell -NoLogo -Command "& { & '%ACTIVATE_PS%' ; Invoke-Expression $env:ComSpec }"
) ELSE (
    echo.
    echo ERROR: Can’t find activation script in venv\Scripts.
    echo Your virtual-env is incomplete – reinstall Python.
    pause
    exit /b 1
)

echo Installing backend packages …
pip install --upgrade -r requirements.txt >nul

IF "%GEOAPIFY_KEY%"=="" (
    set /p GEOAPIFY_KEY=Enter your Geoapify API key: 
)

start "Flask-Backend" cmd /k "cd /d %%cd%% && call %ACTIVATE_BAT% && flask run --port 5000"

cd ..

REM ---------- FRONTEND --------------------------------------------------
echo [2/2] Frontend – installing npm packages …
cd frontend
IF NOT EXIST node_modules npm install

echo Launching React dev server …
npm start
