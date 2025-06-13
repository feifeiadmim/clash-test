@echo off
chcp 65001

echo.
echo ========================================
echo   Clash-V2 Proxy Node Processor
echo ========================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js not found
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

if not exist "input" mkdir input
if not exist "output" mkdir output

echo Starting Clash-V2...
echo.

node interactive-menu.js

echo.
echo Program finished.
pause
