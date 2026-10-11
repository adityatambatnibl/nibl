# =============================================================================
#  UPDATE THE LIVE VERSION - after go-live, for every new change pushed to GitHub.
#  1. Backup of the four databases + uploaded files (scripts\backup.ps1)
#  2. git pull (the version before is remembered)
#  3. Python packages, build the four screens
#  4. Restart the four services, check everything answers
#  If the check fails it offers to go back to the version before.
#  Data is never copied or replaced - users keep everything they typed.
#  Downtime: about 1 minute while the screens are rebuilt and services restart.
# =============================================================================
. "$PSScriptRoot\common.ps1"
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
Start-Transcript -LiteralPath (Join-Path $LogDir "update-live-$stamp.log") | Out-Null

function Git([string[]]$a) {
    # -c safe.directory: an Administrator window may otherwise refuse the folder ("dubious ownership").
    $out = & git -c safe.directory=* -C $Root @a 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw ("git {0} failed: {1}" -f ($a -join " "), ($out -join " ")) }
    return $out
}

function Build-And-Restart([hashtable]$cfg) {
    Say "   Python packages"
    foreach ($a in $Apps) {
        $be = Join-Path $Root "$($a.Dir)\backend"
        & (Join-Path $be "venv\Scripts\python.exe") -m pip install -q -r (Join-Path $be "requirements.txt") 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-With "pip install failed in $($a.Dir)\backend" }
    }
    Say "   building the four screens"
    Build-Frontends
    Say "   restarting the four services"
    Restart-NewServices $cfg
    foreach ($a in $Apps) {
        if (-not (Wait-Service $cfg $a $a.LivePort 90)) { Show-LogTail $a; Stop-With "$($a.Service) did not start on port $($a.LivePort)" }
        Say "   $($a.Service) running on $($a.LivePort)" "Green"
    }
}

function Smoke([hashtable]$cfg) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\smoke-test.ps1") -PublicUrl $cfg.CheckUrl
    return ($LASTEXITCODE -eq 0)
}

$prev = $null
try {
    Assert-Admin
    $cfg = Load-Config
    $state = Load-State
    if ($state.Phase -ne "live") { Stop-With "The new version is not live yet (state: '$($state.Phase)'). Use 2-TEST-NEW-VERSION and 3-GO-LIVE." }

    Step "1/4  Backup (databases + uploaded files)"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\backup.ps1") -BackupDir $cfg.BackupDir
    if ($LASTEXITCODE -ne 0) { Stop-With "Backup failed - nothing was changed. See backup.log in $($cfg.BackupDir)." }

    Step "2/4  Get the new version from GitHub"
    $prev = $state.LiveCommit
    $head = (Git @("rev-parse", "HEAD") | Select-Object -Last 1).Trim()
    if (-not $prev) { $prev = $head }        # first update: the version on disk now counts as "before"
    Git @("pull", "--ff-only") | ForEach-Object { Say "   $_" }
    $new = (Git @("rev-parse", "HEAD") | Select-Object -Last 1).Trim()
    Say "   before: $($prev.Substring(0,7))   now: $($new.Substring(0,7))"
    Git @("log", "--oneline", "$prev..$new") | ForEach-Object { Say "     $_" }

    Step "3/4  Install, build, restart"
    Build-And-Restart $cfg

    Step "4/4  Check"
    if (-not (Smoke $cfg)) { Stop-With "Smoke test failed (see the FAIL lines above)." }

    $state.LiveCommit = $new; $state.UpdatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm")
    Save-State $state
    Say ""
    Say "=====================================================================" Green
    Say "  UPDATED. $($cfg.PublicUrl) runs version $($new.Substring(0,7))." Green
    Say "  Users may need F5 once. Backup of today: $($cfg.BackupDir)" Green
    Say "=====================================================================" Green
} catch {
    Say ""; Say "STOPPED: $_" Red
    if ($prev) {
        $ans = Read-Host "Go back to the version before ($($prev.Substring(0,7)))? [Y/n]"
        if ($ans -notmatch '^[nN]') {
            try {
                Git @("reset", "--hard", $prev) | Out-Null
                Build-And-Restart $cfg
                if (Smoke $cfg) { Say "Back on the version before. Send scripts\switch\logs\update-live-$stamp.log to the developer." Green }
                else { Say "Went back, but checks still fail - run scripts\4-ROLLBACK.bat if the site is down." Red }
            } catch { Say "Going back failed: $_  - run scripts\4-ROLLBACK.bat if the site is down." Red }
        }
    } else { Say "Nothing was changed." Yellow }
    Stop-Transcript | Out-Null; exit 1
}
Stop-Transcript | Out-Null
