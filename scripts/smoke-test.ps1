# =============================================================================
#  NIBL Application Portal - after-deploy check
#  Run: scripts\SMOKE-TEST.bat   (or: smoke-test.ps1 -PublicUrl https://nibl)
#  Every line must say OK. Nothing is changed.
# =============================================================================
param([string]$PublicUrl = "")
$Root = Split-Path -Parent $PSScriptRoot
if (-not $PublicUrl) {
    $PublicUrl = "http://nibl"
    $f = Join-Path $Root "portal\backend\.env"
    if (Test-Path $f) { $m = Select-String -LiteralPath $f -Pattern '^\s*FRONTEND_URL\s*=\s*(.+)$' | Select-Object -First 1
        if ($m) { $PublicUrl = $m.Matches[0].Groups[1].Value.Trim().Trim('"') } }
}
$PublicUrl = $PublicUrl.TrimEnd("/")
$bad = 0
function Check([string]$name, [string]$url, [int[]]$want = @(200)) {
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0 -ErrorAction Stop; $code = [int]$r.StatusCode }
    catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
    $ok = $want -contains $code
    if (-not $ok) { $script:bad++ }
    Write-Host ("{0,-4} {1,-44} {2}  ({3})" -f ($(if ($ok) { "OK" } else { "FAIL" })), $name, $code, $url) -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
}

Write-Host "Services" -ForegroundColor Cyan
foreach ($n in "NIBL-Portal-API", "NIBL-OIPM-API", "NIBL-NPD-API", "NIBL-AIDrawing-API") {
    $s = Get-Service -Name $n -ErrorAction SilentlyContinue
    $ok = $s -and $s.Status -eq "Running"; if (-not $ok) { $bad++ }
    Write-Host ("{0,-4} {1}" -f ($(if ($ok) { "OK" } else { "FAIL" })), "$n  $(if ($s) { $s.Status } else { 'not installed' })") -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
}

Write-Host "`nBackends (direct)" -ForegroundColor Cyan
Check "Portal API  :8010" "http://127.0.0.1:8010/portal-api/health"
Check "OIPM API    :8000" "http://127.0.0.1:8000/health"
Check "NPD API     :8001" "http://127.0.0.1:8001/api/health"
Check "AI Drawing  :8002" "http://127.0.0.1:8002/api/health"

Write-Host "`nThrough IIS ($PublicUrl)" -ForegroundColor Cyan
Check "Portal screen"            "$PublicUrl/"
Check "OIPM screen"              "$PublicUrl/oipm/"
Check "NPD screen"               "$PublicUrl/npd/"
Check "Drawing screen"        "$PublicUrl/drawing-control/"
Check "Portal API via IIS"       "$PublicUrl/portal-api/health"
Check "NPD API via IIS"          "$PublicUrl/npd/api/health"
Check "Drawing API via IIS"   "$PublicUrl/drawing-control/api/health"

Write-Host "`nProduction safety (API pages must be hidden = 404)" -ForegroundColor Cyan
Check "Portal /docs hidden"      "http://127.0.0.1:8010/portal-api/docs" @(404)
Check "OIPM /docs hidden"        "http://127.0.0.1:8000/docs" @(404)
Check "NPD /docs hidden"         "http://127.0.0.1:8001/docs" @(404)
Check "AI Drawing /docs hidden"  "http://127.0.0.1:8002/api/docs" @(404)

Write-Host ""
if ($bad) { Write-Host "$bad check(s) FAILED - see the logs in <app>\backend\logs\stderr.log" -ForegroundColor Red; exit 1 }
Write-Host "All checks OK. Now sign in once in each app and send one test e-mail." -ForegroundColor Green
