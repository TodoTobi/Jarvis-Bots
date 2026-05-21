@echo off
:: bats/pc/system/start_listener.bat
:: Inicia el listener nativo de SISTEMA desde la carpeta de scripts del sistema.
:: Esta es la copia que vive en bats/pc/system/ para integración con BatBot.

set "PROJECT_ROOT=%~dp0..\..\..\"
set "LISTENER_PATH=%PROJECT_ROOT%listener\listener.py"

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado en PATH.
    pause
    exit /b 1
)

if not exist "%LISTENER_PATH%" (
    echo ERROR: No se encontro listener.py
    echo Ruta esperada: %LISTENER_PATH%
    pause
    exit /b 1
)

echo [SISTEMA] Iniciando listener nativo...
python "%LISTENER_PATH%"
pause