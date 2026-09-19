@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."
if errorlevel 1 goto :failed

set "DATA_BRANCH=main"

echo ========================================
echo  SYU Out Food production data refresh
echo ========================================
echo.
echo [1/3] Collecting places, visitor reviews, and menus...
if not exist "collector\node_modules\playwright-core" (
  echo Installing collector dependencies for the first run...
  call npm.cmd --prefix collector install
  if errorlevel 1 goto :failed
)
call npm.cmd --prefix collector run refresh:data
if errorlevel 1 goto :failed

echo.
echo [2/3] Checking data changes...
git status --porcelain -- places.production.json reviews.production.json menus.production.json >nul
if errorlevel 1 goto :failed

set "HAS_DATA_CHANGES="
for /f "delims=" %%S in ('git status --porcelain -- places.production.json reviews.production.json menus.production.json') do set "HAS_DATA_CHANGES=1"

if not defined HAS_DATA_CHANGES (
  echo Production data is unchanged. No commit was created.
  echo.
  echo [3/3] No changes to push.
  goto :finish
)

echo.
echo [변경 사항 감지]
git status --short -- places.production.json reviews.production.json menus.production.json
echo.
git diff --stat -- places.production.json reviews.production.json menus.production.json
echo.
set "CONFIRM_COMMIT="
set /p "CONFIRM_COMMIT=변경된 데이터를 커밋하고 GitHub에 푸시하시겠습니까? (y/N): "
if /i not "!CONFIRM_COMMIT!"=="y" (
  echo.
  echo [취소] 커밋 및 푸시가 취소되었습니다.
  git checkout -- places.production.json reviews.production.json menus.production.json >nul 2>&1
  echo 데이터 저장소의 변경 사항을 커밋하지 않고 원래대로 되돌렸습니다.
  goto :cancelled
)

git add -- places.production.json reviews.production.json menus.production.json
if errorlevel 1 goto :failed

set "COMMIT_DATE="
for /f "delims=" %%D in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyy-MM-dd"' ) do set "COMMIT_DATE=%%D"
git commit --only -m "chore(data): refresh production data !COMMIT_DATE!" -- places.production.json reviews.production.json menus.production.json
if errorlevel 1 goto :failed

echo.
echo [3/3] Pushing '%DATA_BRANCH%' to GitHub...
git push origin "%DATA_BRANCH%"
if errorlevel 1 goto :failed

:finish
echo.
echo ========================================
echo  Refresh and GitHub push completed.
echo ========================================
echo.
pause
exit /b 0

:cancelled
echo.
echo ========================================
echo  작업이 취소되었습니다 (커밋 및 푸시 생략).
echo ========================================
echo.
pause
exit /b 0

:failed
echo.
echo ========================================
echo  Refresh did not complete.
echo  Check the error shown above.
echo ========================================
echo.
pause
exit /b 1
