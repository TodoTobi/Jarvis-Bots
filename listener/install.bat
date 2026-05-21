@echo off
:: listener/install.bat — Instala dependencias del listener de SISTEMA
:: Ejecutar UNA SOLA VEZ antes de usar start_listener.bat

echo ============================================
echo   SISTEMA Listener — Instalacion
echo ============================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado en PATH.
    echo Instala Python desde https://python.org y asegurate de marcar "Add to PATH".
    pause
    exit /b 1
)

echo Instalando dependencias...
echo.

pip install SpeechRecognition==3.10.4 python-dotenv==1.0.1

echo.
echo Instalando pyaudio...
pip install pyaudio==0.2.14

if errorlevel 1 (
    echo.
    echo pyaudio fallo con pip directo. Intentando con pipwin...
    pip install pipwin
    pipwin install pyaudio
)

echo.
echo ============================================
echo   Instalacion completada.
echo   Ahora podes ejecutar: start_listener.bat
echo ============================================
pause