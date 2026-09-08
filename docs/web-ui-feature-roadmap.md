# PouchStream — Web UI: Feature Additions, Improvements & Bugfixes

> Scope: browser portal only (`app/src/main/assets/web/` — `index.html`, `portal.css`,
> `js/app.js`, `api.js`, `state.js`, `ui.js`, `player.js`, `audioPlayer.js`, `imageViewer.js`,
> `pdfViewer.js`, `editor.js`).
> Android-native ideas live in `android-app-feature-roadmap.md`.
> Audited web bugs (CDN Ionicons offline failure, `alert()` on errors, dead `app.js` asset,
> suffix-range handling) live in `improvements-and-bugfixes.md` — not repeated here.

Portal context: user opens `http://<phone-ip>:<port>` on a desktop browser to browse files and
**watch movies stored on the phone**. Desktop, wide-screen, keyboard+mouse, VLC-installed is the
primary persona. Every section below is ordered by "movie night impact".

---

## 1. At-a-Glance Roadmap

| Priority | Theme | Items |
|----------|-------|-------|
| **W1 — Video player: finish the cinema** | Subtitles, resume, binge, codecs | W1.1–W1.8 |
| **W2 — File browsing that scales** | Grid, thumbs, search, sort, preview | W2.1–W2.8 |
| **W3 — Transfers that don't fail** | Upload/download reliability | W3.1–W3.6 |
| **W4 — Look, feel & access** | Theme, mobile, PWA, a11y, i18n | W4.1–W4.7 |

Effort key: `S` = <1 day, `M` = 2–4 days, `L` = 1+ week. Dependencies on new Android endpoints
are marked with `⇐ Android`.

---

## 2. W1 — Video Player: Finish the Cinema

Current `player.js`: single `<video>` modal with basic play. Missing everything movie-watchers expect.

### W1.1 Subtitle Picker + Offset Sync + Upload (M ⇐ Android B2)
- **What:** subtitle button in player toolbar → dropdown listing sidecars from
  `/api/subtitles?path=` (`movie.en.srt`, `movie.hi.vtt`…) as `<track>` entries + "Upload .srt/.vtt"
  (saves next to video via existing upload API) + offset stepper (±0.5s, ±5s) persisted per-video
  in `localStorage` (`pouchstream:subOffset:<path>`).
- **Why:** #1 feature request for any movie server; unblocks non-English households.
- **Notes:** convert SRT→VTT client-side if server converter isn't ready (strip index/timestamps
  reformat — 30 lines). Default-pick `movie.<browser-lang>.srt` when present.

### W1.2 Continue Watching / Resume Position (S)
- **What:** save `currentTime/duration` every 5s to `localStorage` (`pouchstream:progress:<path>`),
  show progress bar under each video row + "Resume from 42:17 / Restart" dialog on open.
  "Continue Watching" shelf on top of All-Files when entries exist, with Remove + Clear-all.
- **Why:** movies are long; phones sleep; Wi-Fi drops. Resume is table stakes (Netflix/YouTube/Plex all do it).

### W1.3 Autoplay Next + Mini Playlist Queue (S–M)
- **What:** "Up Next" toast with 10s countdown at `ended` (next video alphabetically in folder,
  or next in filtered Videos category). Player gets Prev/Next buttons + collapsible queue panel
  (drag to reorder, click to jump — reuse `AudioPlayer` queue patterns).
- **Why:** series binging (`S01E01 → E02`) is the core loop.

### W1.4 Playback Speed, Skip Buttons, Theater Mode (S)
- **What:** speed menu (0.5×–2×), ±10s buttons, `J/L/K` + arrows + `F` fullscreen + `M` mute,
  theater-mode toggle (dims sidebar, expands video to full workspace width), remember speed per session.
- **Why:** cheap, expected, zero backend work.

### W1.5 Picture-in-Picture + Background Audio (S)
- **What:** PiP button (`requestPictureInPicture()` with graceful fallback), "Play audio only"
  toggle that closes video element but keeps audio (pairs with docked `audioPlayer.js`).
