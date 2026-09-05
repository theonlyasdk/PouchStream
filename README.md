# PouchStream

Lightweight local file server for Android — stream and manage files over Wi-Fi.

By **ASDK** — `theonlyasdk`

## Features
- Foreground service with persistent notification (Stop / Open Browser)
- Wi-Fi & wake lock, autostart on boot, battery optimization prompt
- Theme: System / Light / Dark
- Security: Basic Auth, read-only mode, port auto-switch
- Storage: picks any folder via SAF, lists, uploads, downloads, range streaming
- Web portal: video player, image viewer, Monaco editor, bulk actions, drag & drop, favorites/recent, keyboard help

## Run
```bash
# dev web server (Windows)
python dev_server.py          # http://localhost:8080  shared: dev_shared_folder
# or
run_dev_server.bat

# Android
./gradlew assembleDebug
./gradlew assembleRelease     # signed with debug keystore
build_and_sign_apk.bat        # builds debug + release
adb install -r -t app/build/outputs/apk/release/app-release.apk
```

## Stack
Android 23-37, NanoHTTPD, DocumentFile, Material, WebView assets (`index.html` + `js/*`)

## Project
```
app/src/main/java/com/asdk/media/pouchstream/  # ServerService, PouchServer, SettingsActivity, MainActivity
app/src/main/assets/web/                       # portal (app.js, player.js, ui.js)
dev_server.py / dev_shared_folder/             # desktop dev server
```
