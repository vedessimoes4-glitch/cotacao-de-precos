@echo off
cd /d "%~dp0"
node scripts\stop-windows.mjs
timeout /t 2 >nul
