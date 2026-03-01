@echo off
:: app_browser.bat — Opens the DEFAULT system browser
:: Usage: app_browser.bat [url]
:: No URL = opens homepage in default browser

set URL=%~1
if "%URL%"=="" (
    start "" "about:blank"
) else (
    start "" "%URL%"
)
echo Default browser launched