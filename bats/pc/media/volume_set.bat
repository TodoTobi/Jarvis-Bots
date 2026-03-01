@echo off
:: volume_set.bat — Sets the system volume to an exact percentage (0-100)
:: Usage: volume_set.bat [level]
:: Requires: nircmd.exe in PATH or System32
:: nircmd setsysvolume takes values 0-65535

set LEVEL=%~1
if "%LEVEL%"=="" set LEVEL=50

:: Convert percentage to nircmd scale (0-65535)
:: Formula: level * 65535 / 100
set /a NIRCMD_VOL=(%LEVEL% * 65535) / 100

nircmd setsysvolume %NIRCMD_VOL%
echo Volume set to %LEVEL%%%