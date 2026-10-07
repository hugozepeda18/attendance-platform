# Builds dist\gate.exe (one file, no install needed on the gate PC).
# Build with 32-bit Python 3.8 so the same exe runs on old Windows 7 / 32-bit PCs and on Windows 10/11.
#   powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
py -3.8-32 -m pip install --quiet "pyinstaller==5.13.2"  # pinned: re-test on Windows 7 before upgrading
py -3.8-32 test_gate.py
py -3.8-32 -m PyInstaller --onefile --noconsole --clean --name gate gate.py
Write-Host "Built dist\gate.exe. Copy it with gate-setup.ps1 and gate.ini.example to the gate PC."
