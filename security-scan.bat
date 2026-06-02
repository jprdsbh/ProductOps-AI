@echo off
title Security Scan
cd /d "%~dp0"
echo Rodando scan de seguranca...
node scripts\security-scan.mjs
echo.
pause
