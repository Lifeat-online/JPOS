$filePath = "src/views/DevDashboard.tsx"
$content = Get-Content $filePath -Raw

$oldPattern = "() => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.total, 0)"
$newPattern = "() => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + (Number(s.total) || 0), 0)"

if ($content.Contains($oldPattern)) {
    $content = $content.Replace($oldPattern, $newPattern)
    Set-Content $filePath -Value $content -NoNewline
    Write-Host "Fix applied successfully!"
} else {
    Write-Host "Pattern not found. Checking for similar content..."
    $idx = $content.IndexOf("totalRevenue = useMemo")
    if ($idx -ge 0) {
        Write-Host "Found at index $idx"
        Write-Host $content.Substring($idx, [Math]::Min(300, $content.Length - $idx))
    }
}
