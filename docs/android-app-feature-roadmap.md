# PouchStream — Android App: Feature Additions, Improvements & Bugfixes

> Scope: native Android app only (`MainActivity`, `SettingsActivity`, `ServerService`,
> `PouchServer`, `StorageHelper`, `NetworkUtils`, notifications, permissions, background behavior).
> Web portal ideas live in `web-ui-feature-roadmap.md`.
> Already-audited stability bugs live in `android-code-review-and-improvements.md` and
> `improvements-and-bugfixes.md` — this doc does **not** re-list them, it proposes what's next.

App context: PouchStream is a remote file manager + media server. User installs the APK on
their phone, picks a folder via SAF, starts the server, then opens `http://<phone-ip>:<port>`
on a PC to browse files and stream movies. All ideas below are judged on one question:
*does this make starting, connecting to, or long-play streaming more reliable?*

---

## 1. At-a-Glance Roadmap

| Priority | Theme | Items |
|----------|-------|-------|
| **P0 — Connect & Stay Connected** | The #1 pain point is "what URL do I type, and does it stay alive" | A1–A6 |
| **P1 — Media Server Core** | Make it a real movie/music server, not just file listing | B1–B8 |
| **P2 — File Manager Power** | Close gap with Solid Explorer / MiX feature set | C1–C7 |
| **P3 — Polish & Trust** | Onboarding, widgets, diagnostics, backup | D1–D8 |

Effort key: `S` = <1 day, `M` = 2–4 days, `L` = 1+ week.

---

## 2. P0 — Connect & Stay Connected (do these first)

### A1. Show ALL Reachable URLs + Smart Best-Pick (M)
- **Problem:** `NetworkUtils.getLocalIpAddress()` returns one IP. On phones with Wi-Fi + hotspot
  + VPN active, it can pick an unroutable `rmnet`/`tun0` address. User types it on PC, nothing loads.
- **Proposal:**
  - Add `NetworkUtils.getAllLocalIpv4Addresses()` that enumerates interfaces, filters loopback /
    cellular (`rmnet`, `ccmni`, `pdp`), VPN (`tun`, `ppp`, `tap`), link-local (`169.254.x.x`),
    and returns labeled list: `Wi-Fi: 192.168.1.5`, `Hotspot: 192.168.43.1`, `Ethernet: ...`.
  - `MainActivity` shows a dropdown/chip list of URLs instead of a single `tvServerUrl`.
  - `ServerService` notification shows the best-pick + count (`192.168.1.5:8080 (+1 more)`).
  - QR dialog gets a selector when >1 address exists.
- **Value:** kills the most common support issue ("page won't open").

### A2. QR v2 — Embed Auth + Auto-Reconnect Hint (S)
- **Current:** QR encodes bare `http://ip:port`.
- **Proposal:** when Basic Auth is on, encode `http://user:pass@ip:port` (with user confirmation
  dialog warning "QR contains password"), plus `COPY LINK` and `Share via...` (Nearby Share /
  WhatsApp) buttons. Add "Regenerate on network change" — QR dialog observes `ServerService`
  URL LiveData instead of freezing the old string.
- **Value:** PC connect drops from ~30s of typing to one scan.

