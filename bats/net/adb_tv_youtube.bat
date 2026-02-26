@echo off
:: adb_tv_youtube.bat — Opens YouTube on Android TV via ADB WiFi
:: Usage: adb_tv_youtube.bat [TV_IP] [search_query]
:: Requires: adb.exe in PATH (Android Platform Tools)

set TV_IP=%~1
set QUERY=%~2

if "%TV_IP%"=="" (
    echo ERROR: TV_IP required as first argument
    exit /b 1
)

:: Connect to TV
adb connect %TV_IP%:5555

:: Launch YouTube with optional search
if "%QUERY%"=="" (
    adb -s %TV_IP%:5555 shell am start -a android.intent.action.VIEW -d "https://www.youtube.com" com.google.android.youtube.tv
) else (
    set ENCODED_QUERY=%QUERY: =+%
    adb -s %TV_IP%:5555 shell am start -a android.intent.action.VIEW -d "https://www.youtube.com/results?search_query=%ENCODED_QUERY%"
)

echo YouTube opened on TV %TV_IP%