- **Why:** multitask while watching; PiP is one API call.

### W1.6 Codec-Smart "Can't Play? Open in VLC" (S ⇐ Android B4)
- **What:** use `video.canPlayType()` + server `playHint` to show inline banner for risky files
  (HEVC MKV, DTS audio): "Chrome can't play this — [Open in VLC] [Download] [Try anyway]".
  `vlc://` / `intent://` deep link + copy-stream-URL button.
- **Why:** stops "PouchStream is broken" misreports when it's a browser codec gap.

### W1.7 Seek-Thumbnails + Buffered-Range Bar (M ⇐ Android B3)
- **What:** hover scrubber shows thumbnail strip (from `/api/thumb?time=` or client-side
  `preload="metadata"` sprites for MP4), plus YouTube-style gray buffered bar
  (`video.buffered` rendering) so users see stall vs. gap.
- **Why:** seeking a 3 GB movie over Wi-Fi without visual feedback feels broken.

### W1.8 Watch-Together / Remote (Stretch, L)
- **What:** "Share timestamp" button copies link with `?t=2532` that auto-seeks on open;
  optional lightweight "host presses pause → guest pauses" via polling `/api/poll` position
  broadcast (no new infra). Full chat/rooms explicitly out of scope.
- **Why:** viral "watch with hostel roommate" moment with minimal cost.

**Player bugfixes to fold in:**
- `mutual exclusivity` today stops audio when video opens but not vice-versa — make it symmetric.
- `popstate` handler closes editor/player/image/pdf but forgets `AudioPlayer` visualizer edge cases — unify into `closeAllOverlays()`.
- iOS Safari: `playsinline` + no-autoplay audit (Safari blocks unmuted autoplay; show explicit play CTA).

---

## 3. W2 — File Browsing That Scales (100+ movie folders)

### W2.1 Grid/List Toggle + Video Thumbnails (M ⇐ Android B3)
- Poster cards (thumb, name, duration/size badge, progress bar from W1.2, `hasSubtitles` dot)
  with persisted view pref per-category (`localStorage`). List view stays default for documents.
- Skeleton shimmer while thumbs load; `loading="lazy"` + `IntersectionObserver` so 500-file
  folders don't fire 500 requests.

### W2.2 Recursive Search + Filter Bar (M ⇐ Android C7)
- Search box with scope toggle [Current folder | All folders], debounce 300ms, result rows show
  breadcrumb path + Jump-to. `Esc` clears. Show `truncated` warning when server caps results.
- Client-side quick-filter (already possible) stays for instant typing; server search only on Enter.

### W2.3 Sort That Sticks (S)
- Name / Size / Modified / Type, asc/desc, folder-first toggle. Persist per-path in `localStorage`.
  Table headers already have `setupTableSorting()` — extend to cards + add "Sort" dropdown for touch.

### W2.4 Breadcrumb Overflow + History (S)
- Long paths (`Movies/Bollywood/2024/...`) collapse middle segments into `…` dropdown.
  Back/Forward already uses `popstate` — add in-portal Back/Up buttons + `Alt+↑` (Up one level).

### W2.5 File Details Pane (S–M)
- Right-click → Properties (or `Alt+Enter`): size, modified, MIME, path, `hasSubtitles`,
  storage path, stream URL + copy, QR for single file (reuse Android QR idea client-side via
  tiny `qrcode` lib or server-rendered PNG).
- Multi-select shows aggregate ("12 items • 4.2 GB").

### W2.6 Gallery / Slideshow for Photos (S)
- `imageViewer.js` exists — add: arrow-key navigation across folder images, slideshow timer
  (3s/5s/Off), fullscreen, zoom-to-fit/fill, EXIF date caption, download-current button.
- Filmstrip thumbnails below main image (reuse W2.1 thumb infra).

