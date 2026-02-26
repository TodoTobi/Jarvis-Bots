@echo off
:: open_vscode.bat — Opens Visual Studio Code
:: Opens in the last used folder

start "" code
if errorlevel 1 (
    start "" "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
)
echo VS Code launched