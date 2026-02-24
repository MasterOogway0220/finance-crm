$src = 'E:\freelance\finance-crm'
$stage = 'E:\freelance\finance-crm-stage'
$zip = 'E:\freelance\finance-crm\finance-crm-deploy.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

# Copy .next excluding dev folder
robocopy "$src\.next" "$stage\.next" /E /XD "$src\.next\dev" /NFL /NDL /NJH /NJS | Out-Null

# Copy other items
$items = @('public','prisma','src','package.json','package-lock.json','next.config.ts','server.js','.env','prisma.config.ts','components.json','tsconfig.json')
foreach ($item in $items) {
    $srcPath = Join-Path $src $item
    if (Test-Path $srcPath) {
        if ((Get-Item $srcPath).PSIsContainer) {
            robocopy $srcPath (Join-Path $stage $item) /E /NFL /NDL /NJH /NJS | Out-Null
        } else {
            Copy-Item $srcPath $stage
        }
    }
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force
Write-Host "Done - ZIP created at $zip"
