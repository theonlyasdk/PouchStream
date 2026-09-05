@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo          Yolodoc - Fast APK Build ^& Sign Script
echo ======================================================================
echo.

:: 1. Locate Java / JBR
if defined JAVA_HOME (
    echo [*] Using existing JAVA_HOME: %JAVA_HOME%
) else (
    if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
        echo [*] Auto-detected Android Studio JBR: !JAVA_HOME!
    ) else if exist "C:\Program Files\Android\Android Studio\jre" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jre"
        echo [*] Auto-detected Android Studio JRE: !JAVA_HOME!
    ) else (
        echo [!] Warning: JAVA_HOME is not set. Gradle will attempt to use PATH java.
    )
)

echo.
echo [*] Building and signing Release and Debug APKs with Gradle...
echo.

:: 2. Execute Gradle build
call gradlew.bat assembleRelease assembleDebug --no-daemon

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Gradle build failed with error code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

:: 3. Verify output files
set "RELEASE_APK=app\build\outputs\apk\release\app-release.apk"
set "DEBUG_APK=app\build\outputs\apk\debug\app-debug.apk"

if not exist "%RELEASE_APK%" (
    if exist "app\build\outputs\apk\release\app-release-unsigned.apk" (
        set "RELEASE_APK=app\build\outputs\apk\release\app-release-unsigned.apk"
    )
)

echo.
echo ======================================================================
echo                   BUILD ^& SIGN SUCCESSFUL!
echo ======================================================================
echo.

if exist "%RELEASE_APK%" (
    echo [SUCCESS] Signed Release APK:
    echo           %CD%\%RELEASE_APK%
    echo.
)

if exist "%DEBUG_APK%" (
    echo [SUCCESS] Signed Debug APK:
    echo           %CD%\%DEBUG_APK%
    echo.
)

echo [*] To install directly to connected device:
echo     adb install -r -t "%RELEASE_APK%"
echo ======================================================================
echo.

exit /b 0
