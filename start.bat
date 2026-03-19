@echo off
echo ========================================
echo   Game Profitability Dashboard
echo ========================================
echo.
echo Starting Backend...
start "Backend" cmd /k "cd /d %~dp0backend && node server.js"

timeout /t 2 /nobreak >nul

echo Starting Frontend...
start "Frontend" cmd /k "cd /d %~dp0frontend && npx vite --host"

timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo  Opening browser...
echo ========================================
start http://localhost:5173

echo.
echo Both servers are running!
echo  - App:     http://localhost:5173
echo  - API:     http://localhost:3001
echo.
echo Close the two terminal windows to stop.
pause
