# Build Instructions for Agent

> [!IMPORTANT]
> **CRITICAL FOR FIRST-TRY BUILDS:**
> `JAVA_HOME` is **not** set in the system `PATH` by default on this machine. Running `./gradlew` without specifying `JAVA_HOME` will fail with:
> `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.`
>
> The Android Studio bundled JDK (Java 25 JBR) is located at:
> `C:\Program Files\Android\Android Studio\jbr`
>
> Always prepend `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"` in PowerShell before executing Gradle commands.

---

## 🛠️ Quick Commands

### 1. Build Android Debug APK
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; ./gradlew assembleDebug
```
- Output APK: `app/build/outputs/apk/debug/app-debug.apk`

### 2. Run Unit Tests
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; ./gradlew test
```

### 3. Build Release APK (Signed with Debug Keystore)
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; ./gradlew assembleRelease
```
- Output APK: `app/build/outputs/apk/release/app-release.apk`
- Or use the automated batch script:
  ```cmd
  .\build_and_sign_apk.bat
  ```

### 4. Run Desktop Development Server (Python)
Simulates the Android server and serves the Web UI from `app/src/main/assets/web`:
```powershell
python dev_server.py
# Or with custom port/folder:
python dev_server.py --port 8080 --folder dev_shared_folder
# Or batch script:
.\run_dev_server.bat
```
- Web Portal: `http://localhost:8080`

### 5. Install to Connected Android Device via ADB
```powershell
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
```

---

## 📁 Project Architecture & Key Files

- **Application ID:** `com.asdk.media.pouchstream`
- **Target SDK:** 37 (Android 15), **Min SDK:** 23 (Android 6.0)
- **Key Source Files:**
  - [`PouchServer.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/PouchServer.java): Embedded NanoHTTPD server handling API endpoints (`/api/info`, `/api/files`, `/api/stream`, `/api/upload`, etc.).
  - [`ServerService.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/ServerService.java): Foreground service keeping the server alive in the background with notifications and wake/Wi-Fi locks.
  - [`StorageHelper.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/StorageHelper.java): Resolves, lists, reads, and writes files through Android's Storage Access Framework (`DocumentFile`).
  - [`BoundedInputStream.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/BoundedInputStream.java): Input stream bounds limiter for HTTP 206 Partial Content range requests.
  - [`MainActivity.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/MainActivity.java): Main UI dashboard, folder selection launcher, server start/stop toggling.
  - [`SettingsActivity.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/SettingsActivity.java): Port selection, authentication credentials, battery optimization, theme toggling.
  - [`NetworkUtils.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/NetworkUtils.java): Resolves local IPv4 Wi-Fi / Hotspot address.
- **Web Portal Assets:**
  - Located under: [`app/src/main/assets/web/`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/assets/web/)
  - Main HTML: `index.html`
  - Client Scripts: `js/app.js`, `js/api.js`, `js/player.js`, `js/editor.js`, `js/imageViewer.js`, `js/ui.js`, `js/state.js`
- **Documentation:**
  - Improvements, bugfixes, and proposed features: [`docs/improvements-and-bugfixes.md`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/docs/improvements-and-bugfixes.md)
