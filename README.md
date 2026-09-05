# PouchStream

Lightweight local file server for Android — stream and manage files over Wi-Fi.

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
Android SDK, NanoHTTPD, DocumentFile, Material, WebView assets (HTML/CSS/JS)

# License
Licensed under the MIT license.