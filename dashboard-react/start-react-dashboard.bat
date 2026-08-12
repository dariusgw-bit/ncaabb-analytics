@echo off
setlocal
cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_EXE%" (
  echo Node.js was not found at "%NODE_EXE%".
  echo Install Node.js or update this launcher with the correct path.
  pause
  exit /b 1
)

if not exist "%NPM_CMD%" (
  echo npm.cmd was not found at "%NPM_CMD%".
  echo Install Node.js or update this launcher with the correct path.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo node_modules was not found. Installing dependencies first...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting NCAA dashboard React app...
echo Local URL: http://localhost:5173/
start "" http://localhost:5173/
call "%NPM_CMD%" run dev
