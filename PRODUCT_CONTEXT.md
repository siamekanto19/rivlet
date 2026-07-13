# Rivlet — Product Context

> Read this first. It's the single orientation document for the project: what
> it is, how it's built, the contract that anchors everything, and what is /
> isn't done yet. Written for both humans and AI assistants picking up the work.

---

## 1. What this is

**Rivlet** is a Windows **download manager and download accelerator**, built as
a modern, premium alternative to Internet Download Manager (IDM). It's a native
desktop app via **Wails** (Go backend + Vue frontend). It manages HTTP
downloads, browser-captured downloads, videos, and torrents: queueing,
pausing/resuming, segmented multi-connection acceleration, categories, speed
limits, per-queue scheduling, and browser/clipboard capture.

> **Naming history:** the project started as `rivlet`, was briefly "Rivlet",
> and is now **Rivlet**. Some internal identifiers still read `rivlet`/`rivlet`
> (localStorage keys like `rivlet-theme`, the Go module `rivlet`, a few asset
> names) — that's expected; the user-facing product is Rivlet.

**Positioning (business):** sold as a one-time-purchase (perpetual license)
accelerator — *not* marketed as a YouTube/video downloader — to keep the widest
legal sales/marketplace reach. See the monetization plan discussed separately;
the landing page lives in `scratchpad/rivlet-landing.html`.

**Design intent:** dense, information-first, and utilitarian, but *premium* —
built to feel like a native **Windows 11 (Fluent Design)** application, not a
generic template. The data table is the centerpiece; compact but not cramped.
The Fluent foundation lives in `frontend/src/style.css`: layered neutral
materials (Mica base → white surface → subtle inset), the **Windows system
accent** (read live from the registry and adapted per theme), a Segoe UI
Variable type ramp, Fluent elevation + motion tokens, and native control
detailing. Motion is subtle and purposeful. Light theme by default; the dark
theme is a native warm dark-gray **Mica** (deliberately *not* true-black).

---

## 2. Current status (important)

| Area | Status |
|------|--------|
| **Frontend (Vue 3 UI)** | ✅ Complete |
| **Contract / service interface** | ✅ Defined (`frontend/src/types/index.ts`) |
| **Backend (Go engine, real downloads, persistence)** | ✅ Built and working |
| **Wails shell + packaging** | ✅ Builds to `Rivlet.exe` + NSIS installer |
| **Browser integration** | ✅ Extension + native-messaging host (manual/guided install) |
| **Code signing / store publishing / marketing** | ❌ Not done (pre-launch) |

The app is a working end-to-end product: `wails build` produces
`build/bin/Rivlet.exe`, `build/bin/Rivlet-amd64-installer.exe`, and the
native-messaging host `build/bin/rivlet-native-host.exe`. The frontend can
still run standalone in a browser on the **mock service** for fast UI iteration.

### Known gaps / not fully wired (as of the last audit)
- **Settings that are stored but not enforced:** `clipboardMonitoring`,
  `preferredVideoQuality`, `preferredVideoContainer` (surfaced in UI, not yet
  consumed by the engine).
- **Segmentation** is over-segmented **work-stealing**, not true IDM-style
  "split the largest unfinished range on idle"; no concurrency back-off on HTTP 429.
- **Auth** implements Basic + Bearer only (not Digest/NTLM/Negotiate).
- **Signed updater** exists but is dormant unless build-time env vars are set.
- The global time-window **scheduler** backend exists but its UI was removed;
  per-queue scheduling is the supported path (weekday editor UI still missing).
- No code-signing cert yet → SmartScreen warnings on first installs.

---

## 3. Stack & conventions

**Frontend**
- **Vue 3 + TypeScript**, single-file components, `<script setup>`.
- **Pinia** — two stores: `stores/downloads.ts` (domain state) and `stores/ui.ts`
  (window mode, theme, accent, personalization).
