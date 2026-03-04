@echo off
chcp 65001 >nul
echo ====================================
echo   FANROC 2026 - Live Scoring
echo ====================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/2] Cài đặt dependencies...
    call npm install
    echo.
)

echo [2/2] Khởi động server...
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3000
echo.
echo   Nhấn Ctrl+C để dừng server
echo ====================================
echo.

call npm run dev
pause
