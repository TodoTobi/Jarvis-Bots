@echo off
:: app_chrome.bat — Opens Google Chrome
:: Usage: app_chrome.bat [url]

set URL=%~1

if "%URL%"=="" (
    start "" "chrome.exe"
    if errorlevel 1 start "" "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"
    if errorlevel 1 start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else (
    start "" "chrome.exe" "%URL%"
    if errorlevel 1 start "" "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" "%URL%"
)
echo Chrome launched