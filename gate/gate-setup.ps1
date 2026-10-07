# One-time setup of a gate PC. Run as Administrator from the folder holding gate.exe:
#   powershell -ExecutionPolicy Bypass -File gate-setup.ps1
# Written for PowerShell 2.0 (Windows 7) and later.
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
if (-not $dir) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Definition }
$exe = Join-Path $dir "gate.exe"
$ini = Join-Path $dir "gate.ini"

# 1. Config: school URL + this gate's SCANNER key
if (-not (Test-Path $ini)) {
  $url = Read-Host "URL del servidor (termina en /api/v1)"
  $key = Read-Host "Clave del escaner (ak_...)"
  $label = Read-Host "Nombre de esta puerta (ej. Entrada principal)"
  "[gate]`r`nserver_url = $url`r`napi_key = $key`r`nlabel = $label`r`nfullscreen = yes" | Out-File -FilePath $ini -Encoding UTF8
}

# 2. Start with Windows (all users' Startup folder)
$startup = [Environment]::GetFolderPath("CommonStartup")
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup "Asistencia gate.lnk"))
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $dir
$lnk.Save()

# 3. Never sleep, never turn the screen off (on AC power)
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
powercfg -change -monitor-timeout-ac 0

# 4. Keep the clock right (the server also corrects drift, this keeps it small)
Set-Service w32time -StartupType Automatic
Start-Service w32time -ErrorAction SilentlyContinue
w32tm /config /manualpeerlist:"time.windows.com,0x9 pool.ntp.org,0x9" /syncfromflags:manual /update
w32tm /resync /nowait

# 5. Antivirus: unsigned PyInstaller programs are often flagged; allow this folder in Windows Defender.
#    (Not available on Windows 7 / other antivirus: add the exclusion by hand, see RUNBOOK.)
try { Add-MpPreference -ExclusionPath $dir; Write-Host "Defender: carpeta permitida." }
catch { Write-Host "AVISO: agregue $dir como excepcion en el antivirus manualmente." }

Write-Host "Listo. Inicie gate.exe o reinicie la PC."
