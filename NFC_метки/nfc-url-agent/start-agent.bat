@echo off
rem Portable launcher for NFC URL Agent.
rem %~dp0 = folder of this .bat, so it works from any clone location.
rem ASCII-only on purpose (cmd.exe code page safety).

chcp 65001 >nul
title NFC URL Agent
cd /d "%~dp0"

call npm.cmd run validate-config
if errorlevel 1 (
  echo.
  echo Config validation FAILED. Agent not started.
  echo See config\README.md
  pause
  exit /b 1
)

call npm.cmd start
echo.
echo Agent stopped.
pause
