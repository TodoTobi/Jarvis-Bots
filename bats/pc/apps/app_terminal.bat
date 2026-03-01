@echo off
:: app_terminal.bat — Opens Windows Terminal or CMD
set FOLDER=%~1
if "%FOLDER%"=="" (
    start "" wt
    if errorlevel 1 start "" cmd
) else (
    start "" wt -d "%FOLDER%"
    if errorlevel 1 start /d "%FOLDER%" cmd
)
echo Terminal launched