### A3. Auto-Start on Trusted Wi-Fi / Hotspot-On (M)
- **Problem:** autostart-on-boot exists, but daily flow is: come home → open app → press Start.
- **Proposal:**
  - New setting "Auto-start when connected to:" with multi-select of known SSIDs
    (via `WifiManager` / `ConnectivityManager.NetworkCallback` + `WifiInfo.getSSID()` on API <33
    with location permission rationale, or network-transport heuristic on API 33+).
  - Companion: "Stop when Wi-Fi lost" toggle.
  - Hotspot mode: tile/long-press "Start + enable hotspot" single tap (uses `TetheringManager`
    intent to hotspot settings — direct enable isn't allowed for 3rd-party apps, so deep-link it).
- **Value:** true "home media server" behavior.

### A4. Quick Settings Tile + Home Widget + Shortcut (M)
- **Proposal:**
  - `TileService` ("PouchStream") — tap toggles server, tile subtitle shows port/state.
  - 1x1 / 2x1 widget — status dot, URL, Start/Stop button, tap-to-copy.
  - App shortcut (`shortcuts.xml`): long-press launcher → "Start server", "Show QR".
- **Value:** no need to open the full app to start movie night.

### A5. Connected-Clients & Live Transfer Monitor (M)
- **Problem:** today you can't tell if your PC is actually connected, what's streaming, or why
  it's slow.
- **Proposal:**
  - In-memory ring buffer in `PouchServer` (last N requests: IP, method, path, bytes, duration,
    user-agent). Expose via `/api/stats` (for web UI) and a new `ClientsActivity`/bottom-sheet
    in Android: client IP, hostname guess, current file, transfer rate KB/s, total served.
  - "Disconnect client" is out of scope for HTTP (stateless) — instead offer "Block IP for session"
    (`Set<String> blockedIps` checked in `serve()`).
  - Notification: `Serving 2 clients • 8.4 MB/s` updated every 2s (throttled to avoid spam).
- **Value:** diagnostics + "is anyone leeching my hotspot?" peace of mind.

### A6. HTTPS with One-Tap Self-Signed Cert (L)
- **Problem:** Basic Auth over plain HTTP leaks the movie-folder password to anyone on the LAN
  running Wireshark. Browsers also flag `http://` and block Mixed Content if the portal ever
  embeds `https` CDN assets.
- **Proposal:**
  - Settings toggle "Enable HTTPS (self-signed)". On enable, generate RSA keypair + cert via
    `AndroidKeyStore`, run NanoHTTPD with `makeSecure()`.
  - Show cert fingerprint (SHA-256) in MainActivity + web portal banner with "how to trust" steps.
  - Keep HTTP fallback toggle for old TVs/players that reject self-signed certs.
- **Value:** only real fix for password + session privacy on shared Wi-Fi/hostels/offices.

---

## 3. P1 — Media Server Core (become a real movie server)

### B1. Multiple Shared Folders / Library Profiles (L)
- **Problem:** single SAF root only. Users want `Movies`, `Music`, `Downloads` separately, some
  read-only, some hidden.
- **Proposal:**
  - Migrate `KEY_FOLDER_URI` → `shared_folders` JSON set (`uri`, `label`, `readOnlyOverride`,
    `showInLibrary`).
  - `StorageHelper` becomes per-root resolver; `PouchServer` routes `/api/list?root=Movies&path=...`.
  - Web portal gets root switcher dropdown.
  - Backward-compat: migrate existing single folder as "Default".
- **Value:** biggest structural unlock; enables everything below per-library.

### B2. Subtitle Sidecar Discovery Endpoint (M)
- **Problem:** the #1 movie-night complaint: "video plays but no subtitles".
- **Proposal:**
  - New endpoint `/api/subtitles?path=movie.mp4` returning sibling `.srt/.vtt/.ass` matches
    (`movie.srt`, `movie.en.srt`, `subs/movie.srt`). Serve with correct MIME + CORS so the web
    `<track>` element just works. Include in `/api/list` as `hasSubtitles: true` badge.
  - Android-side: no transcoding, just file matching — cheap and high value.
  - Later: `/api/subtitles?path=x&convert=vtt` to convert SRT→VTT on the fly for browser compat.
- **Value:** pairs directly with Web-UI subtitle picker (see web roadmap W1).

### B3. Thumbnail / Poster Endpoint (M)
- **Problem:** file list shows generic icons; browsing 200 movies is painful.
- **Proposal:**
  - `/api/thumb?path=movie.mp4` — strategy in order: (1) sibling `movie.jpg`/`poster.jpg`/`folder.jpg`,
    (2) embedded MP3/M4A artwork via `MediaMetadataRetriever`, (3) video frame at 10% duration
    (`getFrameAtTime`, downscaled to 320px, JPEG q70, disk-cached in `getCacheDir()/thumbs` with LRU
    eviction ~100 MB).
  - Generate off the request path (bounded executor, max 2 threads) so scrolling never blocks streaming.
- **Value:** Netflix-style grid becomes possible in web UI.

### B4. Transcode-Free "Direct Play Advisor" in `/api/info` (S)
- **Problem:** some `.mkv` with HEVC/DTS won't play in Chrome; users blame the app.
- **Proposal:** include per-extension `playHint` in list responses (`direct`, `maybe`, `download-only`)
  based on a static compat table + container probe of extension only (no heavy parsing).
  Web UI shows "Best in VLC" badge for risky files, with one-tap "Open in VLC" (`vlc://` intent /
  download + hint).
- **Value:** sets expectations before they press play.

### B5. Background Uploads & Download-Resumability (M)
- **Proposal:**
  - Advertise `Accept-Ranges: bytes` + `ETag` (lastModified+length hash) on all file responses so
    PC download managers (IDM, aria2) can resume.
  - Support `Content-Range` on PUT/POST? Out of scope — instead document chunked web uploader and
    add server-side append endpoint `/api/upload-chunk` (chunkIndex/total, temp assembly, then
    atomic SAF move).
- **Value:** 4 GB movie uploads over flaky Wi-Fi stop restarting from zero.

### B6. Recycle Bin / Trash Instead of Permanent Delete (M)
- **Problem:** one wrong tap on PC deletes the only copy of a video from the phone.
- **Proposal:** setting "Move deleted files to trash" (default ON). Server moves to
  `<root>/.trash/<timestamp>_<name>` instead of `DocumentFile.delete()`. New Android screen
  "Trash" with Restore / Empty. Auto-purge after 30 days (WorkManager).
- **Value:** safety net; essential once PC-side delete is one click away.

### B7. Bandwidth Limiter + Hotspot Data Guard (S–M)
- **Proposal:** settings "Max concurrent streams" (1/2/4/unlimited) enforced with Semaphore in
  `handleStream()`, plus "Warn if serving over mobile data" (check `TRANSPORT_CELLULAR`).
  Optional per-response throttle (token bucket, e.g. 2 MB/s cap for hotspot data saving).
- **Value:** prevents one 4K stream from killing the phone's hotspot for everyone else.

### B8. DLNA / Chromecast-Assist (L, stretch)
- **Proposal:** lightweight `MediaRouter` + Cast "投" button in Android app that sends the
  phone-hosted HTTP URL to a Chromecast/Fire-TV (`RemoteMediaClient.loadMedia`). No transcoding —
  relies on receiver codec support, same as direct play.
- **Value:** phone → TV without moving files; natural upsell for movie use-case.

---

## 4. P2 — File Manager Power

### C1. SAF Trash, Rename Collision & Conflict Dialog API (M)
- Extend API: `/api/rename`, `/api/move`, `/api/copy`, `/api/delete` (trash-aware),
  `/api/exists` preflight. Return structured `409 Conflict` with `suggestion: "file (1).mp4"`
  so web UI can show "Overwrite / Keep both / Skip" instead of silently duplicating.

### C2. ZIP: Extract + Selective Create (M)
- ZIP download exists; add `/api/unzip?path=archive.zip&dest=...` (zip-slip guarded,
  size-bomb capped e.g. 2 GB / 10k entries) and `/api/zip` already covers create.
- Progress callbacks via `/api/task?id=` polling (reuses A5 stats infra).

### C3. Storage Analyzer (M)
- Android screen + `/api/du` endpoint: top-20 largest files, per-extension breakdown
  (Video 18 GB, Audio 3 GB...), "Clean cache / Clear .thumbnails" one-tap.
- Reuses thumbnail cache + `StatFs` infra already in `MainActivity`.

### C4. Per-Folder Read-Only + Share-Link PIN (S–M)
- Global read-only exists; add per-root override (B1) and time-boxed "Guest mode"
  (read-only + hides dotfiles + disables `/api/delete`, auto-expires after N hours).

### C5. Clipboard / Text-Share Push (S)
- "Send text to PC" — type/paste in Android → `GET /clip` on PC shows it (great for sharing
  a magnet link / URL without WhatsApp). Trivial endpoint, surprisingly loved feature.

### C6. Photo Backup (Auto-Upload from PC POV: `/api/recent-photos`) (L)
- Opt-in "Camera backup" — server exposes `DCIM` as a virtual root; PC portal gets
  "Backup new photos" button that pulls only `lastModified > lastBackup` files.
- True background sync (Android → PC push) is out of scope; pull-model keeps architecture intact.

### C7. Search Index v1 (M)
- Filename-only recursive search endpoint `/api/search?q=&root=` with 2s timeout cap,
  50-result cap, and `truncated: true` flag. Case-insensitive substring first; FTS later.
  Cache last index per root for 60s to keep SAF IPC cost bounded.

---

## 5. P3 — Polish & Trust

### D1. First-Run Onboarding (S)
- 3-page intro: ① Pick folder ② Press Start ③ Scan QR from PC. Plus "Try demo mode"
  (starts `dev_server`-style sample folder so users can test PC flow without exposing real files).
- Permission rationale screens for notifications + battery-optimization, not raw system dialogs.

### D2. Empty / Error States That Teach (S)
- "No folder selected" → big illustration + CTA. "Port in use" → one-tap "Use 8081 instead".
  "No Wi-Fi" → "Start offline hotspot server anyway" (ties to `isConnectedToNetwork` fix in
  existing audit doc).

### D3. Settings Backup / Restore + Export QR (S)
- Export `SharedPreferences` (minus password) to JSON file + import. Include "Share my setup"
  QR for a second phone.

### D4. Log Viewer v2 (S)
- `LogActivity` today is a dump. Add level filter (HTTP/ERR), search box, share-as-file,
  auto-scroll toggle. Wire the A5 stats buffer into a "Requests" tab.

### D5. App Lock (Biometric) (S–M)
- Gate `MainActivity` + `/api/*` write endpoints behind BiometricPrompt when "Lock app" is on.
  Server auto-stops on lock after timeout (5 min) option.

### D6. Power & Thermal Guard (S)
- Optional "Pause serving at 15% battery" + "Stop if device overheats" (`ACTION_BATTERY_CHANGED`
  + `PowerManager.ThermalStatus`). Shows why it stopped in notification, not a silent death.

### D7. Localization + RTL (M)
- All user strings already via `strings.xml` — audit hardcoded toasts, add Hindi/Arabic/Spanish
  community translations, verify RTL layout mirror on `activity_main`.

### D8. Crash Reporting (Opt-In) + Update Checker (S)
- ACRA opt-in (no Firebase dependency, keeps F-Droid eligibility) writing to local file with
  user-approved share. "Check for update" hitting GitHub releases API with changelog dialog.

---

## 6. Suggested Build Order (Android)

1. **v2.1 — Connection confidence:** A1 (all URLs) + A2 (QR v2) + D2 (error states).
2. **v2.2 — Server awareness:** A5 (clients/stats) + D4 (log v2) + B4 (play hints).
3. **v2.3 — Movie essentials:** B2 (subtitles) + B3 (thumbnails) + C1 (rename/move/copy API).
4. **v2.4 — Safety & sharing:** B6 (trash) + C4 (guest mode) + A6 (HTTPS).
5. **v2.5 — Freedom:** A3 (auto-start SSID) + A4 (tile/widget) + B1 (multi-root).

---

## 7. Explicit Non-Goals (to avoid bloat)

- No cloud account, no internet relay, no analytics SDK — local-first is the brand.
- No on-device video transcoding (FFmpeg) — battery/storage cost outweighs benefit while
  direct-play + VLC fallback covers 95%.
- No two-way sync engine — pull-backup (C6) only.
