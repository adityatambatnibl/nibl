# =============================================================================
#  STEP 1 - Check the server. READ ONLY: nothing is stopped, started or changed.
#  Writes  scripts\switch\server-check.txt   (send it to the developer / Claude)
#  and, the first time, scripts\switch\deploy-config.ps1 with what it found.
# =============================================================================
param([switch]$RewriteConfig)
. "$PSScriptRoot\common.ps1"
$ErrorActionPreference = "Continue"
$Report = Join-Path $SwitchDir "server-check.txt"
Start-Transcript -LiteralPath $Report -Force | Out-Null
$warn = New-Object System.Collections.ArrayList
function Warn([string]$m) { [void]$warn.Add($m); Say "   WARN  $m" Yellow }

Say ("NIBL server check  {0}   computer {1}   folder {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $env:COMPUTERNAME, $Root) Cyan
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Warn "Not running as Administrator - some details are hidden." }

# ------------------------------------------------------------------ tools
Step "Tools"
foreach ($t in @(@("python", "--version"), @("node", "--version"), @("npm.cmd", "--version"), @("git", "--version"))) {
    $v = try { (& $t[0] $t[1] 2>&1 | Out-String).Trim() } catch { "" }
    if ($v) { Say ("   {0,-8} {1}" -f $t[0].Replace(".cmd", ""), $v) "Green" } else { Warn "$($t[0]) not found" }
}
$d = Get-PSDrive -Name (Split-Path -Qualifier $Root).TrimEnd(":") -ErrorAction SilentlyContinue
if ($d) { Say ("   free space on {0}: {1:N1} GB" -f $d.Name, ($d.Free / 1GB)) }

# ------------------------------------------------------------------ PostgreSQL
Step "PostgreSQL"
$pgs = Find-Pg
foreach ($p in $pgs) { Say ("   {0,-22} {1,-8} port {2}  v{3}  {4}" -f $p.Service, $p.Status, $p.Port, $p.Major, $p.Bin) }
if (-not $pgs) { Warn "No PostgreSQL service found." }
if (($pgs | Measure-Object).Count -gt 1) { Warn "More than one PostgreSQL - make sure PgPort in deploy-config.ps1 is the one the LIVE apps use." }
$pg = $null; if ($pgs) { $pg = Use-Pg @{} }
$pwPlain = ""
if ($pg) {
    $s = Read-Host "postgres password, to list the databases (Enter = skip)" -AsSecureString
    $pwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
if ($pwPlain) {
    $script:PgPw = $pwPlain
    try {
        $rows = Sql "postgres" "select datname || '  ' || pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate order by 1"
        $rows -split "`n" | ForEach-Object { Say "   db  $_" }
        foreach ($q in @(@("oipm", "public.users"), @("apqp", "apqp.user_apqp"), @("apqp", "apqp.projects"), @("nibl_portal", "public.users"), @("nibl_oipm", "public.users"), @("nibl_npd", "apqp.user_apqp"), @("nibl_drawing", "drawing.dc_drawings"))) {
            if (Db-Exists $q[0]) {
                $n = try { Sql $q[0] "select count(*) from $($q[1])" } catch { "table missing" }
                Say ("   {0,-14} {1,-22} {2}" -f $q[0], $q[1], $n)
            }
        }
        foreach ($db in $NiblDbs) { if (Db-Exists $db) { Warn "$db already exists here - the test step keeps it (renamed) and makes a fresh copy from the live data." } }
        foreach ($db in "oipm", "apqp") { if (-not (Db-Exists $db)) { Warn "Live database '$db' NOT found on this PostgreSQL - is this really the live server? Set OipmDb / NpdDb in deploy-config.ps1." } }
    } catch { Warn "Could not log in to PostgreSQL: $_" }
}

# ------------------------------------------------------------------ ports
Step "Who listens on the ports"
$svcByPid = @{}
foreach ($s in (Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -gt 0 })) { $svcByPid[[int]$s.ProcessId] = $s }
function Owner-Service([int]$procId) {
    for ($i = 0; $i -lt 4 -and $procId -gt 0; $i++) {
        if ($svcByPid.ContainsKey($procId)) { return $svcByPid[$procId] }
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        if (-not $p) { break }; $procId = [int]$p.ParentProcessId
    }
    return $null
}
$portOwner = @{}
foreach ($port in 80, 443, 8000, 8001, 8002, 8010, 8080, 9000, 9001, 9002, 9010) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { Say ("   {0,-5} free" -f $port); continue }
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    $svc = Owner-Service ([int]$c.OwningProcess)
    $portOwner[$port] = $svc
    Say ("   {0,-5} {1,-14} service: {2}" -f $port, $(if ($proc) { $proc.ProcessName } else { "?" }), $(if ($svc) { $svc.Name } else { "-" }))
}
foreach ($port in 8080, 9000, 9001, 9002, 9010) { if ($portOwner.ContainsKey($port) -and -not ($portOwner[$port] -and $portOwner[$port].Name -like "NIBL-*")) { Warn "Port $port is used by something else - the side-by-side test needs it." } }

