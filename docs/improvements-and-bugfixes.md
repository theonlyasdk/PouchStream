# PouchStream — Feature Additions, Improvements & Bugfixes

This document outlines identified bugs, proposed feature additions, and architectural/performance improvements for PouchStream across the Android native app, embedded NanoHTTPD server, web frontend portal, and local Python development server.

---

## 1. Critical Bug Fixes & Stability Issues

### 1.1 File Descriptor Leak in Range & Full File Streaming
- **File:** [`app/src/main/java/com/asdk/media/pouchstream/PouchServer.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/PouchServer.java#L369-L442)
- **Root Cause:** In `handleStream()`, `ParcelFileDescriptor pfd = storageHelper.openFileDescriptor(doc)` is opened for each incoming request. The code creates a `FileInputStream fis = new FileInputStream(pfd.getFileDescriptor())` and passes it to NanoHTTPD directly or wrapped in `BoundedInputStream`. In Android Java, closing a `FileInputStream` created from a raw `FileDescriptor` does **not** close the underlying `ParcelFileDescriptor`.
- **Impact:** When streaming video (where HTML5 media players initiate dozens of HTTP 206 range requests for buffering) or downloading multiple files, file descriptors leak continuously until Android hits `errno 24: Too many open files`, crashing the service and corrupting I/O.
- **Solution:** Use Android's [`ParcelFileDescriptor.AutoCloseInputStream(pfd)`](https://developer.android.com/reference/android/os/ParcelFileDescriptor.AutoCloseInputStream) or ensure `pfd.close()` is invoked when the input stream is closed:
  ```java
  InputStream fis = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
  ```

---

### 1.2 HTTP Range Suffix-Byte-Range Calculation Bug (RFC 7233 / 9110 Violation)
- **Files:**
  - [`app/src/main/java/com/asdk/media/pouchstream/PouchServer.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/PouchServer.java#L378-L400)
  - [`dev_server.py`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/tools/dev_server.py#L274-L281)
- **Root Cause:** When an HTTP client or media player sends a suffix byte-range header like `Range: bytes=-50000` (requesting the last 50 KB of a file, standard behavior for media players locating trailer metadata or MP4 `moov` atoms), `dashIdx` is `0`, `startStr` is `""`, and `endStr` is `"50000"`. The current logic leaves `start = 0` and sets `end = 50000`, returning the **first** 50 KB instead of the last 50 KB.
- **Impact:** Video streaming fails to seek to the end or fails to initialize playback on players that inspect file footers.
- **Solution:** Handle suffix byte ranges according to RFC 7233:
  ```java
  if (startStr.isEmpty() && !endStr.isEmpty()) {
      long suffixLength = Long.parseLong(endStr);
      start = Math.max(0, fileLen - suffixLength);
      end = fileLen - 1;
  }
  ```

---

### 1.3 Silent WakeLock Expiry Causing Background Server Freeze
- **File:** [`app/src/main/java/com/asdk/media/pouchstream/ServerService.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/ServerService.java#L128-L132)
- **Root Cause:** In `acquireWakeLock()`, the wake lock is acquired with `wakeLock.acquire(10 * 60 * 1000L);` (10 minutes) to suppress an Android Lint warning (`WakelockTimeout`). Although code comments state *"re-acquired if needed while running"*, no timer, handler, or service callback ever re-acquires it.
- **Impact:** Exactly 10 minutes after the device screen turns off, the CPU enters deep sleep; all active streaming, file uploads, and background network responses stall or fail.
- **Solution:** Add `@SuppressLint("WakelockTimeout")` and acquire without a hard timeout (`wakeLock.acquire()`). Since `ServerService` is a user-controlled foreground service with explicit Start/Stop notification actions, indefinite wake lock during active execution is standard practice.

---

### 1.4 0-Byte Upload Failure & Cache File Leak
- **File:** [`app/src/main/java/com/asdk/media/pouchstream/PouchServer.java`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/java/com/asdk/media/pouchstream/PouchServer.java#L257-L275)
- **Root Cause:**
  1. `if (tempFile.exists() && tempFile.length() > 0)` skips empty files, making it impossible to upload 0-byte files (e.g. `.gitkeep`, blank markdown/text files).
  2. NanoHTTPD saves multipart uploads into temporary cache files. `tempFile.delete()` is never invoked after streaming to DocumentFile output streams.
- **Impact:** Failed uploads for empty files and irreversible disk cache bloating on every upload until manual app data clearing.
- **Solution:** Allow `tempFile.length() >= 0` and always delete `tempFile` in a `finally` block.

---

### 1.5 Offline Hotspot Asset Loading Failure (Online CDN Dependency)
- **File:** [`app/src/main/assets/web/index.html`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/assets/web/index.html#L22-L23)
- **Root Cause:** `index.html` loads Ionicons from `https://unpkg.com/ionicons@7.1.0/...`. Even though [`ionicons.js`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/assets/web/js/ionicons.js) is already bundled in the local assets, the HTML references the external unpkg CDN.
- **Impact:** When a user hosts PouchStream on an offline local Wi-Fi network or an Android portable hotspot without active mobile data, all icons fail to load.
- **Solution:** Point icon script tags to local assets:
  ```html
  <script type="module" src="/js/ionicons.esm.js"></script>
  <script nomodule src="/js/ionicons.js"></script>
  ```

---

### 1.6 Intrusive Native `alert()` on Unhandled JavaScript Errors
- **File:** [`app/src/main/assets/web/js/app.js`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/assets/web/js/app.js#L22-L39)
- **Root Cause:** `window.addEventListener('unhandledrejection')` and `window.addEventListener('error')` display native browser `alert()` dialogs for unhandled events.
- **Impact:** Minor or transient network events trigger blocking modal alerts, freezing the web interface.
- **Solution:** Route errors to console logs and non-blocking toast notifications (`UI.showToast(...)`).

---

### 1.7 Redundant Legacy Web Asset
- **File:** [`app/src/main/assets/web/app.js`](file:///c:/Users/User/AndroidStudioProjects/PouchStream/app/src/main/assets/web/app.js)
- **Root Cause:** An obsolete 23 KB monolithic Bulma-based script remains in the asset root, whereas the active modular app is located in `web/js/app.js`.
- **Solution:** Delete `app/src/main/assets/web/app.js` to eliminate dead code and reduce APK size.

---

## 2. High-Value Feature Additions

### 2.1 QR Code Sharing on Mobile (`MainActivity`) - [x] Completed
- **Description:** Provide a QR code display dialog and quick-action icon in `MainActivity` when the server is running.
- **Implementation:** Added ZXing QR generator dialog accessible from the 3-dot overflow menu with background generation, loading spinner, and lifecycle-safe alerts.
- **Value:** Users can scan the QR code with their phone, tablet, or laptop camera to instantly connect to `http://<ip>:<port>` without typing IP addresses.

### 2.2 ZIP Download for Folders and Multi-Selection (`/api/zip`) - [x] Completed
- **Description:** Implement a streaming ZIP endpoint (`/api/zip?path=...`) in `PouchServer.java` and `dev_server.py`.
- **Implementation:** Added on-the-fly streaming zip output supporting single folder `?path=` and multi-item `?paths=` with RFC 5987 filename sanitization.
- **Value:**
  - Allows downloading entire folders with a single click.
  - Adds "Download as ZIP" to the web portal toolbar for bulk-selected files.

### 2.3 Dedicated Audio / Music Player in Web Portal - [x] Completed
- **Description:** Currently, clicking audio files (`.mp3`, `.wav`, `.flac`, `.ogg`, `.aac`, `.m4a`) triggers a file download.
- **Implementation:** Added docked bottom audio player bar (`audioPlayer.js`) with responsive seek slider, playlist queueing, touch controls, and video player mutual exclusivity.
- **Value:**
  - Bottom-docked audio player with playback controls (play/pause, seek, volume, loop).
  - Next/Previous track navigation for playing an entire album/directory sequentially.

### 2.4 Storage Capacity Meter (Free / Total Space via `StatFs`) - [ ] Skipped / Excluded
- **Description:** Expose storage metrics (`totalBytes`, `freeBytes`, `usedBytes`) via `/api/info` using Android's `StatFs`.
- **Value:**
  - `MainActivity`: Visual storage usage bar showing remaining internal/SD card space.
  - Web Portal: Status bar storage quota indicator showing available upload capacity.

### 2.5 Dynamic IP & Network Connectivity Listener - [x] Completed
- **Description:** Register `ConnectivityManager.NetworkCallback` inside `ServerService` to detect network switches (e.g. Wi-Fi disconnect/reconnect, hotspot toggling, subnet changes).
- **Implementation:** Added `ConnectivityManager.NetworkCallback` registered in `ServerService` with dynamic foreground notification update and URL refresh.
- **Value:** Updates notification text and `MainActivity` URL dynamically without requiring a manual server restart.

### 2.6 Recursive Subdirectory Search - [ ] Skipped / Excluded
- **Description:** Add a search toggle: "Current Folder" vs "All Folders" powered by a `/api/search?q=query` endpoint.
- **Value:** Finds files nested deeply within complex directory hierarchies.

### 2.7 In-Browser PDF & Document Preview - [x] Completed
- **Description:** Provide an inline document modal for `.pdf` files instead of forcing a direct download.
- **Implementation:** Added inline `#contentPdfView` modal viewer (`pdfViewer.js`) with embedded iframe, fit-to-view options, and full fallback actions.
- **Value:** Quick document inspection directly within the web workspace.

### 2.8 Drag-and-Drop Directory Upload (Webkit Directory Support) - [x] Completed
- **Description:** Allow users to drag-and-drop entire folders from desktop file managers onto the browser window.
- **Implementation:** Leveraged `webkitGetAsEntry()` / `FileSystemDirectoryReader` to traverse nested dropped folder hierarchies and recursively upload to device via `StorageHelper.ensureDirectory()`.
- **Value:** Recreates nested directory structures on the Android device automatically.

---

## 3. Performance & Architectural Improvements

| Area | Current State | Proposed Improvement |
| :--- | :--- | :--- |
| **`dev_server.py` Parity** | Lacks Basic Auth verification, read-only mode enforcement, and ZIP streaming | Implement full feature parity in `dev_server.py` so desktop development exactly mirrors the Android runtime. |
| **Monaco Editor Fallback** | Monaco Editor waits on CDN loader and fails when offline | Pre-check network availability and immediately present the fallback text editor without blocking UI. |
| **Storage Access Framework (SAF) Performance** | Iterative `DocumentFile.findFile()` can be slow on large directories | Implement an in-memory LRU path-to-DocumentFile cache to minimize ContentProvider IPC latency. |
| **Theme Customization in Web Portal** | Portal is permanently set to dark theme (`data-bs-theme="dark"`) | Add a theme switcher (Dark, OLED Black, Light) persisted in `localStorage`. |

---

## 4. Suggested Implementation Roadmap

1. **Phase 1: Stability & Bugfixes**
   - Fix `AutoCloseInputStream` descriptor leak in `PouchServer.java`.
   - Fix suffix byte range calculation in `PouchServer.java` and `dev_server.py`.
   - Fix WakeLock timeout in `ServerService.java`.
   - Fix 0-byte upload and delete temp files in `PouchServer.java`.
   - Point Ionicons to local bundled assets in `index.html`.
   - Delete obsolete `app/src/main/assets/web/app.js`.

2. **Phase 2: Core Enhancements**
   - Add streaming ZIP download endpoint (`/api/zip`) and UI buttons.
   - Add QR code sharing in `MainActivity`.
   - Add Storage capacity meter (`StatFs`) to `MainActivity` and web portal.

3. **Phase 3: Media & Web UX**
   - Add integrated audio player bar in web portal.
   - Add PDF preview support.
   - Add recursive search endpoint and UI toggle.
   - Add drag-and-drop folder upload support.
