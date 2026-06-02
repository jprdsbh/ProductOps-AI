@echo off
title TechDirector — Stop
cd /d "%~dp0"

echo Parando servicos...
pm2 stop all >nul 2>&1
pm2 delete all >nul 2>&1
docker compose stop >nul 2>&1

echo Tudo parado.
timeout /t 2 /nobreak >nul
