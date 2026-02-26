@echo off
:: adb_volume.bat — Sets media volume on Android device via ADB
:: Usage: adb_volume.bat [DEVICE_IP] [VOLUME_LEVEL 0-15]

set DEVICE_IP=%~1
set VOLUME=%~2

if "%DEVICE_IP%"=="" (
    echo ERROR: DEVICE_IP required
    exit /b 1
)

if "%VOLUME%"=="" set VOLUME=8

adb connect %DEVICE_IP%:5555
adb -s %DEVICE_IP%:5555 shell media volume --stream 3 --set %VOLUME%

echo Volume set to %VOLUME% on %DEVICE_IP%