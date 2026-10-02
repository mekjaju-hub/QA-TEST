# Copies VS Code settings and the GitHub Actions workflow into their dot-folders.
# (They are shipped under tools\ because remote file tools cannot write .vscode\ or .github\ directly.)
# Usage (PowerShell, from C:\Cludaemek\WebQA2026):  powershell -ExecutionPolicy Bypass -File scripts\setup-vscode-and-ci.ps1
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\.vscode", "$root\.github\workflows" | Out-Null
Copy-Item "$root\tools\vscode\*.json" "$root\.vscode\" -Force
Copy-Item "$root\tools\github\workflows\ci.yml" "$root\.github\workflows\ci.yml" -Force
Write-Host "OK: .vscode\ (settings, extensions, launch, tasks) and .github\workflows\ci.yml installed"
Write-Host "Open VS Code:  code `"$root\WebQA2026.code-workspace`""
