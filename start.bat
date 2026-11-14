@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   WhatsApp AI Assistant - Windows Local Launcher
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Please install Node.js 22 LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo [INFO] Created .env from .env.example.
    echo [ACTION REQUIRED] Open .env in Notepad and set your GEMINI_API_KEY before using AI features.
    echo.
  )
)

findstr /C:"MY_GEMINI_API_KEY" ".env" >nul 2>nul
if %errorlevel% equ 0 (
  echo [WARNING] Your .env file still contains the placeholder MY_GEMINI_API_KEY.
  echo Gemini AI features will ask you to set a valid GEMINI_API_KEY in .env.
  echo.
)

if not exist "node_modules" (
  echo [SETUP] Installing dependencies for first run...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Check your internet connection and Node.js version.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [BUILD] Building frontend production bundle...
  call npm run build
  if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

set HOST=127.0.0.1
set PORT=3000

echo [START] Launching local server at http://127.0.0.1:3000 ...
echo Keep this window open while using WhatsApp AI Assistant.
start "" "http://127.0.0.1:3000"
call npm run start
pause
