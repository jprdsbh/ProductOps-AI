@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Copie .env.example para .env e configure as variaveis antes de iniciar.
  pause
  exit /b 1
)
if not exist "venv\Scripts\activate.bat" (
  echo Criando ambiente virtual...
  python -m venv venv
  call venv\Scripts\activate.bat
  pip install -r requirements.txt
) else (
  call venv\Scripts\activate.bat
)
echo TBot iniciando na porta 8000...
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
