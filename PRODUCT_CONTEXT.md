# IDM-next — Product Context

> Read this first. It's the single orientation document for the project: what
> it is, how it's built, the contract that anchors everything, and what is /
> isn't done yet. Written for both humans and AI assistants picking up the work.

---

## 1. What this is

A desktop **download manager**, built as a modern alternative to Internet
Download Manager (IDM). Native desktop app via **Wails** (Go backend + web
frontend). It manages HTTP downloads, video grabs, and torrents: queueing,
pausing/resuming, segmented multi-connection downloads, categories, speed
limits, scheduling, and browser/clipboard capture.

**Design intent:** dense, information-first, utilitarian — "would this look at
home next to IDM's download list?" A data table is the centerpiece. Compact but
not cramped, native-feeling, no gratuitous animation (only progress animates).
Light theme by default with a full dark theme.

---

## 2. Current status (important)

| Area | Status |
|------|--------|
| **Frontend (Vue 3 UI)** | ✅ Complete, running entirely on **mock data** |
| **Contract / service interface** | ✅ Defined and frozen (`frontend/src/types/index.ts`) |
| **Backend (Go engine, real downloads, API)** | ⏳ **Not started** — deliberately deferred |
| **Wails shell** | ✅ Exists (frameless window, custom title bar wired) |

The frontend was built first, on purpose: it **defines and implements the full
contract** the backend must later fulfill. Every command the UI can issue and
every field/event it renders already exists in `DownloadService`. When the
backend starts, it implements that same interface — nothing to renegotiate.

**Rule when working here:** do not build backend engine/networking logic yet
unless explicitly asked. The immediate surface is the frontend + the contract.

---

## 3. Stack & conventions

- **Vue 3 + TypeScript**, single-file components, `<script setup>`.
- **Pinia** — single source of truth for UI state (`frontend/src/stores/downloads.ts`).
- **Plain CSS** with CSS variables for theming. **No** component/design-token
  libraries (shadcn, Tailwind, etc.) — they pull toward an airy look we don't want.
- **Hugeicons** (`@hugeicons/vue` + `@hugeicons/core-free-icons`) for iconography,
  wrapped by `frontend/src/components/Icon.vue` so call sites use semantic names.
- Runs inside **Wails**, but the UI talks only to a **service interface**, never
  to Wails directly (window controls are the one shell-level exception, isolated
  in `frontend/src/services/window.ts` and guarded for browser fallback).
- `tsconfig.json` uses `moduleResolution: "Bundler"` (required by package exports).

---

## 4. The contract (the anchor)

Everything the UI does goes through the `DownloadService` interface in
[`frontend/src/types/index.ts`](frontend/src/types/index.ts). Treat it as
**frozen** — changing it means changing both sides of the eventual UI/backend
boundary.

- **Domain types:** `Download`, `DownloadState` (`queued | connecting | active |
  paused | completed | error | canceled`), `DownloadKind` (`http | video |
  torrent`), `SegmentProgress`, `VideoInfo` / `VideoFormat`, `TorrentInfo`,
  `Category`, `Settings`.
- **Commands (UI → service):** `listDownloads`, `getSettings`, `add`, `pause`,
  `resume`, `pauseAll`, `resumeAll`, `cancel`, `remove`, `retry`, `reorder`,
  `setGlobalSpeedLimit`, `setDownloadSpeedLimit`, `probeVideo`,
  `selectVideoFormat`, `addTorrent`, `openFile`, `openFolder`, `copyUrl`,
  `updateSettings`.
- **Events (service → UI):** `onProgress` (batched ~250 ms), `onStateChange`,
  `onAdded`, `onCapturePrompt`.

Two implementations of the same interface:
- **`MockDownloadService`** (today) — in-memory state + a fake progress ticker.
- **`WailsDownloadService`** (future) — same signatures, backed by the Go engine.
  Swapping is a one-line change in `frontend/src/services/MockDownloadService.ts`
  (the exported `downloadService` singleton).

---

## 5. Mock layer (how it comes alive with no backend)

- **Fixtures** (`frontend/src/services/fixtures.ts`) — a spread of `Download`
  rows covering *every* state and all three kinds, plus edge cases: `sizeBytes:
  null` (unknown size), `supportsResume: false`, an errored row, a multi-segment
  active row, a video row with formats, a torrent row with peers.
