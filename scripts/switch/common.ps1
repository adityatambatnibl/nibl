# =============================================================================
#  Shared helpers for the side-by-side test and the one-command switch.
#  Dot-sourced by check-server.ps1, test-new.ps1, go-live.ps1, rollback.ps1.
#  Nothing runs on its own here.
# =============================================================================
# "Continue": Windows PowerShell 5.1 turns any stderr text of nssm / psql / appcmd into a
# fatal error under "Stop". Native tools are checked by exit code; key cmdlets use -ErrorAction Stop.
$ErrorActionPreference = "Continue"
$SwitchDir  = $PSScriptRoot
$Root       = Split-Path -Parent (Split-Path -Parent $SwitchDir)     # ...\NIBL-APPLICATION-PORTAL
$ConfigFile = Join-Path $SwitchDir "deploy-config.ps1"
$StateFile  = Join-Path $SwitchDir "deploy-state.json"
$LogDir     = Join-Path $SwitchDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$AppCmd     = Join-Path $env:windir "System32\inetsrv\appcmd.exe"

# The four new backends. LivePort = port after go-live, TestPort = port while testing side by side.
$Apps = @(
    @{ Service = "NIBL-Portal-API";    Dir = "portal";                          LivePort = 8010; TestPort = 9010; Health = "/portal-api/health"; IisPath = "" },
    @{ Service = "NIBL-OIPM-API";      Dir = "applications\OIPM";               LivePort = 8000; TestPort = 9000; Health = "/health";            IisPath = "/oipm" },
    @{ Service = "NIBL-NPD-API";       Dir = "applications\NPD";                LivePort = 8001; TestPort = 9001; Health = "/api/health";        IisPath = "/npd" },
    @{ Service = "NIBL-AIDrawing-API"; Dir = "applications\AI-Drawing-Control"; LivePort = 8002; TestPort = 9002; Health = "/api/health";        IisPath = "/ai-drawing-control" }
)
$NiblDbs  = @("nibl_portal", "nibl_oipm", "nibl_npd", "nibl_drawing")
$TestSite = "nibl-test"

function Say([string]$m, [string]$c = "Gray") { Write-Host $m -ForegroundColor $c }
function Step([string]$m) { Write-Host ""; Write-Host ">> $m" -ForegroundColor Cyan }
function Stop-With([string]$m) { throw $m }

function Assert-Admin {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Stop-With "Run this as Administrator." }
}

function Load-Config {
    if (-not (Test-Path -LiteralPath $ConfigFile)) { Stop-With "scripts\switch\deploy-config.ps1 not found - run scripts\1-CHECK-SERVER.bat first." }
    . $ConfigFile
    if (-not $Cfg) { Stop-With "deploy-config.ps1 does not define `$Cfg." }
    foreach ($k in "PublicUrl", "IisSite", "OldServices", "Nssm", "OipmDb", "NpdDb", "BackupDir", "TestPort") {
        if (-not $Cfg.ContainsKey($k) -or -not $Cfg[$k]) { Stop-With "deploy-config.ps1: '$k' is empty - fill it in (see server-check.txt)." }
    }
    if ($Cfg.OldServices -contains "FILL-ME") { Stop-With "deploy-config.ps1: OldServices still says FILL-ME." }
    if (-not (Test-Path -LiteralPath $Cfg.Nssm)) { Stop-With "nssm.exe not found at $($Cfg.Nssm)" }
    # CheckUrl = address the scripts use to test the site FROM THIS SERVER. When the IIS site is bound to
    # one IP (e.g. 192.168.105.20), "http://nibl" from the server itself may land on another address -> 404.
    if (-not $Cfg.CheckUrl) {
        $Cfg.CheckUrl = $Cfg.PublicUrl
        $b = (& $AppCmd list site $Cfg.IisSite /text:bindings 2>$null | Out-String)
        if ($b -match '(https?)/(\d{1,3}(?:\.\d{1,3}){3}):(\d+):') {
            $port = $(if ($Matches[3] -in "80", "443") { "" } else { ":" + $Matches[3] })
            $Cfg.CheckUrl = "{0}://{1}{2}" -f $Matches[1], $Matches[2], $port
        }
    }
    return $Cfg
}

