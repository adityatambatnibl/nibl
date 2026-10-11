# Installs / updates the four backends as Windows services with NSSM.
# Run as Administrator on the SERVER, after scripts\SETUP.bat and scripts\BUILD-ALL.bat.
#   powershell -ExecutionPolicy Bypass -File scripts\install-services.ps1 -Nssm "C:\tools\nssm\win64\nssm.exe"
# Add -Start to start them now (stop the OLD OIPM/NPD services first - same ports 8000/8001).
param([string]$Nssm = "nssm.exe", [switch]$Start)
$Root = Split-Path -Parent $PSScriptRoot
$services = @(
    @{ Name = "NIBL-Portal-API";     Dir = "portal\backend" },
    @{ Name = "NIBL-OIPM-API";       Dir = "applications\OIPM\backend" },
    @{ Name = "NIBL-NPD-API";        Dir = "applications\NPD\backend" },
    @{ Name = "NIBL-AIDrawing-API";  Dir = "applications\AI-Drawing-Control\backend" }
)
# Start after PostgreSQL, so a server reboot does not leave the APIs without a database.
$pgService = (Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1).Name
foreach ($s in $services) {
    $dir = Join-Path $Root $s.Dir
    $bat = Join-Path $dir "run-prod.bat"
    $logs = Join-Path $dir "logs"; New-Item -ItemType Directory -Force -Path $logs | Out-Null
    if (-not (& $Nssm status $s.Name 2>$null)) { & $Nssm install $s.Name $bat | Out-Null }
    & $Nssm set $s.Name Application $bat | Out-Null
    & $Nssm set $s.Name AppDirectory $dir | Out-Null
    & $Nssm set $s.Name AppStdout (Join-Path $logs "stdout.log") | Out-Null
    & $Nssm set $s.Name AppStderr (Join-Path $logs "stderr.log") | Out-Null
    & $Nssm set $s.Name AppRotateFiles 1 | Out-Null
    & $Nssm set $s.Name AppRotateBytes 10485760 | Out-Null
    & $Nssm set $s.Name Start SERVICE_AUTO_START | Out-Null
    # Crash -> restart after 5 s (NSSM default action, made explicit).
    & $Nssm set $s.Name AppExit Default Restart | Out-Null
    & $Nssm set $s.Name AppRestartDelay 5000 | Out-Null
    & $Nssm set $s.Name DisplayName ("NIBL " + $s.Name.Replace("NIBL-", "").Replace("-API", "") + " API") | Out-Null
    if ($pgService) { & $Nssm set $s.Name DependOnService $pgService | Out-Null }
    if ($Start) { & $Nssm restart $s.Name | Out-Null }
    Write-Host ("{0,-20} {1}" -f $s.Name, (& $Nssm status $s.Name)) -ForegroundColor Green
}
if ($Start) { Write-Host "Next: scripts\SMOKE-TEST.bat" -ForegroundColor Cyan }
if (-not $Start) { Write-Host "Installed, not started. Stop the OLD OIPM (:8000) and NPD (:8001) services, then run again with -Start." -ForegroundColor Yellow }
