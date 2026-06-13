$ErrorActionPreference = "Stop"
$BuildDir = "C:\Users\j.u.Eun\hwpview_temp_build"
$InstallDir = "C:\Users\j.u.Eun\hwpview_temp\install"

Write-Host "[1/4] 찌꺼기 없는 깨끗한 빌드 폴더를 준비 중입니다..." -ForegroundColor Cyan
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

Write-Host "[2/4] 소스 코드를 안전하게 복사 중입니다 (무거운 폴더 제외)..." -ForegroundColor Cyan
Set-Content -Path "exclude.txt" -Value "node_modules\`nrhwp\`ndist\`n.git\`n.next\"
cmd.exe /c "xcopy ""Y:\내 드라이브\AI\안티그래비티\hwpview\*"" ""$BuildDir\"" /E /I /H /Y /EXCLUDE:exclude.txt >nul"
Remove-Item "exclude.txt"

Write-Host "[3/4] 패키지 설치 및 데스크톱 앱(.exe) 빌드를 진행합니다..." -ForegroundColor Cyan
Set-Location $BuildDir
npm install
npm run dist

Write-Host "[4/4] 생성된 설치 파일을 사용자님이 지정하신 폴더로 이동합니다..." -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null }
Copy-Item "dist\HwpLens Setup 1.0.0.exe" "$InstallDir\" -Force

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "빌드가 성공적으로 완료되었습니다! 🎉" -ForegroundColor Green
Write-Host "설치 파일 위치: $InstallDir\HwpLens Setup 1.0.0.exe" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Read-Host -Prompt "종료하려면 엔터 키를 누르세요..."
