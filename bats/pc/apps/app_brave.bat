@echo off
:: app_brave.bat — Opens Brave Browser
:: Usage: app_brave.bat [url]

set URL=%~1

if "%URL%"=="" (
    start "" "%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe"
    if errorlevel 1 start "" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
) else (
    start "" "%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe" "%URL%"
    if errorlevel 1 start "" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" "%URL%"
)
echo Brave launched