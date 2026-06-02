@echo off
title TechDirector — Start
cd /d "%~dp0"

if not exist "%~dp0logs" mkdir "%~dp0logs"

echo.
echo  =========================================
echo   TechDirector — Iniciando todos os servicos
echo  =========================================
echo.

:: ── 1. Docker Desktop ────────────────────────────────────────────────────────
echo [1/4] Verificando Docker Desktop...
docker info >nul 2>&1
if %errorlevel% neq 0 (
  echo      Docker nao esta rodando. Iniciando Docker Desktop...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  echo      Aguardando Docker Desktop ficar pronto
  :wait_docker
  timeout /t 5 /nobreak >nul
  docker info >nul 2>&1
  if %errorlevel% neq 0 goto wait_docker
  echo      Docker Desktop pronto!
) else (
  echo      Docker ja esta rodando.
)

:: ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
echo [2/4] Iniciando PostgreSQL...
docker compose up -d >nul 2>&1
if %errorlevel% neq 0 (
  echo      ERRO ao subir o container do banco.
  pause
  exit /b 1
)

:: Aguarda o banco aceitar conexoes
echo      Aguardando PostgreSQL ficar pronto...
:wait_db
timeout /t 2 /nobreak >nul
docker compose exec -T db pg_isready -U postgres >nul 2>&1
if %errorlevel% neq 0 goto wait_db
echo      PostgreSQL pronto na porta 5432

:: ── 3. TBot venv ──────────────────────────────────────────────────────────────
echo [3/4] Verificando ambiente Python (TBot)...
set PYTHON=C:\Users\joaor\AppData\Local\Python\bin\python.exe
if not exist "%~dp0apps\tbot\venv" (
  echo      Criando venv do TBot...
  %PYTHON% -m venv "%~dp0apps\tbot\venv"
  "%~dp0apps\tbot\venv\Scripts\pip.exe" install -r "%~dp0apps\tbot\requirements.txt" -q
)
echo      Venv OK

:: ── 4. PM2 ────────────────────────────────────────────────────────────────────
echo [4/4] Iniciando API, Web e TBot via PM2...
pm2 resurrect >nul 2>&1
pm2 start "%~dp0ecosystem.config.js" --no-color >nul 2>&1
pm2 save >nul 2>&1
echo      PM2 gerenciando os processos

echo.
echo  =========================================
echo   Todos os servicos no ar!
echo  =========================================
echo.
echo    Admin:     http://localhost:3001/admin
echo    Changelog: http://localhost:3001/changelog
echo    API:       http://localhost:3002/api
echo    TBot:      http://localhost:8000/docs
echo.
echo  Comandos uteis:
echo    pm2 status        - ver status de todos os servicos
echo    pm2 logs          - ver logs em tempo real
echo    pm2 restart all   - reiniciar tudo
echo.
pause
