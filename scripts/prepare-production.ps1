# =============================================================================
#  NIBL Application Portal - switch the server to PRODUCTION settings
#  Run: scripts\PREPARE-PRODUCTION.bat (as Administrator, on the SERVER)
#
#  1. Asks the address users open (http://nibl or https://nibl).
#  2. Asks a NEW strong database password and sets it in PostgreSQL.
#  3. Writes production settings into the four .env files
#     (scripts\prepare_production.py - copies kept as .env.bak-<date>).
#  4. Restarts the four NSSM services so they use the new settings.
#  Passwords are never printed or written to a log.
# =============================================================================
param([string]$PublicUrl = "", [switch]$KeepPassword, [switch]$NoRestart)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
function Say([string]$m, [string]$c = "Gray") { Write-Host $m -ForegroundColor $c }

function Read-Env([string]$path) {
    $h = @{}
    foreach ($l in Get-Content -LiteralPath $path -Encoding UTF8) {
        $t = $l.Trim(); if (-not $t -or $t.StartsWith("#") -or -not $t.Contains("=")) { continue }
        $i = $t.IndexOf("="); $h[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
    return $h
}

$portalEnv = Join-Path $Root "portal\backend\.env"
if (-not (Test-Path $portalEnv)) { Say "STOPPED: portal\backend\.env not found - run scripts\SETUP.bat first." Red; exit 1 }
$cfg = Read-Env $portalEnv

# ---- 1. address --------------------------------------------------------------
if (-not $PublicUrl) {
    $PublicUrl = Read-Host "Address users open [http://nibl]  (type https://nibl only if IIS already has an https certificate)"
    if (-not $PublicUrl) { $PublicUrl = "http://nibl" }
}
$PublicUrl = $PublicUrl.Trim().TrimEnd("/")

# ---- 2. database password ----------------------------------------------------
$newPw = ""
if (-not $KeepPassword) {
    while ($true) {
        $a = Read-Host "NEW database password (12+ characters, letters and numbers; Enter = keep current)" -AsSecureString
        $p1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
        if (-not $p1) { break }
        if ($p1.Length -lt 12 -or $p1 -notmatch '[A-Za-z]' -or $p1 -notmatch '\d' -or $p1 -match "['`"\s]") {
            Say "   Too weak, or contains a quote / space. Try again." Yellow; continue
        }
        $b = Read-Host "Type it again" -AsSecureString
        $p2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
        if ($p1 -ne $p2) { Say "   The two do not match. Try again." Yellow; continue }
        $newPw = $p1; break
    }
}

if ($newPw) {
    # Find psql of the PostgreSQL service (same way as setup.ps1).
    $psql = $null
    foreach ($s in (Get-CimInstance Win32_Service | Where-Object { $_.Name -like "postgresql*" })) {
        if ($s.PathName -match '"([^"]+\\bin)\\pg_ctl\.exe"') { $psql = Join-Path $Matches[1] "psql.exe" }
    }
    if (-not $psql -or -not (Test-Path $psql)) { Say "STOPPED: psql.exe not found (is PostgreSQL installed as a service?)." Red; exit 1 }
    $user = if ($cfg["DB_USER"]) { $cfg["DB_USER"] } else { "postgres" }
    $env:PGPASSWORD = $cfg["DB_PASSWORD"]
    $sql = "ALTER USER `"$user`" WITH PASSWORD '$newPw';"
    $out = $sql | & $psql -U $user -h $cfg["DB_HOST"] -p $cfg["DB_PORT"] -d postgres -X -q 2>&1 | Out-String
    $env:PGPASSWORD = ""
    if ($LASTEXITCODE -ne 0) { Say "STOPPED: could not change the database password: $($out.Trim())" Red; exit 1 }
    Say "   Database password changed in PostgreSQL." Green
}

# ---- 3. .env files -----------------------------------------------------------
$py = Join-Path $Root "applications\NPD\backend\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
$env:NIBL_NEW_PG_PASSWORD = $newPw
& $py (Join-Path $PSScriptRoot "prepare_production.py") --public-url $PublicUrl
$code = $LASTEXITCODE
$env:NIBL_NEW_PG_PASSWORD = ""
if ($code -eq 1) { exit 1 }
if ($newPw -and $code -ne 0) {
    Say "   NOTE: PostgreSQL already uses the NEW password - the .env files were updated to match." Yellow
}

# ---- 4. restart services -----------------------------------------------------
if (-not $NoRestart) {
    foreach ($n in "NIBL-Portal-API", "NIBL-OIPM-API", "NIBL-NPD-API", "NIBL-AIDrawing-API") {
        $svc = Get-Service -Name $n -ErrorAction SilentlyContinue
        if ($svc) { Restart-Service -Name $n; Say ("   restarted {0}" -f $n) Green }
        else { Say ("   {0} is not installed yet - run scripts\install-services.ps1 -Start" -f $n) Yellow }
    }
}
Say ""
Say "Next: scripts\SMOKE-TEST.bat to check everything answers." Cyan
exit $code