- **Plain CSS** with CSS variables for theming. **No** Tailwind / component-token
  libraries — they pull toward an airy look we don't want.
- **Hugeicons** wrapped by `components/Icon.vue` so call sites use semantic names.
- The UI talks only to a **service interface**, never to Wails directly (window
  controls are the one shell exception, isolated in `services/window.ts` and
  guarded for browser fallback).

**Backend (Go)**
- Engine + API in `backend/` (`manager.go`, `model.go`, `storage.go`, `video.go`,
  `torrent.go`, `diagnostics.go`, `updater/`, plus `*_windows.go` platform files).
- **SQLite** persistence (WAL, transactions, migrations, corruption recovery).
- **Torrents:** `github.com/anacrolix/torrent` (magnet + `.torrent`).
- **Video:** external `yt-dlp` (probe/download) + `ffmpeg` (merge); resolved via
  `findTool` (env var → managed `%APPDATA%/Rivlet/binaries` → exe dir → PATH),
  with an on-demand yt-dlp installer.
- **Tray:** `github.com/energye/systray`. **Notifications:** `go-toast`.
- **Windows accent:** read from `HKCU\...\Explorer\Accent\AccentPalette`.
- **Native messaging host** (`rivlet-native-host.exe`) bridges the browser
  extension to the app over a local pipe + secret.

---

## 4. The contract (the anchor)

Everything the UI does goes through the `DownloadService` interface in
[`frontend/src/types/index.ts`](frontend/src/types/index.ts). Two
implementations of the same interface:
- **`WailsDownloadService`** — the live impl, backed by the Go engine.
- **`MockDownloadService`** — in-memory state + a fake progress ticker, used for
  browser/dev iteration. The exported `downloadService` singleton picks the Wails
  impl when the runtime is present, else the mock.

Core domain types: `Download`, `DownloadState` (`queued | connecting | active |
paused | completed | error | canceled`), `DownloadKind` (`http | video |
torrent`), `SegmentProgress`, `VideoInfo` / `VideoFormat`, `TorrentInfo`,
`Category`, `Queue`, `HostRule`, `Schedule`, `Settings`. The `Download`/`Settings`
models carry the full engine surface: SHA-256, ETag/Last-Modified, HTTP/DNS/TLS/
TTFB metrics, queues/priority, auth (scheme/username/credential target),
processing stage, proxy, host rules, etc. (see `backend/model.go`).

---

## 5. UI surfaces & window modes

The app is a **single frameless window** that resizes between three **modes**
(driven by `stores/ui.ts` + `services/window.ts`):
- **full** — the normal app (table + toolbar + sidebar + status bar).
- **mini** — a small, draggable floating progress widget (`MiniPlayer.vue`) with
  resume/pause/cancel-all transport; the close button shrinks to this when
  downloads are active, otherwise the app hides to the **system tray**.
- **capture** — a compact popup (`CaptureWindow.vue`) for a single browser grab
  (filename / category / save-to / video quality), which then drops to mini.

Windows notifications fire on download complete/fail (gated by `notifyOnComplete`).

---

## 6. Component map