### W2.7 Real Preview for Text/Markdown + Code (S–M)
- `.md` renders formatted (marked.js is 30 KB, bundle locally — no CDN per offline rule) with
  Raw/Edit toggle. `.csv` gets sortable table preview (first 500 rows). Large files (>2 MB)
  show "Preview first 200 KB" with Download-full CTA instead of freezing Monaco.
- Monaco: bundle offline OR instant fallback to plain `<textarea>` when `loader.min.js` fails
  (ties to audited Monaco-offline issue).

### W2.8 Bulk Ops That Feel Safe (S–M ⇐ Android C1/C2)
- Toolbar: Download ZIP (exists), plus Move/Copy dialog (destination picker), Rename inline
  (double-click name), Duplicate, Delete → "Moved to trash — Undo (10s)" toast instead of
  confirm-modal fatigue. Conflict dialog: Overwrite / Keep both / Skip with "apply to all".
- Cut/Copy/Paste with `Ctrl+X/C/V` + visible clipboard bar ("3 items cut — paste where? [Cancel]").

---

## 4. W3 — Transfers That Don't Fail (4 GB over hostel Wi-Fi)

### W3.1 Upload Queue Panel with Progress + Retry (M)
- Bottom-right queue (like Drive/Dropbox): per-file progress bar, speed, ETA, pause/cancel/retry,
  "3 failed — Retry all". Keep existing drag-drop + folder-drop; add "Add folder…" button for
  browsers without folder-drag. Persist queue across navigation (not across reload — document it).

### W3.2 Chunked / Resumable Uploads (M–L ⇐ Android B5)
- Split >50 MB files into 8 MB chunks (`Blob.slice`), upload via `/api/upload-chunk`, server
  reassembles. Survives Wi-Fi blip without restarting a 4 GB movie. Show "Resume" after reload
  via `localStorage` chunk manifest (stretch — v1 can be session-only).

### W3.3 Folder Upload That Preserves Tree (exists — harden) (S)
- `webkitGetAsEntry` traversal exists; add: skip `node_modules/.git/Thumbs.db` toggle,
  empty-folder creation, name-collision handling per W2.8, and a pre-upload manifest
  ("127 files • 2.1 GB — Proceed?").

### W3.4 One-Click "Download Folder as ZIP" Everywhere (S, exists — expose)
- ZIP endpoint exists; ensure button appears on: toolbar (multi-select), context menu (single
  folder), breadcrumb (current folder). Show size estimate + "Large folder — this may take a while"
  above 1 GB. Poll `/api/task` progress if Android adds it.

### W3.5 Stream-URL Copy + External Players (S)
- Per-video "Copy stream URL" + "Open in VLC / MPV / PotPlayer" buttons with per-OS hint
  (`vlc <url>`, `mpv <url>`). Auth-embedded URL variant when Basic Auth is on
  (with "contains password" warning, mirroring Android A2).

### W3.6 Offline-Download / Save-for-Later (S)
- "Download" already works; add "Download for offline" using Service Worker + Cache API so the
  *portal itself* loads on next visit even if phone IP changed (shows "reconnect" state).
  Do NOT cache media — only shell (HTML/CSS/JS) to stay within storage budget.

**Transfer bugfixes to fold in:**
- 0-byte files can't upload (server fix exists in audit) — web side should allow selecting them
  instead of filtering `size > 0`.
- Canceling a ZIP download leaves server thread running — wire `AbortController` + server task cancel.

---

## 5. W4 — Look, Feel & Access

### W4.1 Light / OLED-Black Theme Switcher (S)
- Portal is hardcoded `data-bs-theme="dark"`. Add topbar toggle (Dark / OLED / Light),
  persisted in `localStorage`, CSS variables only (no duplicate stylesheet). Respect
  `prefers-color-scheme` on first run. Test Monaco + PDF iframe contrast in each theme.

### W4.2 True Mobile Layout (M)
- Portal is desktop-first. Add: bottom toolbar on <768px, swipe-back to parent folder,
  tap-select mode (checkboxes), full-screen player by default, upload from camera/photos
  (`<input capture="environment">`). Sidebar becomes drawer (hamburger already exists — wire it).

