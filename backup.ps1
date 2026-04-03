Set-Location "C:\Users\Omri\game-dashboard"
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git add -A
git commit -m "Auto backup $timestamp"
git push origin main
Write-Host "Backup saved and pushed to GitHub"
