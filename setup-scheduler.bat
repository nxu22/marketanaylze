@echo off
setlocal

set NODE="C:\Program Files\nodejs\node.exe"
set DIR=C:\Users\nanxu\OneDrive\Desktop\market-analyzer

echo ============================================================
echo  Market Analyzer - Task Scheduler Setup
echo ============================================================
echo.

:: ── Task 1: update-pool.js — 1st of every month at 8:00 AM ──────────────────
schtasks /delete /tn "MarketAnalyzer-UpdatePool" /f >nul 2>&1
schtasks /create ^
  /tn "MarketAnalyzer-UpdatePool" ^
  /tr "%NODE% \"%DIR%\update-pool.js\"" ^
  /sc monthly ^
  /d 1 ^
  /st 08:00 ^
  /sd 01/01/2025 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% neq 0 (
  echo [FAILED] Could not create MarketAnalyzer-UpdatePool task.
  goto end
)
echo [OK] MarketAnalyzer-UpdatePool  — runs on the 1st of every month at 08:00
echo.

:: ── Task 2: fetch.js — every day at 8:00 AM ─────────────────────────────────
schtasks /delete /tn "MarketAnalyzer-Fetch" /f >nul 2>&1
schtasks /create ^
  /tn "MarketAnalyzer-Fetch" ^
  /tr "%NODE% \"%DIR%\fetch.js\"" ^
  /sc daily ^
  /st 08:00 ^
  /sd 01/01/2025 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% neq 0 (
  echo [FAILED] Could not create MarketAnalyzer-Fetch task.
  goto end
)
echo [OK] MarketAnalyzer-Fetch       — runs every day at 08:00
echo.

echo ============================================================
echo  Both tasks registered successfully.
echo.
echo  To verify:
echo    schtasks /query /tn "MarketAnalyzer-UpdatePool"
echo    schtasks /query /tn "MarketAnalyzer-Fetch"
echo.
echo  To run manually right now:
echo    schtasks /run /tn "MarketAnalyzer-UpdatePool"
echo    schtasks /run /tn "MarketAnalyzer-Fetch"
echo.
echo  To remove the tasks later:
echo    schtasks /delete /tn "MarketAnalyzer-UpdatePool" /f
echo    schtasks /delete /tn "MarketAnalyzer-Fetch" /f
echo ============================================================

:end
endlocal
pause
