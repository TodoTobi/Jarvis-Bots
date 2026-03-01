@echo off
:: app_cursor.bat — Opens Cursor AI IDE
:: Usage: app_cursor.bat [folder_or_file]

set TARGET=%~1

if "%TARGET%"=="" (
    start "" cursor
    if errorlevel 1 start "" "%LOCALAPPDATA%\Programs\cursor\Cursor.exe"
    if errorlevel 1 start "" "%PROGRAMFILES%\Cursor\Cursor.exe"
) else (
    start "" cursor "%TARGET%"
    if errorlevel 1 start "" "%LOCALAPPDATA%\Programs\cursor\Cursor.exe" "%TARGET%"
)
echo Cursor launched