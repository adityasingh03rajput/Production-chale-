@echo off
echo ========================================
echo   STARTING ADMIN PANEL
echo ========================================
echo.
echo Checking admin panel dependencies...
cd admin-panel

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting Electron app...
echo.
call npm start

pause
