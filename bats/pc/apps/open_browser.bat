@echo off
:: open_browser.bat — Opens the default browser
:: Optional: pass a URL as first argument

set URL=%~1
if "%URL%"=="" (
    start ""
) else (
    start "" "%URL%"
)
echo Browser launched