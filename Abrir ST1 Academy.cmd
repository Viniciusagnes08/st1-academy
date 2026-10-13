@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-ST1-Academy.ps1" -OpenBrowser
if errorlevel 1 pause
