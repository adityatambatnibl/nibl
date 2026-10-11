# =============================================================================
#  ROLLBACK - put the OLD version back (about 1 minute).
#  Stops the four NIBL-* services, restores the IIS settings saved by GO-LIVE,
#  and starts the old services again. The old databases were never changed.
#  Note: anything typed in the NEW version after go-live stays in the nibl_*
#  databases (not deleted) but is NOT visible in the old version.
# =============================================================================
param([switch]$Auto)
. "$PSScriptRoot\common.ps1"
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
Start-Transcript -LiteralPath (Join-Path $LogDir "rollback-$stamp.log") | Out-Null
try {
    Assert-Admin
    $cfg = Load-Config
    $state = Load-State
    if (-not $state.IisBackup) { Stop-With "No go-live record found (deploy-state.json) - nothing to roll back." }
    if (-not $Auto) {
        Say "This puts the OLD version back on $($cfg.PublicUrl)." Yellow
        if ((Read-Host "Type BACK to continue") -ne "BACK") { Stop-With "Cancelled - nothing was changed." }
    }

    Step "1/3  Stop the new services"
    foreach ($a in $Apps) {
        if (Get-Service $a.Service -ErrorAction SilentlyContinue) {
            & $cfg.Nssm stop $a.Service 2>&1 | Out-Null
            & $cfg.Nssm set $a.Service Start SERVICE_DEMAND_START 2>&1 | Out-Null
            Say "   stopped $($a.Service) (startup Manual)" "Green"
        }
    }

    Step "2/3  Restore IIS settings '$($state.IisBackup)'"
    AppCmd @("restore", "backup", $state.IisBackup) | Out-Null
    Say "   IIS restored" "Green"

    Step "3/3  Start the old services"
    Start-OldServices $cfg
    Start-Sleep 5
    $script:Bad = 0
    foreach ($p in 8000, 8001) {
        $ok = Wait-Port $p 45
        if (-not $ok) { $script:Bad++ }
        Say ("{0,-4} port {1} {2}" -f $(if ($ok) { "OK" } else { "FAIL" }), $p, $(if ($ok) { "listening" } else { "NOT listening" })) $(if ($ok) { "Green" } else { "Red" })
    }
    Check "Live site" "$($cfg.PublicUrl)/" @(200, 301, 302)

    $state.Phase = "rolled-back"; $state.RolledBackAt = (Get-Date -Format "yyyy-MM-dd HH:mm")
    Save-State $state
    Say ""
    if ($script:Bad) { Say "Rolled back, but $script:Bad check(s) failed - open services.msc and IIS Manager and look." Red }
    else { Say "OLD version is back on $($cfg.PublicUrl)." Green }
    Say "To try again later: fix the problem, run 2-TEST-NEW-VERSION, then 3-GO-LIVE." Green
} catch {
    Say ""; Say "ROLLBACK STOPPED: $_" Red
    Say "By hand: services.msc -> start $($cfg.OldServices -join ', ');  IIS: %windir%\system32\inetsrv\appcmd restore backup `"$($state.IisBackup)`"" Yellow
    Stop-Transcript | Out-Null; exit 1
}
Stop-Transcript | Out-Null
