# Grabify audit implementation status

This ledger maps every actionable recommendation in `GRABIFY_PRODUCT_AUDIT.md` to shipped evidence. A checked item must be implemented and verified; roadmap wording alone does not qualify.

## Downloads experience

- [x] Filter-aware empty states with primary actions
- [ ] Optional resizable details inspector with Overview, Connections, Request, and Activity views
- [ ] Error categories, plain-language explanations, technical details, copy, and retry actions
- [ ] Column visibility, reorder, resize, persisted sorting and density
- [x] Ctrl/Shift selection and core batch actions
- [ ] Batch move and categorize

## Add and browser flows

- [x] Explicit single and batch URL entry with multiline validation
- [ ] Metadata probe, duplicate detection, per-row filenames, drag/drop URLs and files
- [x] Three-stage browser onboarding and browser choice
- [ ] Visual install guide, live extension detection, diagnostic test and test download
- [ ] Store-published extension release path

## Settings and runtime enforcement

- [ ] Consolidated five-section navigation, search, page reset, restore defaults and immediate saves
- [ ] Runtime enforcement or explicit unavailable treatment for every exposed setting (notifications, completion dialog/removal/actions, capture rules and video synchronization now enforced)
- [ ] Companion-required labels and live native host/extension/yt-dlp/ffmpeg/updater health

## Engine and persistence

- [x] HEAD validation and ranged-GET fallback
- [x] Content-Range validation and safe single-connection fallback
- [x] ETag, Last-Modified, If-Range and changed-file detection
- [x] Final byte verification and HTTP 416 explanation
- [x] Optional SHA-256 input, verification, persisted result and mismatch handling
- [x] Categorized retries, Retry-After, exponential backoff with jitter and persisted attempt history
- [x] Dynamic segment work queue and adaptive concurrency
- [x] Host profiles, DNS/TLS/TTFB and reuse metrics, HTTP protocol awareness and host exceptions
- [x] SQLite, WAL, transactions, migrations, segment/retry/idempotency/tool/host tables and legacy import
- [x] Online backup, corruption quarantine/recovery and migration fixtures

## Queues, video and power features

- [ ] Multiple queues, priorities, drag/move, concurrency, recurrence, weekdays and completion actions (core/UI implemented; weekday editor and drag target remain)
- [ ] Queue bandwidth profiles, failure ordering and synchronization queues (bandwidth implemented)
- [x] Detailed video format facts, presets, compatibility, size and processing stages
- [x] Video tool versions, signed updater integration, rollback, health and diagnostics
- [ ] Proxy and HTTP authentication strategy
- [ ] Quotas, Defender integration, ZIP preview, CLI, import/export, credentials and Site Grabber

## Accessibility, release and testing

- [ ] Responsive scaling, text scaling, high contrast, focus, accessible names, keyboard navigation and Narrator verification (responsive layouts, forced-colors, increased contrast, reduced motion, focus rings and icon labels implemented; installed Narrator/scale verification remains)
- [x] Redacted structured logs and diagnostics export
- [ ] Redirect/auth/range/throttle/size/crash/network/path/disk/tool rollback test matrix
- [ ] Component and installed Chrome/Edge end-to-end automation, crash stress, history scale and benchmarks
- [ ] Signed updater, application, installer, rollback, automatic updates and release verification