### W4.3 PWA Install (S–M)
- `manifest.webmanifest` (served from `/manifest.json` — needs Android static-asset allowlist entry)
  + icons (reuse `favicon.svg`) + Service Worker (shell-cache from W3.6). Result: "Install
  PouchStream" in Chrome/Edge, launcher icon, standalone window, no URL bar.

### W4.4 Keyboard-First Power (S)
- Extend `setupKeyboardNavigation()` + help modal (`?` already exists): `/` focuses search,
  `↑↓←→` move, `Enter` open, `Backspace` up, `Space` preview, `Delete` trash, `F2` rename,
  `Ctrl+A` select all, `1/2` list/grid. Show toasts for each ("Press ? for shortcuts" on 3rd visit).

### W4.5 Accessibility Pass (S)
- Focus trap in modals (video player, PDF, editor), `aria-label`s on icon-only buttons,
  visible focus ring, `prefers-reduced-motion` disables portal animations, 4.5:1 contrast check
  on `portal.css` secondary text, subtitles track gets `kind="subtitles"` + styled cue background.

### W4.6 Offline-First Asset Discipline (S — bugfix with teeth)
- Audit: Ionicons + Google Fonts + Monaco loader are CDN. Rule going forward: **no render-blocking
  CDN**. Bundle Ionicons ESM locally (already in `js/` — just fix the two `<script>` tags),
  self-host Manrope woff2 (or system-font fallback), lazy-load Monaco only when a code file opens.
- Add `<noscript>` + "You're offline from the internet (but connected to phone)" banner that
  distinguishes phone-reachable vs internet-reachable, since hotspot use is core.

### W4.7 i18n + Units (S–M)
- Extract all English strings in `ui.js/app.js` to `js/locale/en.json`; add Hindi + one RTL
  language pilot. Respect `navigator.language` default. File sizes in binary (MiB/GiB) vs decimal
  toggle in Settings page; dates in locale format with UTC tooltip.

---

## 6. Web Settings Page (new surface tying it together)

Today settings live only in Android. Add a web **Settings** view (sidebar gear already exists —
`btnSidebarSettings`) with sections, all `localStorage`-persisted unless marked `⇐ server`:

- **Playback:** autoplay-next, default speed, subtitle offset default, theater-by-default, PiP button.
- **Library:** default view (list/grid), folders-first, show hidden, items-per-page (50/100/All).
- **Transfers:** chunk size, concurrent uploads (1–4), confirm-before-delete, trash-undo duration.
- **Appearance:** theme (W4.1), font size, reduce motion.
- **Server (⇐ server `/api/info`):** storage meter, version, device name, read-only badge, guest-expiry countdown.
- **About:** version, "Open Android logs" hint, keyboard shortcut list, update-check link.

---

## 7. Suggested Build Order (Web UI)

1. **v2.1 — Watchability:** W1.2 (resume) + W1.4 (speed/skip/keys) + W1.1 (subtitles) + W1.6 (VLC fallback).
2. **v2.2 — Browse at scale:** W2.1 (grid+thumbs) + W2.3 (sort) + W2.2 (search) + W2.5 (details).
3. **v2.3 — Transfer trust:** W3.1 (upload queue) + W2.8 (trash+undo) + W4.6 (offline assets).
4. **v2.4 — Polish:** W4.1 (themes) + W4.2 (mobile) + W4.3 (PWA) + Settings page + W1.3 (up-next).

---

## 8. Explicit Non-Goals (web)

- No server-side transcoding UI (no bitrate ladder, no "Convert to MP4" button) — out of scope
  until Android ships it; VLC-fallback covers the gap.
- No multi-user accounts/rooms in the browser — Basic Auth + guest-mode is the ceiling.
- No heavy frontend framework migration (React/Vue) — modular vanilla JS + Bootstrap stays for
  APK-size and offline reasons.