function Save-State([hashtable]$s) { ($s | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $StateFile -Encoding UTF8 -ErrorAction Stop }
function Load-State {
    if (-not (Test-Path -LiteralPath $StateFile)) { return @{} }
    $o = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    $h = @{}; foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; return $h
}

# ---------------------------------------------------------------- PostgreSQL
function Find-Pg {
    $found = @()
    foreach ($s in (Get-CimInstance Win32_Service | Where-Object { $_.Name -like "postgresql*" })) {
        if ($s.PathName -notmatch '"([^"]+\\bin)\\pg_ctl\.exe"') { continue }; $bin = $Matches[1]
        if ($s.PathName -notmatch '-D\s+"([^"]+)"') { continue }; $data = $Matches[1]
        $port = 5432
        $m = Select-String -LiteralPath (Join-Path $data "postgresql.conf") -Pattern '^\s*port\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
        $major = 0
        if ((& (Join-Path $bin "psql.exe") --version 2>&1 | Out-String) -match '(\d+)\.\d+') { $major = [int]$Matches[1] }
        $found += [pscustomobject]@{ Service = $s.Name; Status = $s.State; Bin = $bin; Data = $data; Port = $port; Major = $major }
    }
    return $found
}

function Use-Pg([hashtable]$cfg) {
    $all = Find-Pg
    if (-not $all) { Stop-With "No PostgreSQL service found." }
    $pg = $all | Sort-Object Major -Descending | Select-Object -First 1
    if ($cfg -and $cfg.PgPort) { $pg.Port = [int]$cfg.PgPort }
    $script:Pg = $pg
    return $pg
}

function Read-PgPassword {
    $s = Read-Host "postgres password (current one)" -AsSecureString
    $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    $script:PgPw = $pw
    if ((Sql "postgres" "select 'OK'") -notmatch "OK") { Stop-With "Cannot log in to PostgreSQL on port $($script:Pg.Port) with that password." }
    return $pw
}

function Sql([string]$db, [string]$q) {
    $env:PGPASSWORD = $script:PgPw
    $out = & (Join-Path $script:Pg.Bin "psql.exe") -U postgres -h 127.0.0.1 -p $script:Pg.Port -d $db -X -v ON_ERROR_STOP=1 -tAc $q 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if ($code -ne 0) { throw ("psql failed on {0}: {1}" -f $db, ($out -join " ")) }
    return ($out -join "`n").Trim()
}

function Db-Exists([string]$db) { return (Sql "postgres" "select 1 from pg_database where datname='$db'") -eq "1" }

# Keep, never drop: existing nibl_* databases are renamed to nibl_*_<suffix>.
function Rename-NiblDbs([string]$suffix) {
    $renamed = @()
    foreach ($db in $NiblDbs) {
        if (-not (Db-Exists $db)) { continue }
        $new = "{0}_{1}" -f $db, $suffix
        Sql "postgres" "select pg_terminate_backend(pid) from pg_stat_activity where datname='$db' and pid<>pg_backend_pid()" | Out-Null
        Sql "postgres" "alter database ""$db"" rename to ""$new""" | Out-Null
        Say "   $db  ->  kept as $new"
        $renamed += $new
    }
    return $renamed
}

function Dump-Db([string]$db, [string]$dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $file = Join-Path $dir "$db.dump"
    $env:PGPASSWORD = $script:PgPw
    & (Join-Path $script:Pg.Bin "pg_dump.exe") -U postgres -h 127.0.0.1 -p $script:Pg.Port -Fc -f $file $db 2>&1 | Out-Null
    $code = $LASTEXITCODE
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if ($code -ne 0 -or -not (Test-Path $file) -or (Get-Item $file).Length -lt 1024) { Stop-With "Backup of database '$db' failed." }
    Say ("   {0,-14} {1:N0} KB  ->  {2}" -f $db, ((Get-Item $file).Length / 1KB), $file) "Green"
}

# Copies live data into the four nibl_* databases and installs Python packages (scripts\setup.ps1).
function Run-Setup([hashtable]$cfg) {
    $pa = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $Root "scripts\setup.ps1"),
              "-PgPassword", $script:PgPw, "-PgPort", $script:Pg.Port, "-PublicUrl", $cfg.PublicUrl,
              "-OipmDb", $cfg.OipmDb, "-NpdDb", $cfg.NpdDb)
    if ($cfg.OldOipmDir) { $pa += @("-OldOipmDir", $cfg.OldOipmDir) }
    if ($cfg.OldNpdDir)  { $pa += @("-OldNpdDir",  $cfg.OldNpdDir) }
    & powershell.exe @pa
    if ($LASTEXITCODE -ne 0) { Stop-With "setup.ps1 failed - see scripts\setup.log" }
    foreach ($db in $NiblDbs) { if (-not (Db-Exists $db)) { Stop-With "Database $db was not created." } }
    Say ("   users copied: portal {0}, OIPM {1}, NPD {2}" -f (Sql "nibl_portal" "select count(*) from public.users"),
         (Sql "nibl_oipm" "select count(*) from public.users"), (Sql "nibl_npd" "select count(*) from apqp.user_apqp")) "Green"
}