# ------------------------------------------------------------------ NSSM services
Step "NSSM services"
$nssmExe = ""
$nssmSvcs = Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'nssm' }
foreach ($s in $nssmSvcs) {
    if (-not $nssmExe -and $s.PathName -match '^"?([^"]+nssm\.exe)') { $nssmExe = $Matches[1] }
}
if (-not $nssmExe) {
    $nssmExe = @("C:\tools\nssm\win64\nssm.exe", "C:\nssm\win64\nssm.exe", (Join-Path $Root "tools\nssm\win64\nssm.exe")) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if ($nssmExe) { Say "   nssm.exe: $nssmExe" "Green" } else { Warn "nssm.exe not found - set Nssm in deploy-config.ps1" }
$svcInfo = @{}
foreach ($s in $nssmSvcs) {
    $app = ""; $dir = ""
    if ($nssmExe) { $app = (& $nssmExe get $s.Name Application 2>$null | Out-String).Replace("`0", "").Trim(); $dir = (& $nssmExe get $s.Name AppDirectory 2>$null | Out-String).Replace("`0", "").Trim() }
    $svcInfo[$s.Name] = $dir
    Say ("   {0,-24} {1,-8} {2,-7} dir: {3}" -f $s.Name, $s.State, $s.StartMode, $dir)
    if ($app) { Say ("   {0,-24} app: {1}" -f "", $app) }
}

# ------------------------------------------------------------------ IIS
Step "IIS"
$iisSite = ""; $publicUrl = ""
if (-not (Test-Path $AppCmd)) { Warn "IIS (appcmd.exe) not found." }
else {
    & $AppCmd list site | ForEach-Object { Say "   $_" }
    & $AppCmd list app  | ForEach-Object { Say "   $_" }
    & $AppCmd list vdir | ForEach-Object { Say "   $_" }
    if (-not (Test-Path (Join-Path $env:windir "System32\inetsrv\rewrite.dll"))) { Warn "IIS URL Rewrite is NOT installed." } else { Say "   URL Rewrite installed" "Green" }
    $arr = Test-Path (Join-Path $env:ProgramFiles "IIS\Application Request Routing\requestRouter.dll")
    if (-not $arr) { Warn "IIS Application Request Routing (ARR) is NOT installed." } else { Say "   ARR installed" "Green" }
    $proxy = (& $AppCmd list config -section:system.webServer/proxy 2>$null | Out-String)
    if ($proxy -notmatch 'enabled="true"') { Warn "ARR proxy is not enabled (IIS Manager > server > ARR > Server Proxy Settings > Enable proxy)." } else { Say "   ARR proxy enabled" "Green" }
    $sites = & $AppCmd list site /text:name 2>$null
    foreach ($n in $sites) {
        $b = (& $AppCmd list site $n /text:bindings 2>$null | Out-String)
        if (-not $iisSite -and ($b -match ':443:' -or $b -match ':nibl')) { $iisSite = $n; $publicUrl = $(if ($b -match 'https/') { "https://nibl" } else { "http://nibl" }) }
    }
    if (-not $iisSite) { foreach ($n in $sites) { $b = (& $AppCmd list site $n /text:bindings 2>$null | Out-String); if ($b -match ':80:') { $iisSite = $n; $publicUrl = "http://nibl"; break } } }
    Say "   live site guessed: '$iisSite'  address: $publicUrl"
}

# ------------------------------------------------------------------ new code
Step "New code in $Root"
foreach ($a in $Apps) {
    $be = Join-Path $Root "$($a.Dir)\backend"
    $envF = Join-Path $be ".env"
    $line = "   {0,-34}" -f $a.Dir
    if (Test-Path $envF) {
        $db = Read-EnvValue $envF "DB_NAME"; if (-not $db) { $db = (Read-EnvValue $envF "SUPABASE_DB_URL") + (Read-EnvValue $envF "DATABASE_URL") -replace '^.*@', '@' }
        $line += (" .env yes  ENV={0}  db={1} {2}" -f (Read-EnvValue $envF "ENVIRONMENT"), (Read-EnvValue $envF "DB_PORT"), $db)
    } else { $line += " .env NOT YET (the test step writes it)" }
    $line += $(if (Test-Path (Join-Path $be "venv\Scripts\python.exe")) { "  venv yes" } else { "  venv no" })
    $line += $(if (Test-Path (Join-Path $Root "$($a.Dir)\frontend\dist\index.html")) { "  dist yes" } else { "  dist no" })
    Say $line
}

# ------------------------------------------------------------------ guess the old apps
Step "Old apps (to be replaced)"
$old = @(); $oldOipmDir = ""; $oldNpdDir = ""
foreach ($port in 8000, 8001) {
    $s = $portOwner[$port]
    if ($s -and $s.Name -notlike "NIBL-*") {
        $old += $s.Name
        $dir = $svcInfo[$s.Name]
        if ($port -eq 8000) { $oldOipmDir = $dir } else { $oldNpdDir = $dir }
    }
}
$old = @($old | Select-Object -Unique)
if (-not $old) { Warn "Could not find the old services on ports 8000 / 8001 - fill OldServices in deploy-config.ps1 by hand." }
if ($oldOipmDir -and $oldOipmDir -eq $oldNpdDir) { Warn "OIPM and NPD run in ONE old process ($oldOipmDir) - the combined workspace backend. That is fine; set OldOipmDir / OldNpdDir to its oipm / apqp sub-folders." }

$oldOipmData = ""
if ($oldOipmDir) {
    foreach ($c in @((Join-Path (Split-Path $oldOipmDir -Parent) "data"), (Join-Path $oldOipmDir "data"), (Join-Path $oldOipmDir "uploads"))) {
        if (Test-Path $c) { $oldOipmData = $c; break }
    }
}
$oldNpdData = ""
if ($oldNpdDir) {
    $sd = Read-EnvValue (Join-Path $oldNpdDir ".env") "STORAGE_DIR"
    if (-not $sd) { $sd = "uploads" }
    $cand = $(if ([IO.Path]::IsPathRooted($sd)) { $sd } else { Join-Path $oldNpdDir $sd })
    if (Test-Path $cand) { $oldNpdData = [IO.Path]::GetFullPath($cand) }
    else { $c2 = Join-Path (Split-Path $oldNpdDir -Parent) "data"; if (Test-Path $c2) { $oldNpdData = $c2 } }
}
Say "   old services : $($old -join ', ')"
Say "   old OIPM dir : $oldOipmDir    data: $oldOipmData"
Say "   old NPD dir  : $oldNpdDir    data: $oldNpdData"

# ------------------------------------------------------------------ config file
if ($RewriteConfig -or -not (Test-Path $ConfigFile)) {
    $svcList = $(if ($old) { ($old | ForEach-Object { '"' + $_ + '"' }) -join ", " } else { '"FILL-ME"' })
    $pgPort = $(if ($pg) { $pg.Port } else { 5432 })
    @"
# Settings for 2-TEST-NEW-VERSION / 3-GO-LIVE / 4-ROLLBACK.
# Written by 1-CHECK-SERVER on $(Get-Date -Format "yyyy-MM-dd HH:mm") from what it found. CHECK EVERY LINE.
# No passwords here - the scripts ask for the postgres password when they need it.
`$Cfg = @{
    PublicUrl      = "$publicUrl"        # what users open today (https://nibl if the site has a certificate)
    IisSite        = "$iisSite"          # the live IIS site
    OldServices    = @($svcList)         # old services on ports 8000 / 8001 - stopped at go-live, started by rollback
    OldOipmDir     = "$oldOipmDir"       # old OIPM backend folder (its .env + Gmail files are reused)
    OldNpdDir      = "$oldNpdDir"        # old NPD backend folder (its .env is reused)
    OldOipmDataDir = "$oldOipmData"      # old OIPM images (only read)
    OldNpdDataDir  = "$oldNpdData"       # old NPD attachments (only read)
    OipmDb         = "oipm"              # live OIPM database (only read)
    NpdDb          = "apqp"              # live NPD database (only read)
    PgPort         = $pgPort
    Nssm           = "$nssmExe"
    BackupDir      = "D:\NIBL-BACKUPS"
    TestPort       = 8080                # side-by-side test site: http://<server>:8080
}
"@ | Set-Content -LiteralPath $ConfigFile -Encoding UTF8
    Say ""; Say "Wrote scripts\switch\deploy-config.ps1 - open it and check every line." Cyan
} else { Say ""; Say "deploy-config.ps1 already exists - not changed (run with -RewriteConfig to rewrite)." }

Say ""
if ($warn.Count) { Say "$($warn.Count) warning(s):" Yellow; $warn | ForEach-Object { Say "   - $_" Yellow } } else { Say "No warnings." Green }
Say "Report saved: $Report"
Stop-Transcript | Out-Null
