$ErrorActionPreference = "Stop"
$BuildDir = "C:\Users\user\hwpview_temp_build"
$InstallDir = "C:\Users\user\hwpview_temp\install"

Write-Host "[1/4] 찌꺼기 없는 깨끗한 빌드 폴더를 준비 중입니다..." -ForegroundColor Cyan
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

Write-Host "[2/4] 소스 코드를 안전하게 복사 중입니다 (무거운 폴더 제외)..." -ForegroundColor Cyan
function Copy-SourceFolder ($src, $dest) {
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
    $ExcludeDirs = @("node_modules", "dist", ".git", ".next", "rhwp")
    $ExcludeFiles = @("*.exe", "*.zip")
    $items = Get-ChildItem -Path $src -Force
    foreach ($item in $items) {
        $name = $item.Name
        $fullName = $item.FullName
        $targetPath = Join-Path $dest $name
        if ($item.PSIsContainer) {
            if ($ExcludeDirs -contains $name) { continue }
            Copy-SourceFolder $fullName $targetPath
        } else {
            $skipFile = $false
            foreach ($pattern in $ExcludeFiles) {
                if ($name -like $pattern) {
                    $skipFile = $true
                    break
                }
            }
            if (-not $skipFile) {
                Copy-Item $fullName -Destination $targetPath -Force -ErrorAction SilentlyContinue | Out-Null
            }
        }
    }
}
Copy-SourceFolder $PSScriptRoot $BuildDir

Write-Host "[3/4] 패키지 설치 및 데스크톱 앱(.exe) 빌드를 진행합니다..." -ForegroundColor Cyan
Set-Location $BuildDir
npm install
npm run dist

Write-Host "[4/4] 생성된 설치 파일을 사용자님이 지정하신 폴더로 이동합니다..." -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null }
Copy-Item "dist\HwpLens Setup 1.0.3.exe" "$InstallDir\" -Force

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "빌드가 성공적으로 완료되었습니다! 🎉" -ForegroundColor Green
Write-Host "설치 파일 위치: $InstallDir\HwpLens Setup 1.0.3.exe" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
# Read-Host -Prompt "종료하려면 엔터 키를 누르세요..."
