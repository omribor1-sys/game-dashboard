Set-Location "C:\Users\Omri\game-dashboard"
git add -A
git commit -m "Auto backup $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "Backup saved"
