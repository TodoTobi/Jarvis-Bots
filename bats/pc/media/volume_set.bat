@echo off
REM ════════════════════════════════════════════════════════════════
REM  volume_set.bat — v2 LIMPIO — Sin nircmd requerido
REM  Uso: volume_set.bat 50    (0-100)
REM  Métodos (en orden de prioridad):
REM   1. nircmd.exe si está instalado
REM   2. PowerShell con Windows Audio COM API (nativo, sin extras)
REM   3. Teclas virtuales como fallback
REM ════════════════════════════════════════════════════════════════

SET LEVEL=%1
IF "%LEVEL%"=="" SET LEVEL=50
IF %LEVEL% LSS 0 SET LEVEL=0
IF %LEVEL% GTR 100 SET LEVEL=100

REM -- Método 1: nircmd (si está instalado) ----------------------
WHERE nircmd >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    SET /A VOL=%LEVEL%*655
    nircmd setsysvolume %VOL%
    echo Volumen al %LEVEL%%% (nircmd)
    EXIT /B 0
)

REM -- Método 2: PowerShell puro (Windows 7+, sin instalar nada) --
powershell -NoProfile -ExecutionPolicy Bypass -Command "$vol=[float]%LEVEL%/100; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;[Guid(\"\"1CB9AD4C-DBFA-4c32-B178-C2F568A703B2\"\")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]public interface IAudioEndpointVolume{int _(int a,int b,int c,int d);int SetMasterVolumeLevelScalar(float f,Guid g);int __(int a);int GetMasterVolumeLevelScalar(out float f);} [Guid(\"\"D666063F-1587-4E43-81F1-B948E807363F\"\")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]public interface IMMDevice{int Activate(ref Guid g,int c,int p,out IAudioEndpointVolume v);} [Guid(\"\"A95664D2-9614-4F35-A746-DE8DB63617E6\"\")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]public interface IMMDeviceEnumerator{int f();int GetDefaultAudioEndpoint(int d,int r,out IMMDevice p);} [ComImport,Guid(\"\"BCDE0395-E52F-467C-8E3D-C4579291692E\"\")]public class MME{}'; $e=[Activator]::CreateInstance([MME]) -as [IMMDeviceEnumerator]; $d=$null; $e.GetDefaultAudioEndpoint(0,1,[ref]$d)|Out-Null; $g=[Guid]'1CB9AD4C-DBFA-4c32-B178-C2F568A703B2'; $v=$null; $d.Activate([ref]$g,23,0,[ref]$v)|Out-Null; $v.SetMasterVolumeLevelScalar($vol,[Guid]::Empty)|Out-Null; Write-Host ('Volumen al ' + %LEVEL% + '%%')"
IF %ERRORLEVEL% EQU 0 EXIT /B 0

REM -- Método 3: Teclas virtuales (aproximado) --------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char]0xAD); Start-Sleep -m 200; $s=[Math]::Round(%LEVEL%/2); for($i=0;$i-lt$s;$i++){[System.Windows.Forms.SendKeys]::SendWait([char]0xAF);Start-Sleep -m 30}; Write-Host 'Volumen aprox. %LEVEL%%%'"
echo Volumen ajustado al %LEVEL%%%
EXIT /B 0