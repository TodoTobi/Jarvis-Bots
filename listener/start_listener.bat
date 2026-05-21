@echo off
:: start_listener.bat — Inicia el listener nativo de SISTEMA en background
:: Ubicacion: bats/pc/system/start_listener.bat
:: También hay una copia en listener/start_listener.bat para arranque manual.
::
:: Uso:
::   Doble click   → abre ventana con logs del listener
::   Desde backend → llamado via spawn en server.js (opcional)

echo ============================================
echo   SISTEMA — Listener Nativo
echo   Escucha pasiva activa. Cerrá esta ventana
echo   para detener el listener.
echo ============================================
echo.

:: Detectar raíz del proyecto (dos niveles arriba de bats/pc/system/)
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\..\..\"

:: Si se ejecuta desde listener/ directamente, ajustar path
if exist "%~dp0listener.py" (
    set "LISTENER_PATH=%~dp0listener.py"
) else (
    set "LISTENER_PATH=%PROJECT_ROOT%listener\listener.py"
)

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado en PATH.
    pause
    exit /b 1
)

if not exist "%LISTENER_PATH%" (
    echo ERROR: No se encontro listener.py en:
    echo   %LISTENER_PATH%
    pause
    exit /b 1
)

echo Iniciando listener desde: %LISTENER_PATH%
echo.

python "%LISTENER_PATH%"

echo.
echo Listener detenido.
pause