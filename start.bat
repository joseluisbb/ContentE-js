@echo off
title ContentE Web Server
echo Starting ContentE Web...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
