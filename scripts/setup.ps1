# =============================================================================
#  NIBL Application Portal - one-time setup (Windows)
#
#  Run      : double-click scripts\SETUP.bat  (asks for Administrator)
#  Re-run   : safe. Nothing is overwritten, no data is deleted.
#  Log      : scripts\setup.log   (no passwords)
#
#  1. Finds PostgreSQL on this computer and checks the 'postgres' password.
#  2. Makes sure the OLD shared database (nibl_workspace) exists - creates it
#     from the backups in shared\database if it does not.
#  3. Creates the four new databases and COPIES the data into them:
#        nibl_portal  nibl_oipm  nibl_npd  nibl_drawing
#     (scripts\split_databases.py - the old database is not changed)
#  4. Writes the four backend .env files from your existing settings
#     (scripts\configure_env.py - existing values are never overwritten)
#  5. Creates each backend's Python environment and installs packages.
# =============================================================================

param(
    [string]$PgPassword = "root",            # local dev only - use a strong one on the server
    [string]$SourceDb   = "nibl_workspace",
    [string]$PublicUrl  = "http://nibl",
    [int]$PgPort        = 0,                # set it when the port cannot be read (no Administrator)
    # LIVE SERVER: OIPM and NPD are two databases. Give both names, e.g.
    #   setup.ps1 -OipmDb oipm -NpdDb apqp -OldOipmDir "D:\Internal Workspace\oipm" -OldNpdDir "D:\Internal Workspace\apqp"
    [string]$OipmDb     = "",
    [string]$NpdDb      = "",
    # Folders of the OLD running apps - their .env (mail, keys) and OIPM Gmail files are reused.
    [string]$OldOipmDir = "",
    [string]$OldNpdDir  = ""
)