```
frontend/src/
  types/index.ts                  # THE CONTRACT
  services/
    WailsDownloadService.ts        # live impl (Go engine)
    MockDownloadService.ts         # mock impl + ticker; exports downloadService singleton
    fixtures.ts                    # seed downloads/categories/settings for the mock
    window.ts                      # window controls + mode transitions (full/mini/capture) + native theme
    folderPicker.ts, videoTools.ts, integration.ts   # folder dialog, yt-dlp/ffmpeg health+install, browser setup bridge
  stores/
    downloads.ts                   # domain state, selectors, status totals, actions
    ui.ts                          # window mode, view routing, theme, adaptive accent, personalization prefs
  utils/  format.ts, color.ts, fileType.ts
  components/
    AppShell.vue                   # layout + dialog/route orchestration; renders SettingsPage when view==='settings'
    TitleBar.vue                   # frameless title bar (window controls; brand mark is CSS-only)
    Toolbar.vue                    # add/resume/pause/delete/start-all/pause-all/settings (Capture button removed)
    DownloadTable.vue              # centerpiece: sortable columns, multi-select, drag-reorder, per-state styling, normal/striped table
    CategorySidebar.vue            # All / Unfinished / Finished + category filters
    StatusBar.vue                  # total speed, counts, global speed-limit menu
    ProgressBar.vue / StatusBadge.vue / Icon.vue
    MiniPlayer.vue                 # floating mini progress widget (mode: mini)
    CaptureWindow.vue              # compact browser-grab popup (mode: capture)
    BrowserConnect.vue             # guided "connect your browser" extension-setup dialog
    RowContextMenu.vue             # right-click actions incl. move-to-queue
    SettingsPage.vue               # full settings PAGE (not a modal) — see §7
    dialogs/
      Modal.vue, AddUrlDialog.vue, VideoFormatDialog.vue,
      PropertiesDialog.vue, RemoveConfirmDialog.vue
```

Go / Wails shell: `main.go` (frameless, `HideWindowOnClose`, tray icon,
`OnBeforeClose`), `app.go` (startup: manager, capture listener, native-host
registration, systray), `notify.go`, `accent*.go`, `integration*.go`,
`nativehost*.go`, and `backend/` (the engine — see §3).

---

## 7. Settings (full page, not a dialog)

`SettingsPage.vue` is a full page (mica nav rail + white content card) reached via
the toolbar; it has a settings **search**, **Reset this page**, and **Restore all
defaults**. Tabs:

**General · Appearance · Personalization · Downloads · Connection · Browser
Integration · File Types · Categories · Notifications · Advanced**

- **Appearance** — theme: Light / Dark / System.
- **Personalization** — applied live and persisted to `localStorage`
  (`rivlet-*`): **Table style** (Normal / Striped — striped adds zebra rows +
  grid lines), **Row density** (Compact / Comfortable / Spacious → `--row-h`),
  **Text size** (Small / Default / Large), **Colorful file-type icons** (on/off),
  **Follow Windows accent color** (on/off), **Reduce animations** (on/off).
- **Advanced** — houses the **Download Queues** manager (create, priority,
  concurrency, per-queue speed limit, completion action, per-queue schedule),
  temporary-files folder, and the redacted **diagnostics export**.

> The old standalone **Schedule** tab was removed; the global scheduler backend
> remains but is unused from the UI. Queues moved into Advanced.

---

## 8. State & theming notes

- The **downloads store** wraps the service, subscribes to its events on `init()`,
  and exposes `visibleDownloads` (category filter + search + sort or manual drag
  order), selection helpers, and status totals.
- **Sorting vs manual order:** column header sorts; drag-reorder sets manual order.
- **Selection:** single / ctrl-toggle / shift-range, like a native file list.
- **Theme** (`ui.ts`): `data-theme` on `<html>`, persisted to `localStorage`
  (`rivlet-theme`); resolves `system` via `prefers-color-scheme`.
- **Adaptive accent:** on boot the UI reads the Windows system accent
  (`App.GetSystemAccent`) and paints the accent CSS-var ramp; the *Follow Windows
  accent color* toggle can disable this to use Rivlet's built-in accent.

---

## 9. Running & building

Frontend only (browser, mock data, HMR):
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run build          # vue-tsc type-check + production build
```

Full desktop app (requires Go + the Wails CLI):
```bash
wails dev              # live desktop app
wails build            # -> build/bin/Rivlet.exe (+ installer, + native host)
```

Browser integration (extension + native host) is built by
`scripts/build-integration.ps1`; the installer bundles the extension under an
`integration/` folder and registers native messaging for Chrome/Edge.

Note: in a plain browser, Wails runtime APIs are absent — window controls no-op,
the drag region is inert, and the app runs on the mock service.