- **Ticker** — inside `MockDownloadService`, a 250 ms interval advances active
  rows (bytes, %, speed, ETA, segments), transitions `connecting → active →
  completed`, and fires `onProgress` / `onStateChange`.
- **Dev capture trigger** — `MockDownloadService.triggerCapture()` (not part of
  the contract) fires `onCapturePrompt` so the capture flow is testable; wired to
  the toolbar "Capture" button.

---

## 6. Component map

```
frontend/src/
  types/index.ts                 # THE CONTRACT (frozen)
  services/
    MockDownloadService.ts        # mock impl of DownloadService + ticker + `downloadService` singleton
    fixtures.ts                   # seed downloads, default categories & settings
    window.ts                     # Wails window controls (min/max/close) w/ browser fallback
  stores/downloads.ts             # Pinia store: state, filtered/sorted selectors, status totals, actions
  utils/format.ts                 # formatBytes / formatSpeed / formatEta / formatDate / parseSpeedToBps
  components/
    AppShell.vue                  # layout: title bar + toolbar + sub-bar + sidebar + table + status bar; dialog orchestration
    TitleBar.vue                  # custom frameless title bar (brand + window controls)
    Toolbar.vue                   # labeled icon+text actions; selection-driven enable/disable
    DownloadTable.vue             # centerpiece: sortable columns, multi-select, drag-reorder, per-state styling
    CategorySidebar.vue           # All / Unfinished / Finished + category filters with counts
    StatusBar.vue                 # total speed, active/queued/complete counts, global speed-limit menu
    ProgressBar.vue               # segmented + indeterminate + single-bar progress, colored per state
    StatusBadge.vue               # per-state status label + dot
    Icon.vue                      # Hugeicons wrapper (semantic name -> icon)
    dialogs/
      Modal.vue                   # shared dialog shell (overlay, title bar, footer slot, ESC)
      AddUrlDialog.vue            # url/filename/category/destination; auto-detects kind; clipboard prefill
      VideoFormatDialog.vue       # format picker fed by probeVideo; resolution/size/A-V badges
      PropertiesDialog.vue        # per-download detail: segments, resume support, per-download speed limit
      SettingsDialog.vue          # tabbed: General / Downloads / Categories / Schedule / Notifications
      RemoveConfirmDialog.vue     # remove (+ optional delete-from-disk) confirmation
      CapturePrompt.vue           # "download this?" popup driven by onCapturePrompt
```

Go / Wails shell (frontend-milestone: leave alone unless asked):
`main.go` (Wails options — window is `Frameless: true`), `app.go`,
`frontend/wailsjs/` (generated bindings + runtime).

---

## 7. State model notes

- The **store** wraps the service, subscribes to all four events on `init()`,
  and exposes selectors: `visibleDownloads` (category filter + search + sort or
  manual drag order), `selectedDownloads`, status-bar totals, per-category counts,
  and selection-driven `canPause` / `canResume`.
- **Sorting vs manual order:** clicking a column header sorts; drag-reordering a
  row sets `manualOrder = true` (suspends column sort) and calls `reorder()`.
- **Selection:** single / ctrl-toggle / shift-range, mirrors a native file list.
- **Theme:** `data-theme="dark"` on `<html>`, toggled from the toolbar, persisted
  to `localStorage` (`idm-theme`).

---

## 8. Running it

Frontend only (browser, mock data, HMR):
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check (vue-tsc) + production build to dist/
```

Full desktop app (requires Go + the Wails CLI):
```bash
wails dev              # from repo root — live desktop app
wails build            # packaged binary
```

Note: in the browser, Wails runtime APIs are absent — window controls no-op and
the drag region is inert by design; the app is otherwise fully functional on the
mock service.

---

## 9. When the backend arrives

1. Implement `DownloadService` in Go-backed TS as `WailsDownloadService` with the
   **identical** signatures, translating events to Wails events (`onProgress`
   stays batched ~250 ms).
2. Swap the `downloadService` singleton export to the real impl.
3. The UI should require **no further changes** — every field and event is
   already exercised by the mock. If the backend needs something the UI doesn't
   name, or the UI needs something the contract doesn't have, update
   `types/index.ts` on **both** sides deliberately.

The original frontend requirements live in `prd-front.md` (on the author's
desktop, not in-repo) — this document supersedes it for day-to-day orientation.