$ErrorActionPreference = "Continue"
$Scripts = $PSScriptRoot
$Root    = Split-Path -Parent $Scripts
$Log     = Join-Path $Scripts "setup.log"
Set-Content -LiteralPath $Log -Value ("Setup started " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding utf8

function Say([string]$m, [string]$c = "Gray") { Write-Host $m -ForegroundColor $c; Add-Content -LiteralPath $Log -Value $m }
function Step([string]$m) { Say ""; Say ">> $m" "Cyan" }
function Fail([string]$m) { Say ""; Say "STOPPED: $m" "Red"; Say "Send scripts\setup.log to the developer." "Yellow"; exit 1 }

# ---------------------------------------------------------------------------
Step "1/5  PostgreSQL"
# ---------------------------------------------------------------------------
$found = @()
foreach ($s in (Get-CimInstance Win32_Service | Where-Object { $_.Name -like "postgresql*" })) {
    if ($s.PathName -notmatch '"([^"]+\\bin)\\pg_ctl\.exe"') { continue }; $bin = $Matches[1]
    if ($s.PathName -notmatch '-D\s+"([^"]+)"') { continue }; $data = $Matches[1]
    $port = 5432
    $m = Select-String -LiteralPath (Join-Path $data "postgresql.conf") -Pattern '^\s*port\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
    $major = 0
    if ((& (Join-Path $bin "psql.exe") --version 2>&1 | Out-String) -match '(\d+)\.\d+') { $major = [int]$Matches[1] }
    $found += [pscustomobject]@{ Service = $s.Name; Bin = $bin; Data = $data; Port = $port; Major = $major }
}
if (-not $found) { Fail "No PostgreSQL service found. Install PostgreSQL 18 and run this again." }
$pg = $found | Sort-Object Major -Descending | Select-Object -First 1
if ($PgPort -gt 0) { $pg.Port = $PgPort }
$Port = $pg.Port; $Psql = Join-Path $pg.Bin "psql.exe"; $Hba = Join-Path $pg.Data "pg_hba.conf"
Say ("   using {0} (PostgreSQL {1}) on port {2}" -f $pg.Service, $pg.Major, $Port) "Green"
if ((Get-Service $pg.Service).Status -ne "Running") { Start-Service $pg.Service; Start-Sleep 3 }

function Psql([string]$Db, [string[]]$Extra) {
    $env:PGPASSWORD = $PgPassword
    $out = & $Psql -U postgres -h 127.0.0.1 -p $Port -d $Db -X @Extra 2>&1 | ForEach-Object { "$_" }
    return ($out -join "`n")
}
function Val([string]$Db, [string]$Sql) { return (Psql $Db @("-tAc", $Sql)).Trim() }

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ((Val "postgres" "select 'OK'") -notmatch "OK") {
    if (-not $IsAdmin) { Fail ("Cannot log in to PostgreSQL on port $Port with that password. Check -PgPort / -PgPassword, or run PowerShell as Administrator to reset it.") }
    Say "   password is different - resetting it (pg_hba.conf is restored afterwards)"
    $bak = "$Hba.nibl-" + (Get-Date -Format "yyyyMMddHHmmss")
    Copy-Item -LiteralPath $Hba $bak -Force
    try {
        (Get-Content -LiteralPath $Hba) -replace '\b(scram-sha-256|md5|password)\s*$', 'trust' | Set-Content -LiteralPath $Hba -Encoding ascii
        Restart-Service $pg.Service -Force; Start-Sleep 3
        Psql "postgres" @("-c", ("ALTER USER postgres PASSWORD '" + $PgPassword.Replace("'", "''") + "';")) | Out-Null
    } finally {
        Copy-Item -LiteralPath $bak $Hba -Force; Restart-Service $pg.Service -Force; Start-Sleep 3
    }
    if ((Val "postgres" "select 'OK'") -notmatch "OK") { Fail "Could not set the postgres password. Run SETUP.bat as Administrator." }
}
Say "   postgres login OK" "Green"

# Already split? Then the old shared database is not needed at all (it may
# have been dropped on purpose) - do not recreate it and do not copy again.
$AlreadySplit = $true
foreach ($t in @(@("nibl_portal","public.users"), @("nibl_oipm","public.users"), @("nibl_npd","apqp.user_apqp"), @("nibl_drawing","drawing.users"))) {
    if ((Val "postgres" "select 1 from pg_database where datname='$($t[0])'") -ne "1") { $AlreadySplit = $false; break }
    if ((Val $t[0] "select to_regclass('$($t[1])') is not null") -ne "t") { $AlreadySplit = $false; break }
}

# ---------------------------------------------------------------------------
Step "2/5  Old shared database '$SourceDb' (source of the copy, never changed)"
# ---------------------------------------------------------------------------
if ($AlreadySplit) {
    Say "   the four NIBL databases already exist - nothing to copy, '$SourceDb' not needed" "Green"
} elseif ($OipmDb -or $NpdDb) {
    foreach ($d in @($OipmDb, $NpdDb) | Where-Object { $_ }) {
        if ((Val "postgres" "select 1 from pg_database where datname='$d'") -ne "1") { Fail "Database '$d' not found." }
    }
    Say ("   copying from the live databases: OIPM '{0}', NPD '{1}' (both read only)" -f $OipmDb, $NpdDb) "Green"
} elseif ((Val "postgres" "select 1 from pg_database where datname='$SourceDb'") -eq "1") {
    Say "   exists - using it"
} else {
    Say "   not found - creating it from shared\database backups"
    Psql "postgres" @("-c", "CREATE DATABASE $SourceDb;") | Out-Null
    $db = Join-Path $Root "shared\database"
    $npdSql = Join-Path $Root "applications\NPD\backend\database\supabase"
    foreach ($f in @((Join-Path $db "00_prepare.sql"), (Join-Path $db "oipm_only_backup.sql"), (Join-Path $npdSql "001_schema.sql"),
                     (Join-Path $db "01_npd_columns.sql"), (Join-Path $db "apqp_data_migration.sql"), (Join-Path $npdSql "002_product_name.sql"))) {
        if (-not (Test-Path -LiteralPath $f)) { Fail "Missing $f" }
        $out = Psql $SourceDb @("-q", "-f", $f)
        Add-Content -LiteralPath $Log -Value "----- $f`n$out"
        Say ("   loaded " + (Split-Path -Leaf $f))
    }
}

# ---------------------------------------------------------------------------
Step "3/5  Python for the setup scripts"
# ---------------------------------------------------------------------------
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { Fail "Python 3.12+ is not installed (python.org) - tick 'Add to PATH'." }
$toolVenv = Join-Path $Root "applications\NPD\backend\venv"
if (-not (Test-Path (Join-Path $toolVenv "Scripts\python.exe"))) {
    Say "   creating applications\NPD\backend\venv"
    & python -m venv $toolVenv
}
$VPy = Join-Path $toolVenv "Scripts\python.exe"
& $VPy -m pip install -q -r (Join-Path $Root "applications\NPD\backend\requirements.txt") 2>&1 | Out-Null
Say "   ready" "Green"

# ---------------------------------------------------------------------------
Step "4/5  Four databases + four .env files"
# ---------------------------------------------------------------------------
if (-not $AlreadySplit) {
    $split = & $VPy (Join-Path $Scripts "split_databases.py") --pg-bin $pg.Bin --port $Port --password $PgPassword --source $SourceDb `
        --oipm-source $(if ($OipmDb) { $OipmDb } else { $SourceDb }) --npd-source $(if ($NpdDb) { $NpdDb } else { $SourceDb }) 2>&1 | ForEach-Object { "$_" }
    $split | ForEach-Object { Say $_ }
    if ($LASTEXITCODE -ne 0) { Fail "Splitting the database failed (see above)." }
}

# Existing settings: newest first (combined workspace), then the old separate apps.
function Find-OldEnv([string]$dir) {
    if (-not $dir) { return $null }
    foreach ($c in @("$dir\.env", "$dir\backend\.env", "$dir\backend\oipm\.env", "$dir\backend\apqp\.env")) { if (Test-Path -LiteralPath $c) { return $c } }
    return $null
}
$oipmEnv = Find-OldEnv $OldOipmDir
$npdEnvOld = Find-OldEnv $OldNpdDir
if (-not $oipmEnv) { $oipmEnv = @("applications\OIPM\backend\.env", "backend\oipm\.env", "oipm\backend\.env") | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $oipmEnv) { $oipmEnv = Get-ChildItem -LiteralPath (Join-Path $Root "backend") -Filter ".env*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ".env.old-*" -or $_.Name -eq ".env" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }
$npdEnv = $npdEnvOld
if (-not $npdEnv) { $npdEnv = @("applications\NPD\backend\.env", "backend\apqp\.env", "apqp\backend\.env") | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
Say ("   OIPM settings from: " + $oipmEnv)
Say ("   NPD settings from : " + $npdEnv)
$cfg = & $VPy (Join-Path $Scripts "configure_env.py") --old-oipm-env "$oipmEnv" --old-npd-env "$npdEnv" --pg-port $Port --pg-password $PgPassword --public-url $PublicUrl 2>&1 | ForEach-Object { "$_" }
$cfg | ForEach-Object { Say $_ }

# ---------------------------------------------------------------------------
Step "5/5  Python environments for the four backends"
# ---------------------------------------------------------------------------
foreach ($b in @("portal\backend", "applications\OIPM\backend", "applications\NPD\backend", "applications\AI-Drawing-Control\backend")) {
    $dir = Join-Path $Root $b
    $vpy = Join-Path $dir "venv\Scripts\python.exe"
    if (-not (Test-Path $vpy)) { & python -m venv (Join-Path $dir "venv") }
    & $vpy -m pip install -q -r (Join-Path $dir "requirements.txt") 2>&1 | Out-Null
    Say ("   " + $b + " ready") "Green"
}
# OIPM still needs its Gmail OAuth files next to its code (they are not in git).
foreach ($f in @("credentials.json", "token.json")) {
    $dst = Join-Path $Root "applications\OIPM\backend\$f"
    if (-not (Test-Path $dst)) {
        $cands = @("backend\oipm\$f", "oipm\backend\$f") | ForEach-Object { Join-Path $Root $_ }
        if ($OldOipmDir) { $cands = @("$OldOipmDir\$f", "$OldOipmDir\backend\$f") + $cands }
        $src = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($src) { Copy-Item -LiteralPath $src $dst; Say "   copied $f to applications\OIPM\backend" }
    }
}

Say ""
Say "==================================================================" "Green"
Say "  DONE. Start everything with scripts\START-DEV.bat"              "Green"
Say "  then open http://localhost:5173"                                  "Green"
Say "==================================================================" "Green"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
