# =============================================================================
#  One-time: put every application's files into its own data folder
#
#     applications\OIPM\data                 OIPM images
#     applications\NPD\data                  NPD attachments
#     applications\AI-Drawing-Control\data   AI Drawing PDFs (drawings\...)
#
#  * COPIES the files (robocopy) - the old folders are NOT deleted or changed.
#  * Points STORAGE_DIR in the NPD and AI Drawing .env files at ..\data
#    (a backup of each .env is written first, as .env.before-move-data).
#  * Safe to run again: files already copied are skipped.
#  Run:  scripts\MOVE-DATA.bat   (stop the backends first, start them after)
# =============================================================================
param([string]$OldOipmDir = "D:\Internal Workspace\oipm\data")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
function Say([string]$m, [string]$c = "Gray") { Write-Host $m -ForegroundColor $c }

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
    Set-Content -LiteralPath $file -Value $lines -Encoding utf8
}

function Resolve-From([string]$base, [string]$p) {
    if (-not $p) { return "" }
    if ([System.IO.Path]::IsPathRooted($p)) { return [System.IO.Path]::GetFullPath($p) }
    return [System.IO.Path]::GetFullPath((Join-Path $base $p))
}

function Copy-Tree([string]$src, [string]$dst, [string[]]$excludeDirs = @()) {
    if (-not $src -or -not (Test-Path -LiteralPath $src)) { Say "   nothing to copy (no folder $src)"; return }
    if ([System.IO.Path]::GetFullPath($src).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($dst).TrimEnd('\')) { Say "   already in place"; return }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $rc = @($src, $dst, "/E", "/XO", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NP")
    if ($excludeDirs.Count) { $rc += "/XD"; $rc += $excludeDirs }
    & robocopy @rc | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) copying $src" }
    $n = (Get-ChildItem -LiteralPath $dst -Recurse -File -ErrorAction SilentlyContinue | Where-Object Name -ne "README.md").Count
    Say ("   copied from {0}  ->  {1} files now in {2}" -f $src, $n, $dst) "Green"
}

function Backup-Env([string]$file) {
    if (Test-Path -LiteralPath $file) {
        $bak = "$file.before-move-data"
        if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $file $bak }
    }
}

# ---------------------------------------------------------------- OIPM
Say ""; Say ">> OIPM images" "Cyan"
$oipmData = Join-Path $Root "applications\OIPM\data"
Copy-Tree $OldOipmDir $oipmData
Say "   OIPM now saves to applications\OIPM\data (default - nothing to set)"

# ---------------------------------------------------------------- NPD
Say ""; Say ">> NPD attachments" "Cyan"
$npdBackend = Join-Path $Root "applications\NPD\backend"
$npdEnv = Join-Path $npdBackend ".env"
$npdData = Join-Path $Root "applications\NPD\data"
$npdMode = (Read-EnvValue $npdEnv "STORAGE_BACKEND").ToLower()
$hasSupabase = (Read-EnvValue $npdEnv "SUPABASE_URL") -and (Read-EnvValue $npdEnv "SUPABASE_SERVICE_KEY")
$npdOld = Resolve-From $npdBackend ((Read-EnvValue $npdEnv "STORAGE_DIR"), "uploads" | Where-Object { $_ } | Select-Object -First 1)
if ($npdMode -eq "supabase" -or (($npdMode -eq "" -or $npdMode -eq "auto") -and $hasSupabase)) {
    Say "   NPD files are kept in Supabase cloud storage (STORAGE_BACKEND=$npdMode) - left unchanged." "Yellow"
    Say "   Tell the developer if they should be brought into applications\NPD\data." "Yellow"
} else {
    Copy-Tree $npdOld $npdData @("drawings")      # drawings\ belongs to AI Drawing Control
    Backup-Env $npdEnv
    Set-EnvValue $npdEnv "STORAGE_BACKEND" "local"
    Set-EnvValue $npdEnv "STORAGE_DIR" "../data"
    Say "   NPD .env now: STORAGE_DIR=../data"
}

# ---------------------------------------------------------------- AI Drawing Control
Say ""; Say ">> AI Drawing Control PDFs" "Cyan"
$dcBackend = Join-Path $Root "applications\AI-Drawing-Control\backend"
$dcEnv = Join-Path $dcBackend ".env"
$dcData = Join-Path $Root "applications\AI-Drawing-Control\data"
$dcOld = Resolve-From $dcBackend ((Read-EnvValue $dcEnv "STORAGE_DIR"), "uploads" | Where-Object { $_ } | Select-Object -First 1)
Copy-Tree (Join-Path $dcOld "drawings") (Join-Path $dcData "drawings")
Backup-Env $dcEnv
Set-EnvValue $dcEnv "STORAGE_BACKEND" "local"
Set-EnvValue $dcEnv "STORAGE_DIR" "../data"
Say "   AI Drawing .env now: STORAGE_DIR=../data"

Say ""
Say "==================================================================" "Green"
Say "  DONE. Restart the backends (scripts\START-DEV.bat)."               "Green"
Say "  Check a few images / attachments / PDFs open, then you may delete"  "Green"
Say "  the OLD folders yourself:"                                          "Green"
Say "     $OldOipmDir"                                                      "Green"
Say "     $npdOld"                                                          "Green"
Say "==================================================================" "Green"
