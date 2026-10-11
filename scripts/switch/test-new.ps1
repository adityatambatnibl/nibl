# =============================================================================
#  STEP 2 - Install the NEW version NEXT TO the old one and test it.
#  The live site and the old services are NOT stopped or changed:
#    * live databases oipm / apqp are only READ (copied into nibl_*)
#    * old upload folders are only READ (copied into applications\<app>\data)
#    * new backends run on test ports 9000-9010, test site on http://<server>:8080
#    * the test copy sends NO e-mail and runs NO reminders
#  Safe to run again: it takes a fresh copy of the live data each time.
# =============================================================================
. "$PSScriptRoot\common.ps1"
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
Start-Transcript -LiteralPath (Join-Path $LogDir "test-new-$stamp.log") | Out-Null
try {
    Assert-Admin
    $cfg = Load-Config
    if ((Load-State).Phase -eq "live") { Stop-With "The new version is already LIVE - running the test now would replace live data. Use the normal update steps instead." }
    $pg = Use-Pg $cfg
    Say ("PostgreSQL {0} on port {1}" -f $pg.Service, $pg.Port)
    Read-PgPassword | Out-Null

    # Settings copied from a developer PC point at the wrong PostgreSQL (e.g. port 5433).
    # Put them aside; setup writes fresh ones from the live apps' settings.
    foreach ($a in $Apps) {
        $f = Join-Path $Root "$($a.Dir)\backend\.env"
        if (-not (Test-Path $f)) { continue }
        $ports = @()
        $p1 = Read-EnvValue $f "DB_PORT"; if ($p1) { $ports += $p1 }
        foreach ($k in "SUPABASE_DB_URL", "DATABASE_URL") { $u = Read-EnvValue $f $k; if ($u -match ':(\d+)/') { $ports += $Matches[1] } }
        if ($ports | Where-Object { $_ -ne "$($pg.Port)" }) {
            Move-Item -LiteralPath $f "$f.from-other-pc-$stamp" -ErrorAction Stop
            Say "   $($a.Dir)\backend\.env was for another PC (port $($ports -join ',')) - kept as .env.from-other-pc-$stamp" Yellow
        }
    }
    foreach ($db in $cfg.OipmDb, $cfg.NpdDb) { if (-not (Db-Exists $db)) { Stop-With "Live database '$db' not found on port $($pg.Port)." } }

    Step "1/7  Fresh copy of the LIVE data into nibl_* (live databases only read)"
    Rename-NiblDbs "before_test_$stamp" | Out-Null
    Run-Setup $cfg

    Step "2/7  Copy uploaded files (old folders only read)"
    Copy-Uploads $cfg

    Step "3/7  Production settings (.env) - database password NOT changed"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\prepare-production.ps1") -PublicUrl $cfg.PublicUrl -KeepPassword -NoRestart
    # exit 2 = settings written, only FIX notes (e.g. weak DB password - changed after go-live). Only 1 is a real failure.
    if ($LASTEXITCODE -eq 1) { Stop-With "prepare-production.ps1 failed" }

    Step "4/7  Build the four screens"
    Build-Frontends

    Step "5/7  New services on TEST ports (9010 / 9000 / 9001 / 9002), mail and reminders OFF"
    Install-NewServices $cfg
    Set-TestMode $cfg
    Restart-NewServices $cfg
    foreach ($a in $Apps) {
        if (-not (Wait-Port $a.TestPort 60)) { Stop-With "$($a.Service) did not start on port $($a.TestPort) - see $($a.Dir)\backend\logs\stderr.log" }
        Say "   $($a.Service) running on $($a.TestPort)" "Green"
    }

    Step "6/7  Test site http://$($env:COMPUTERNAME.ToLower()):$($cfg.TestPort)  (live site untouched)"
    $testRoot = Join-Path (Split-Path -Parent $Root) "NIBL-TEST-SITE"
    foreach ($a in $Apps) {
        $name = $(if ($a.IisPath) { $a.IisPath.Trim("/") } else { "portal" })
        $dst = Join-Path $testRoot $name
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
        & robocopy (Dist $a) $dst /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { Stop-With "Copy to $dst failed" }
        $wc = Join-Path $dst "web.config"
        $x = Get-Content -LiteralPath $wc -Raw
        foreach ($b in $Apps) { $x = $x.Replace("127.0.0.1:$($b.LivePort)/", "127.0.0.1:$($b.TestPort)/") }
        $x = [regex]::Replace($x, '(?s)<rule name="Force HTTPS".*?</rule>', '')     # test site is plain http
        Set-Content -LiteralPath $wc -Value $x -Encoding UTF8 -ErrorAction Stop
    }
    if (Iis-AppExists $TestSite "/") { AppCmd @("delete", "site", $TestSite) | Out-Null }
    AppCmd @("add", "site", "/name:$TestSite", "/bindings:http/*:$($cfg.TestPort):", "/physicalPath:$(Join-Path $testRoot 'portal')") | Out-Null
    foreach ($a in $Apps | Where-Object { $_.IisPath }) {
        AppCmd @("add", "app", "/site.name:$TestSite", "/path:$($a.IisPath)", "/physicalPath:$(Join-Path $testRoot $a.IisPath.Trim('/'))") | Out-Null
    }
    AppCmd @("start", "site", $TestSite) | Out-Null
    if (-not (Get-NetFirewallRule -DisplayName "NIBL test site" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "NIBL test site" -Direction Inbound -Protocol TCP -LocalPort $cfg.TestPort -Action Allow | Out-Null
    }
    Say "   site '$TestSite' on port $($cfg.TestPort) -> $testRoot" "Green"

    Step "7/7  Checks"
    $script:Bad = 0
    foreach ($a in $Apps) { Check "$($a.Service) :$($a.TestPort)" "http://127.0.0.1:$($a.TestPort)$($a.Health)" }
    $t = "http://localhost:$($cfg.TestPort)"
    Check "Test portal screen"     "$t/"
    Check "Test OIPM screen"       "$t/oipm/"
    Check "Test NPD screen"        "$t/npd/"
    Check "Test AI Drawing screen" "$t/ai-drawing-control/"
    Check "Test portal API"        "$t/portal-api/health"
    Check "Test NPD API"           "$t/npd/api/health"
    Check "Test AI Drawing API"    "$t/ai-drawing-control/api/health"
    Check "LIVE site still up"     "$($cfg.CheckUrl)/" @(200, 301, 302)
    if ($script:Bad) { Stop-With "$script:Bad check(s) failed - fix them before going live (logs: <app>\backend\logs\stderr.log)." }

    Save-State @{ TestDone = $stamp; Phase = "tested" }
    Say ""
    Say "=====================================================================" Green
    Say "  NEW VERSION RUNNING NEXT TO THE OLD ONE.  Live site not touched." Green
    Say "  Test it from any PC:  http://$($env:COMPUTERNAME.ToLower()):$($cfg.TestPort)" Green
    Say "    - sign in with a real account and its current password" Green
    Say "    - open OIPM, NPD and AI Drawing; look at real projects" Green
    Say "    - anything you create here is THROWN AWAY at go-live" Green
    Say "    - no e-mails are sent from the test copy" Green
    Say "  When everything is right:  scripts\3-GO-LIVE.bat" Green
    Say "=====================================================================" Green
} catch {
    Say ""; Say "STOPPED: $_" Red
    Say "The live site was not changed. Log: scripts\switch\logs\test-new-$stamp.log" Yellow
    Stop-Transcript | Out-Null; exit 1
}
Stop-Transcript | Out-Null