# ---------------------------------------------------------------- files
function Read-EnvValue([string]$file, [string]$key) {
    if (-not (Test-Path -LiteralPath $file)) { return "" }
    foreach ($line in Get-Content -LiteralPath $file) {
        if ($line -match "^\s*$key\s*=\s*(.*)$") { return $Matches[1].Trim().Trim('"').Trim("'") }
    }
    return ""
}
function Set-EnvValue([string]$file, [string]$key, [string]$value) {
    $lines = @(); if (Test-Path -LiteralPath $file) { $lines = @(Get-Content -LiteralPath $file) }
    $found = $false
    $lines = $lines | ForEach-Object { if ($_ -match "^\s*$key\s*=") { $found = $true; "$key=$value" } else { $_ } }
    if (-not $found) { $lines += "$key=$value" }
    Set-Content -LiteralPath $file -Value $lines -Encoding utf8 -ErrorAction Stop
}

function Copy-Newer([string]$src, [string]$dst, [string[]]$excludeDirs = @()) {
    if (-not $src) { Say "   (no old folder set in deploy-config.ps1 - skipped)" Yellow; return }
    if (-not (Test-Path -LiteralPath $src)) { Say "   old folder not found: $src - skipped" Yellow; return }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $rc = @($src, $dst, "/E", "/XO", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NP")
    if ($excludeDirs.Count) { $rc += "/XD"; $rc += $excludeDirs }
    & robocopy @rc | Out-Null
    if ($LASTEXITCODE -ge 8) { Stop-With "robocopy failed ($LASTEXITCODE) copying $src" }
    $n = (Get-ChildItem -LiteralPath $dst -Recurse -File -ErrorAction SilentlyContinue).Count
    Say ("   {0}  ->  {1}  ({2} files)" -f $src, $dst, $n) "Green"
}

# Old upload folders are only READ. New uploads land in applications\<app>\data.
function Copy-Uploads([hashtable]$cfg) {
    Say "   OIPM images"
    Copy-Newer $cfg.OldOipmDataDir (Join-Path $Root "applications\OIPM\data")
    Say "   NPD attachments"
    Copy-Newer $cfg.OldNpdDataDir (Join-Path $Root "applications\NPD\data") @("drawings")
    foreach ($b in "applications\NPD\backend", "applications\AI-Drawing-Control\backend") {
        $f = Join-Path $Root "$b\.env"
        if (-not (Test-Path $f)) { continue }
        if (-not (Test-Path "$f.before-move-data")) { Copy-Item -LiteralPath $f "$f.before-move-data" -ErrorAction Stop }
        Set-EnvValue $f "STORAGE_BACKEND" "local"
        Set-EnvValue $f "STORAGE_DIR" "../data"
    }
}

function Build-Frontends {
    foreach ($a in $Apps) {
        $fe = Join-Path $Root "$($a.Dir)\frontend"
        Say "   building $($a.Dir)\frontend"
        Push-Location $fe
        try {
            if (-not (Test-Path "node_modules")) { & npm.cmd ci --no-audit --no-fund 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { Stop-With "npm ci failed in $fe" } }
            $out = & npm.cmd run build 2>&1 | ForEach-Object { "$_" }
            if ($LASTEXITCODE -ne 0) { $out | Select-Object -Last 25 | ForEach-Object { Say $_ Red }; Stop-With "Build failed in $fe" }
        } finally { Pop-Location }
        if (-not (Test-Path (Join-Path $fe "dist\index.html"))) { Stop-With "No dist\index.html in $fe" }
        if (-not (Test-Path (Join-Path $fe "dist\web.config"))) { Stop-With "No dist\web.config in $fe" }
    }
}

# ---------------------------------------------------------------- services
function Set-TestMode([hashtable]$cfg) {
    $base = "http://{0}:{1}" -f $env:COMPUTERNAME.ToLower(), $cfg.TestPort
    $projects = Join-Path $SwitchDir "projects.test.json"
    foreach ($a in $Apps) {
        $vars = @(
            "APP_PORT=$($a.TestPort)",
            "SMTP_HOST=127.0.0.1", "SMTP_PORT=9",                 # no mail can leave the test copy
            "EMAIL_ENABLED=false", "SCHEDULER_ENABLED=false",     # no reminders / summaries
            "COOKIE_SECURE=false",                                # test site is plain http
            "FRONTEND_URL=$base", "PORTAL_URL=$base",
            "PORTAL_INTERNAL_URL=http://127.0.0.1:9010/portal-api",
            "PROJECTS_FILE=$projects"                             # portal talks to the TEST backends only
        )
        & $cfg.Nssm set $a.Service AppEnvironmentExtra @vars 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-With "nssm could not set test settings on $($a.Service)" }
    }
    # projects.json with the test ports
    $j = Get-Content -LiteralPath (Join-Path $Root "shared\configuration\projects.json") -Raw
    foreach ($a in $Apps) { $j = $j.Replace("127.0.0.1:$($a.LivePort)/", "127.0.0.1:$($a.TestPort)/") }
    # No BOM: Python json.loads() rejects a UTF-8 BOM ("Something went wrong" on the portal cards).
    [IO.File]::WriteAllText($projects, $j, (New-Object Text.UTF8Encoding $false))
}

