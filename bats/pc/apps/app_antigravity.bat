@echo off
:: app_antigravity.bat — Opens Antigravity (AI coding assistant)
:: Usage: app_antigravity.bat [folder_path]
:: Without args: opens Antigravity normally
:: With folder: opens Antigravity and navigates to that folder

set FOLDER=%~1

:: Try common install locations for Antigravity
:: Adjust the path below to match your actual Antigravity installation

if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    set APP="%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
) else if exist "%PROGRAMFILES%\Antigravity\Antigravity.exe" (
    set APP="%PROGRAMFILES%\Antigravity\Antigravity.exe"
) else if exist "%USERPROFILE%\AppData\Local\antigravity\Antigravity.exe" (
    set APP="%USERPROFILE%\AppData\Local\antigravity\Antigravity.exe"
) else (
    :: Fallback: try to launch by name (if in PATH)
    set APP=antigravity
)

if "%FOLDER%"=="" (
    start "" %APP%
) else (
    start "" %APP% "%FOLDER%"
)

echo Antigravity launched%FOLDER% and with folder: %FOLDER%