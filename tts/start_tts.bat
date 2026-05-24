@echo off
echo ========================================
echo   SISTEMA TTS - Kokoro local
echo   Servidor en http://localhost:5002
echo ========================================
echo.

cd /d "%~dp0"

echo Verificando Python 3.12...
py -3.12 --version
if errorlevel 1 (
    echo.
    echo ERROR: Python 3.12 no encontrado.
    echo.
    echo Descargalo de:
    echo https://www.python.org/downloads/release/python-3129/
    echo.
    echo Instalalo con "Add to PATH" activado.
    echo Luego volvé a correr este bat.
    echo.
    pause
    exit /b 1
)

echo.
echo Instalando dependencias con Python 3.12...
py -3.12 -m pip install flask
py -3.12 -m pip install numpy
py -3.12 -m pip install soundfile
py -3.12 -m pip install scipy
py -3.12 -m pip install kokoro==0.7.16

echo.
echo ========================================
echo   Iniciando servidor TTS...
echo ========================================
py -3.12 tts_server.py
pause