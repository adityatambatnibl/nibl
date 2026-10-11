# Registers the nightly backup (scripts\backup.ps1) as a Windows scheduled task.
# Run as Administrator on the SERVER:
#   powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1 -BackupDir "E:\NIBL-BACKUPS" -At "01:30"
# Tip: put -BackupDir on a different disk (or a network share) than the databases.
param([string]$BackupDir = "D:\NIBL-BACKUPS", [string]$At = "01:30", [int]$KeepDays = 14)
$script = Join-Path $PSScriptRoot "backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -BackupDir `"$BackupDir`" -KeepDays $KeepDays"
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "NIBL-Nightly-Backup" -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Force | Out-Null
Write-Host "Task 'NIBL-Nightly-Backup' runs every day at $At -> $BackupDir (keeps $KeepDays days)." -ForegroundColor Green
Write-Host "Test it now:  Start-ScheduledTask -TaskName NIBL-Nightly-Backup   then look at $BackupDir\backup.log" -ForegroundColor Cyan
