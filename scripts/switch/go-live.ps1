# =============================================================================
#  STEP 3 - Switch users from the OLD version to the NEW one.
#  Downtime: a few minutes (the live data is copied again so nothing typed
#  since the test is lost). If anything fails, it offers to roll back.
#  The old databases (oipm, apqp) and old folders are never changed or deleted.
# =============================================================================
. "$PSScriptRoot\common.ps1"
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
Start-Transcript -LiteralPath (Join-Path $LogDir "go-live-$stamp.log") | Out-Null
$changed = $false
try {
    Assert-Admin
    $cfg = Load-Config
    $state = Load-State
    if ($state.Phase -eq "live") { Stop-With "Already live since $($state.LiveAt). Nothing to do." }
    if (-not $state.TestDone) { Stop-With "Run scripts\2-TEST-NEW-VERSION.bat first and check the test site." }
    $pg = Use-Pg $cfg
    Read-PgPassword | Out-Null

    Step "0/7  Pre-check (nothing changed yet)"
    $script:Bad = 0
    foreach ($a in $Apps) { Check "$($a.Service) :$($a.TestPort)" "http://127.0.0.1:$($a.TestPort)$($a.Health)" }
    if ($script:Bad) { Stop-With "The test version is not healthy - run 2-TEST-NEW-VERSION again and fix it first." }
    Say ""
    Say "This will stop the OLD services ($($cfg.OldServices -join ', ')) and switch $($cfg.PublicUrl) to the NEW version." Yellow
    Say "Users will see the site down for a few minutes. Data typed on the TEST site is thrown away." Yellow
    if ((Read-Host "Type GO to continue") -ne "GO") { Stop-With "Cancelled - nothing was changed." }

    Step "1/7  Backups"
    $bk = Join-Path $cfg.BackupDir "golive-$stamp"
    $iisBackup = "NIBL-before-golive-$stamp"
    AppCmd @("add", "backup", $iisBackup) | Out-Null
    Say "   IIS settings saved as backup '$iisBackup'" "Green"
    Save-State @{ TestDone = $state.TestDone; Phase = "switching"; IisBackup = $iisBackup; Stamp = $stamp; BackupDir = $bk }

    Step "2/7  Stop the OLD services  (site is down from here)"
    $changed = $true
    Stop-OldServices $cfg
    Stop-NewServices $cfg
    Say "   database backups (after stop, so they are complete)"
    foreach ($db in $cfg.OipmDb, $cfg.NpdDb) { Dump-Db $db $bk }

    Step "3/7  Fresh copy of the live data into nibl_* (test copy kept as nibl_*_test_$stamp)"
    Rename-NiblDbs "test_$stamp" | Out-Null
    Run-Setup $cfg

    Step "4/7  Copy files uploaded since the test"
    Copy-Uploads $cfg
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\prepare-production.ps1") -PublicUrl $cfg.PublicUrl -KeepPassword -NoRestart
    # exit 2 = settings written, only FIX notes (e.g. weak DB password - changed after go-live). Only 1 is a real failure.
    if ($LASTEXITCODE -eq 1) { Stop-With "prepare-production.ps1 failed" }

    Step "5/7  New services on the LIVE ports, mail and reminders ON"
    Clear-TestMode $cfg
    Restart-NewServices $cfg
    foreach ($a in $Apps) {
        if (-not (Wait-Service $cfg $a $a.LivePort 90)) { Show-LogTail $a; Stop-With "$($a.Service) did not start on port $($a.LivePort) - see $($a.Dir)\backend\logs\stderr.log" }
        Say "   $($a.Service) running on $($a.LivePort)" "Green"
    }

    Step "6/7  Point IIS site '$($cfg.IisSite)' at the new screens"
    foreach ($a in $Apps) { Iis-Point $cfg.IisSite $a.IisPath (Dist $a); Say ("   {0,-22} -> {1}" -f "$($cfg.IisSite)$($a.IisPath)/", (Dist $a)) "Green" }
    & $AppCmd delete site $TestSite 2>&1 | Out-Null
    Remove-NetFirewallRule -DisplayName "NIBL test site" -ErrorAction SilentlyContinue
    Start-Sleep 3

    Step "7/7  Smoke test"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\smoke-test.ps1") -PublicUrl $cfg.CheckUrl
    if ($LASTEXITCODE -ne 0) { Stop-With "Smoke test failed (see the FAIL lines above)." }

    $liveCommit = (& git -c safe.directory=* -C $Root rev-parse HEAD 2>$null | Select-Object -Last 1)
    Save-State @{ TestDone = $state.TestDone; Phase = "live"; LiveAt = (Get-Date -Format "yyyy-MM-dd HH:mm"); IisBackup = $iisBackup; Stamp = $stamp; BackupDir = $bk; LiveCommit = "$liveCommit".Trim() }
    Say ""
    Say "=====================================================================" Green
    Say "  LIVE.  $($cfg.PublicUrl) now runs the new version." Green
    Say "  Now by hand: sign in, open the 3 cards, register a test user," Green
    Say "  try Forgot password (e-mail must arrive)." Green
    Say "  Something wrong?  scripts\4-ROLLBACK.bat  (old version back in ~1 min)" Green
    Say "  Backups: $bk   and IIS backup '$iisBackup'" Green
    Say "  Later (not today): PREPARE-PRODUCTION.bat to set a strong DB password," Green
    Say "  install-backup-task.ps1 for nightly backups." Green
    Say "=====================================================================" Green
} catch {
    Say ""; Say "STOPPED: $_" Red
    if ($changed) {
        $ans = Read-Host "Roll back to the OLD version now? [Y/n]"
        if ($ans -notmatch '^[nN]') {
            Stop-Transcript | Out-Null
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $SwitchDir "rollback.ps1") -Auto
            exit 1
        }
        Say "Not rolled back. The site may be DOWN. Run scripts\4-ROLLBACK.bat if needed." Red
    } else { Say "Nothing was changed - the old version is still live." Yellow }
    Stop-Transcript | Out-Null; exit 1
}
Stop-Transcript | Out-Null
