@echo off
:: restart_backend.bat
:: Mata el proceso Node actual y relanza el backend automáticamente.
:: Colocar en: pc/system/restart_backend.bat
:: Este bat es ejecutado por restartRoutes.js cuando NO hay PM2.

set PROJECT_ROOT=%~dp0..\..
cd /d "%PROJECT_ROOT%"

echo [Jarvis] Reiniciando backend...

:: Matar todos los procesos node en el puerto 3001
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do (
    echo [Jarvis] Terminando proceso PID %%a en puerto 3001...
    taskkill /f /pid %%a >nul 2>&1
)

:: Esperar 1 segundo
timeout /t 1 /nobreak >nul

:: Verificar si hay package.json con npm start
if exist "package.json" (
    echo [Jarvis] Iniciando con npm start...
    start "" cmd /k "cd /d "%PROJECT_ROOT%" && npm start"
) else (
    echo [Jarvis] Iniciando con node server.js...
    start "" cmd /k "cd /d "%PROJECT_ROOT%" && node server.js"
)

echo [Jarvis] Backend reiniciado. Reconectate en 3-5 segundos.
timeout /t 2 /nobreak >nul
exit