function Clear-TestMode([hashtable]$cfg) {
    foreach ($a in $Apps) { & $cfg.Nssm reset $a.Service AppEnvironmentExtra 2>&1 | Out-Null }
}

function Install-NewServices([hashtable]$cfg) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\install-services.ps1") -Nssm $cfg.Nssm
    if ($LASTEXITCODE -ne 0) { Stop-With "install-services.ps1 failed" }
}

# Stop, WAIT until really stopped, then start. ("nssm restart" on a service that is still
# stopping can leave it stopped - that is what happened to NIBL-Portal-API on 11 Oct.)
function Restart-NewServices([hashtable]$cfg) {
    foreach ($a in $Apps) { & $cfg.Nssm stop $a.Service 2>&1 | Out-Null }
    foreach ($a in $Apps) {
        for ($i = 0; $i -lt 30; $i++) { if ((Get-Service $a.Service -ErrorAction SilentlyContinue).Status -eq "Stopped") { break }; Start-Sleep 1 }
    }
    foreach ($a in $Apps) { & $cfg.Nssm start $a.Service 2>&1 | Out-Null }
    Start-Sleep 5
}

# Waits for the service's port; if it is not up halfway, starts the service once more.
function Wait-Service([hashtable]$cfg, [hashtable]$a, [int]$port, [int]$seconds = 90) {
    if (Wait-Port $port ([int]($seconds / 2))) { return $true }
    Say "   $($a.Service) not up yet (status: $((Get-Service $a.Service -ErrorAction SilentlyContinue).Status)) - starting it again" Yellow
    & $cfg.Nssm start $a.Service 2>&1 | Out-Null
    return (Wait-Port $port ([int]($seconds / 2)))
}
function Stop-NewServices([hashtable]$cfg) {
    foreach ($a in $Apps) { if (Get-Service $a.Service -ErrorAction SilentlyContinue) { & $cfg.Nssm stop $a.Service 2>&1 | Out-Null } }
}

