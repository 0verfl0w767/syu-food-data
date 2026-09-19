@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."
if errorlevel 1 goto :failed

set "DATA_REPO_URL=https://github.com/0verfl0w767/syu-food-data.git"
set "DATA_REPO_ROOT=%LOCALAPPDATA%\SYU-Out-Food"
set "DATA_REPO_DIR=%DATA_REPO_ROOT%\syu-food-data"
set "DATA_BRANCH=main"

echo ========================================
echo  SYU Out Food production data refresh
echo ========================================
echo  Target: %DATA_REPO_URL%
echo.
echo [1/4] Collecting places, visitor reviews, and menus...
if not exist "collector\node_modules\playwright-core" (
  echo Installing collector dependencies for the first run...
  call npm.cmd --prefix collector install
  if errorlevel 1 goto :failed
)
call npm.cmd --prefix collector run refresh:data
if errorlevel 1 goto :failed

echo.
echo [2/4] Preparing the data repository...
if not exist "%DATA_REPO_ROOT%" (
  mkdir "%DATA_REPO_ROOT%"
  if errorlevel 1 goto :failed
)
if not exist "%DATA_REPO_DIR%\.git" (
  if exist "%DATA_REPO_DIR%" (
    echo ERROR: The data cache path exists but is not a Git repository:
    echo %DATA_REPO_DIR%
    goto :failed
  )
  git clone "%DATA_REPO_URL%" "%DATA_REPO_DIR%"
  if errorlevel 1 goto :failed
) else (
  git -C "%DATA_REPO_DIR%" remote set-url origin "%DATA_REPO_URL%"
  if errorlevel 1 goto :failed
  git -C "%DATA_REPO_DIR%" fetch origin
  if errorlevel 1 goto :failed
)

git -C "%DATA_REPO_DIR%" show-ref --verify --quiet "refs/remotes/origin/%DATA_BRANCH%"
if errorlevel 1 (
  git -C "%DATA_REPO_DIR%" checkout -B "%DATA_BRANCH%"
  if errorlevel 1 goto :failed
) else (
  git -C "%DATA_REPO_DIR%" show-ref --verify --quiet "refs/heads/%DATA_BRANCH%"
  if errorlevel 1 (
    git -C "%DATA_REPO_DIR%" checkout -b "%DATA_BRANCH%" --track "origin/%DATA_BRANCH%"
    if errorlevel 1 goto :failed
  ) else (
    git -C "%DATA_REPO_DIR%" checkout "%DATA_BRANCH%"
    if errorlevel 1 goto :failed
  )
  git -C "%DATA_REPO_DIR%" pull --ff-only origin "%DATA_BRANCH%"
  if errorlevel 1 goto :failed
)

echo.
echo [3/4] Copying and committing production JSON files...
copy /Y "collector\data\places.production.json" "%DATA_REPO_DIR%\places.production.json" >nul
if errorlevel 1 goto :failed
copy /Y "collector\data\reviews.production.json" "%DATA_REPO_DIR%\reviews.production.json" >nul
if errorlevel 1 goto :failed
copy /Y "collector\data\menus.production.json" "%DATA_REPO_DIR%\menus.production.json" >nul
if errorlevel 1 goto :failed

git -C "%DATA_REPO_DIR%" status --porcelain -- places.production.json reviews.production.json menus.production.json >nul
if errorlevel 1 goto :failed

set "HAS_DATA_CHANGES="
for /f "delims=" %%S in ('git -C "%DATA_REPO_DIR%" status --porcelain -- places.production.json reviews.production.json menus.production.json') do set "HAS_DATA_CHANGES=1"

if not defined HAS_DATA_CHANGES (
  echo Production data is unchanged. No commit was created.
  echo.
  echo [4/4] No changes to push.
  goto :finish
)

echo.
echo [변경 사항 감지]
git -C "%DATA_REPO_DIR%" status --short -- places.production.json reviews.production.json menus.production.json
echo.
git -C "%DATA_REPO_DIR%" diff --stat -- places.production.json reviews.production.json menus.production.json
echo.
set "CONFIRM_COMMIT="
set /p "CONFIRM_COMMIT=변경된 데이터를 커밋하고 GitHub에 푸시하시겠습니까? (y/N): "
if /i not "!CONFIRM_COMMIT!"=="y" (
  echo.
  echo [취소] 커밋 및 푸시가 취소되었습니다.
  git -C "%DATA_REPO_DIR%" checkout -- places.production.json reviews.production.json menus.production.json >nul 2>&1
  echo 데이터 저장소의 변경 사항을 커밋하지 않고 원래대로 되돌렸습니다.
  goto :cancelled
)

git -C "%DATA_REPO_DIR%" add -- places.production.json reviews.production.json menus.production.json
if errorlevel 1 goto :failed

set "COMMIT_DATE="
for /f "delims=" %%D in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyy-MM-dd"' ) do set "COMMIT_DATE=%%D"
git -C "%DATA_REPO_DIR%" commit --only -m "chore(data): refresh production data !COMMIT_DATE!" -- places.production.json reviews.production.json menus.production.json
if errorlevel 1 goto :failed

echo.
echo [4/4] Pushing '%DATA_BRANCH%' to syu-food-data...
git -C "%DATA_REPO_DIR%" push --set-upstream origin "%DATA_BRANCH%"
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
echo  Data repository cache: %DATA_REPO_DIR%
echo ========================================
echo.
pause
exit /b 1
