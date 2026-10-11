# =============================================================================
#  NIBL Application Portal - nightly backup (databases + uploaded files)
#  Installed as a daily Windows task by scripts\install-backup-task.ps1.
#  Run by hand any time:  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
#
#  <BackupDir>\<yyyy-MM-dd_HHmm>\
#       nibl_portal.dump  nibl_oipm.dump  nibl_npd.dump  nibl_drawing.dump   (pg_dump -Fc)
#       data\OIPM  data\NPD  data\AI-Drawing-Control                          (copies)
#  Backups older than -KeepDays are removed. Restore one database with:
#       pg_restore -U postgres -h 127.0.0.1 -p <port> -d <db> --clean <file>.dump
# =============================================================================
param([string]$BackupDir = "D:\NIBL-BACKUPS", [int]$KeepDays = 14)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$Log = Join-Path $BackupDir "backup.log"
function Say([string]$m) { $l = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Write-Host $l; Add-Content -LiteralPath $Log -Value $l }

function Read-Env([string]$path) {
    $h = @{}
    if (-not (Test-Path $path)) { return $h }
    foreach ($l in Get-Content -LiteralPath $path -Encoding UTF8) {
        $t = $l.Trim(); if (-not $t -or $t.StartsWith("#") -or -not $t.Contains("=")) { continue }
        $i = $t.IndexOf("="); $h[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
    return $h
}
function DbFromUrl([string]$u) { if ($u -match '/([^/?]+)(\?|$)') { return $Matches[1] } return "" }

$portal = Read-Env (Join-Path $Root "portal\backend\.env")
$oipm   = Read-Env (Join-Path $Root "applications\OIPM\backend\.env")
$npd    = Read-Env (Join-Path $Root "applications\NPD\backend\.env")
$draw   = Read-Env (Join-Path $Root "applications\AI-Drawing-Control\backend\.env")
$dbs = @($portal["DB_NAME"], $oipm["DB_NAME"], (DbFromUrl $npd["SUPABASE_DB_URL"]), (DbFromUrl $draw["DATABASE_URL"])) | Where-Object { $_ } | Select-Object -Unique
if (-not $dbs) { $dbs = "nibl_portal", "nibl_oipm", "nibl_npd", "nibl_drawing" }

$pgDump = $null
foreach ($s in (Get-CimInstance Win32_Service | Where-Object { $_.Name -like "postgresql*" })) {
    if ($s.PathName -match '"([^"]+\\bin)\\pg_ctl\.exe"') { $pgDump = Join-Path $Matches[1] "pg_dump.exe" }
}
if (-not $pgDump -or -not (Test-Path $pgDump)) { Say "FAILED: pg_dump.exe not found"; exit 1 }

$target = Join-Path $BackupDir (Get-Date -Format "yyyy-MM-dd_HHmm")
New-Item -ItemType Directory -Force -Path $target | Out-Null
Say "Backup to $target"
$failed = 0
$env:PGPASSWORD = $portal["DB_PASSWORD"]
foreach ($db in $dbs) {
    $file = Join-Path $target "$db.dump"
    & $pgDump -U $portal["DB_USER"] -h $portal["DB_HOST"] -p $portal["DB_PORT"] -Fc -f $file $db 2>&1 | ForEach-Object { Say "   $_" }
    if ($LASTEXITCODE -eq 0 -and (Test-Path $file)) { Say ("   {0,-14} {1:N1} MB" -f $db, ((Get-Item $file).Length / 1MB)) }
    else { Say "   FAILED: $db"; $failed++ }
}
$env:PGPASSWORD = ""

foreach ($app in "OIPM", "NPD", "AI-Drawing-Control") {
    $src = Join-Path $Root "applications\$app\data"
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $target "data\$app"
    robocopy $src $dst /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Say "   FAILED: copy of $app data"; $failed++ } else { Say "   files     $app" }
}

Get-ChildItem -LiteralPath $BackupDir -Directory |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' -and $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays) } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force; Say "   removed old backup $($_.Name)" }

if ($failed) { Say "Backup finished with $failed error(s)"; exit 1 }
Say "Backup OK"