function Stop-OldServices([hashtable]$cfg) {
    foreach ($n in $cfg.OldServices) {
        $s = Get-Service -Name $n -ErrorAction SilentlyContinue
        if (-not $s) { Stop-With "Old service '$n' not found (check deploy-config.ps1)." }
        Stop-Service -Name $n -Force -ErrorAction Stop
        Set-Service -Name $n -StartupType Manual
        Say "   stopped $n (startup set to Manual)" "Green"
    }
}
function Start-OldServices([hashtable]$cfg) {
    foreach ($n in $cfg.OldServices) {
        Set-Service -Name $n -StartupType Automatic
        Start-Service -Name $n -ErrorAction Continue
        Say ("   {0}: {1}" -f $n, (Get-Service $n).Status) "Green"
    }
}

# Prints the end of a backend's error log, so the reason is on screen (and in the switch log).
function Show-LogTail([hashtable]$a) {
    $f = Join-Path $Root "$($a.Dir)\backend\logs\stderr.log"
    Say ("   service {0}: {1}" -f $a.Service, (Get-Service $a.Service -ErrorAction SilentlyContinue).Status) Yellow
    if (Test-Path $f) { Say "   ---- last lines of $($a.Dir)\backend\logs\stderr.log ----" Yellow; Get-Content -LiteralPath $f -Tail 25 | ForEach-Object { Say "   $_" } }
    else { Say "   (no $f yet)" Yellow }
}

function Wait-Port([int]$port, [int]$seconds = 60) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep 1
    }
    return $false
}

# ---------------------------------------------------------------- checks
$script:Bad = 0
function Check([string]$name, [string]$url, [int[]]$want = @(200)) {
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop; $code = [int]$r.StatusCode }
    catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
    $ok = $want -contains $code
    if (-not $ok) { $script:Bad++ }
    Say ("{0,-4} {1,-34} {2}  ({3})" -f ($(if ($ok) { "OK" } else { "FAIL" })), $name, $code, $url) $(if ($ok) { "Green" } else { "Red" })
}

# ---------------------------------------------------------------- IIS
function AppCmd([string[]]$a) {
    $out = & $AppCmd @a 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw ("appcmd {0} failed: {1}" -f ($a -join " "), ($out -join " ")) }
    return $out
}
# appcmd prints "ERROR ( message:Cannot find APP ... )" on STDOUT for a missing app, so the old
# "any output = exists" test said yes for /oipm and the go-live of 11 Oct stopped. Compare names instead.
function Iis-SiteExists([string]$site) {
    $names = @(& $AppCmd list site /text:name 2>$null | ForEach-Object { "$_".Trim() })
    return ($names -contains $site)
}
function Iis-AppExists([string]$site, [string]$path) {
    if (-not (Iis-SiteExists $site)) { return $false }
    $paths = @(& $AppCmd list app /site.name:$site /text:path 2>$null | ForEach-Object { "$_".Trim() })
    return ($paths -contains $path)
}
function Iis-Point([string]$site, [string]$path, [string]$phys) {
    if (-not $path) { AppCmd @("set", "vdir", "$site/", "/physicalPath:$phys") | Out-Null; return }
    if (Iis-AppExists $site $path) { AppCmd @("set", "vdir", "$site$path/", "/physicalPath:$phys") | Out-Null }
    else { AppCmd @("add", "app", "/site.name:$site", "/path:$path", "/physicalPath:$phys") | Out-Null }
    $now = (& $AppCmd list vdir "$site$path/" /text:physicalPath 2>$null | Out-String).Trim()
    if ($now -ne $phys) { Stop-With "IIS $site$path/ points to '$now', expected '$phys'" }
}
function Dist([hashtable]$a) { return (Join-Path $Root "$($a.Dir)\frontend\dist") }
