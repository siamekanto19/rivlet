# Rivlet Product Audit and IDM-Readiness Roadmap

**Audit date:** July 12, 2026  
**Product:** Rivlet for Windows  
**Scope:** Product strategy, interface, user experience, browser companion, download engine, video pipeline, persistence, settings, reliability, accessibility, testing, packaging, and comparison with Internet Download Manager.

## Executive verdict

Rivlet is a convincing product prototype with a usable core, but it should not yet be positioned as ready to compete directly with Internet Download Manager in a broad public release.

The strongest parts are:

- Modern Windows 11-inspired interface.
- Clean primary download list.
- Working segmented HTTP downloads.
- Browser capture architecture.
- YouTube and supported non-DRM video downloading.
- High-resolution video/audio merging.
- Pause, resume, retry, categories, tray operation, and local recovery.
- Torrent support.
- A more modern and focused visual direction than IDM.

The largest concern is not missing polish: several settings appear functional in the interface but are not yet connected to runtime behavior. A setting that silently does nothing can damage user trust more than an omitted feature.

The current release is best described as a strong **private beta**. The recommended next milestone is a trust-and-reliability release before declaring a public MVP.

---

## 1. Main downloads screen

### What works

- Clear hierarchy.
- Familiar Windows-style command bar.
- Status and category navigation are easy to understand.
- Search is prominent.
- Progress, speed, ETA, size, and state are visible.
- Finished and unfinished filters reduce clutter.
- The interface is substantially calmer than IDM.
- The status bar communicates global activity without competing with the table.

### Recommended improvements

#### Better empty states

When only a few downloads exist, most of the window is unused. Use the space contextually:

- “Drop a link or file here.”
- Recent destination.
- Browser companion connection status.
- A subtle Add URL action.
- A short explanation when a category is empty.

Avoid filling the space with promotional cards.

#### Download inspector

Selecting a row should optionally open a compact right-side inspector containing:

- Full filename.
- Source hostname.
- Destination.
- Current and average speed.
- Connection count and segment activity.
- Referrer.
- Resume support.
- Retry history.
- Error details.
- File checksum.
- Open file and Open folder actions.

This exposes useful details without adding more permanent table columns.

#### Better error presentation

An Error label alone is insufficient. Show:

- Human-readable cause.
- Recommended recovery action.
- Expandable technical details.
- Retry button.
- Continue in browser, where relevant.
- Copy diagnostic information.

Useful error messages include:

- “The link expired. Capture it again from your browser.”
- “This server requires browser authentication.”
- “The server stopped accepting multiple connections. Retrying with one connection.”
- “The selected video format is no longer available.”

#### Table customization

- Show and hide columns.
- Reorder and resize columns.
- Remember sorting per view.
- Compact and comfortable density.
- Ctrl/Shift multi-selection.
- Batch retry, move, pause, categorize, and remove.

Microsoft recommends command bars for page-level actions and overflow handling, which fits Rivlet's structure well.

---

## 2. Add Download dialog

### What works

- Concise layout.
- Native folder selection.
- Category selection.
- Filename override.
- Magnet and torrent support.
- Batch URLs are technically accepted.

### Problems

The placeholder says users can enter one URL per line, but the address field resembles a single-line control. Batch behavior is therefore difficult to discover and awkward to use.

### Recommended redesign

Use two explicit modes:

- **Single download**
- **Batch URLs**

For a normal URL, perform a quick metadata probe and show:

- Resolved filename.
- File type.
- Estimated size.
- Source hostname.
- Resume support.
- Destination.
- Planned connection count.

For batches, use a dedicated multiline editor with:

- One URL per row.
- Inline validation.
- Duplicate detection.
- Per-row filename.
- Remove invalid URLs.
- Shared category and destination.

Also support dragging URLs, torrent files, and local files into Rivlet.

---

## 3. Browser onboarding

### What works

- Installed browsers are detected.
- The extension path is copied automatically.
- The extension directory is opened.
- Connection status is displayed.
- The local-communication explanation is useful.
- First-launch state is backend-persisted.

### Current pain points

- Developer mode is intimidating for ordinary users.
- Load unpacked is unfamiliar terminology.
- The dialog contains too much copy.
- The extension path is visually truncated.
- Do this later and Got it have nearly identical consequences.
- Individual setup steps do not visibly transition into completed states.

### Recommended experience

Convert onboarding into a three-screen flow:

1. **Choose browser**
   - Chrome or Edge.
   - One sentence explaining the benefit.

2. **Install companion**
   - Open the correct browser page.
   - Show a large illustration of Developer Mode and Load Unpacked.
   - Copy and reveal the extension directory.
   - Detect when the extension becomes active.

3. **Test connection**
   - Send a harmless local diagnostic message.
   - Show Browser connected.
   - Offer a test download.

Each screen should have one primary action.

Long term, publishing in browser stores remains the only truly consumer-friendly installation experience. Until then, keep the guided flow visual, short, and state-aware.

---

## 4. Settings audit

Visually, Settings is clean and appropriately Windows-like. The navigation is understandable and most controls have sufficient breathing room. Functionally, it presents the greatest current product risk.

### Settings with meaningful runtime behavior

- Download directory.
- Maximum simultaneous downloads.
- Segment count.
- Retry count and delay.
- Request timeout.
- User agent.
- Automatic resume.
- Overwrite behavior.
- Temporary video directory.
- Categories.
- Basic global schedule window.
- Concurrent video fragments.
- Browser-profile consent.
- Theme.
- Browser-onboarding persistence.

### Settings stored or displayed but not fully enforced

- Clipboard monitoring.
- Notify-on-completion preference.
- Shutdown when complete.
- Automatically remove completed rows.
- Completion dialog.
- Captured file-type rules.
- Excluded browser sites.
- Desktop video-detection toggle.
- Disabled-video-site synchronization.
- Preferred video quality.
- Preferred video container.
- Signed extractor updater controls.

Before public release, every exposed setting should either be fully implemented or disabled and clearly labelled as coming later.

### Recommended structure

Consolidate the current sections into:

- General.
- Downloads.
- Browser and Video.
- Categories and Automation.
- Advanced.

Add:

- Settings search.
- Reset this page.
- Restore all defaults.
- Immediate saving for simple toggles.
- Confirmation only for destructive or system-level actions.
- Requires browser companion labels.
- Live status for native host, extension, yt-dlp, ffmpeg, and updater.

---

## 5. Functional comparison with IDM

| Capability | Rivlet status | Recommendation |
|---|---|---|
| Browser download takeover | Working, best-effort | Harden redirects, signed URLs, and authentication |
| Static multipart downloading | Working | Replace with dynamic segment allocation |
| Pause and resume | Working | Add ETag and Last-Modified validation |
| Retry and recovery | Basic working | Categorized retries and exponential backoff |
| Download categories | Working | Better rules and previews |
| Video detection/download | Working, evolving | Extractor health, codec/audio detail, robust updates |
| Torrent downloads | Working | Add file selection and richer peer information |
| Multiple queues | Missing | High-priority parity feature |
| Per-queue scheduling | Missing | High-priority parity feature |
| Global schedule | Partial | Add weekdays, recurrence, and queue assignment |
| Site grabber/offline mirror | Missing | Later feature; not an MVP blocker |
| Proxy support | Missing | Important for power and business users |
| HTTP authentication | Limited | Add Basic, Negotiate, NTLM, and Kerberos strategy |
| Download quotas | Missing | Medium priority |
| Antivirus integration | Missing | Integrate with Windows Defender where possible |
| ZIP preview | Missing | Low-to-medium priority |
| Command-line interface | Missing | Medium priority |
| Drag and drop | Missing or limited | High UX value |
| Toolbar/column customization | Missing | Medium priority |
| Automatic updates | Infrastructure exists but is not wired | Launch blocker |
| SQLite persistence | Missing | Strongly recommended before public launch |
| Code-signed installer | Missing | Launch blocker for trust |

IDM's major engine advantage is dynamic segmentation: when a connection becomes available, it divides the largest unfinished segment so that connections remain busy. Rivlet currently adapts the initial number of equal ranges to file size but does not dynamically rebalance unfinished work.

---

## 6. Download-engine improvements

### P0: Correctness before more speed

Implement:

- Validate HEAD response status.
- Fall back to a small ranged GET when HEAD is rejected.
- Verify Content-Range.
- Fall back safely to one connection when parallel ranges are rejected.
- Persist and validate ETag and Last-Modified.
- Use If-Range when resuming.
- Detect changed remote files before resuming.
- Verify final byte count.
- Optional SHA-256 verification.
- Handle HTTP 416.
- Categorize expired, unauthorized, throttled, forbidden, missing, and server failures.
- Respect Retry-After.
- Add exponential backoff with jitter.

### P1: Dynamic segmentation

Replace fixed lifetime segments with a work queue:

1. Begin with a conservative number of ranges.
2. Monitor throughput per connection.
3. When a worker finishes, locate the largest unfinished range.
4. Split that range at a safe boundary.
5. Assign the new half to the idle worker.
6. Reduce concurrency when the host throttles or rejects ranges.
7. Remember a per-host connection profile.

Because Rivlet already uses concurrent `WriteAt`, dynamic jobs can continue writing directly to their final positions. No final concatenation pass is required.

### P1: Connection intelligence

- Per-host connection limits.
- Connection-reuse statistics.
- HTTP/2 stream awareness.
- Slow-connection detection.
- DNS, TLS, and time-to-first-byte measurements.
- Automatic single-connection mode for problematic hosts.
- Per-host exceptions in Settings.

---

## 7. Persistence and data integrity

Rivlet currently persists state in JSON, not SQLite.

For a public download manager, migrate to SQLite with:

- Transactional download creation.
- Download and segment tables.
- Queue membership.
- Retry attempts and error history.
- Browser-capture idempotency keys.
- Settings migrations.
- Extractor and helper-tool versions.
- Resume validators such as ETag.
- WAL mode.
- Backup and corruption recovery.

JSON is acceptable during early development but is fragile for frequent progress updates, schema upgrades, crash recovery, and large histories.

---

## 8. Queues and scheduling

Add:

- Default Download queue.
- Custom queues.
- Per-queue concurrency.
- Drag downloads between queues.
- Queue priorities.
- Start and stop queue actions.
- Start and stop times.
- Weekday selection.
- Run once or repeat.
- Move failed items to the end of a queue.
- Optional shutdown, sleep, or hibernate after completion.
- Bandwidth profile per queue.
- Periodic synchronization queues as a later feature.

Multiple queues and dynamic segmentation provide more IDM parity value than implementing Site Grabber immediately.

---

## 9. Video experience

Improve the format picker with:

- Resolution.
- FPS.
- Codec.
- HDR or SDR.
- Audio codec and bitrate.
- Estimated combined size.
- Final container.
- Compatibility badge.
- Recommended selection.
- Best quality, Best compatibility, and Smallest file presets.

Show explicit processing stages:

- Fetching metadata.
- Downloading video.
- Downloading audio.
- Merging.
- Verifying.
- Complete.

Do not represent merging as a stalled download at 100%.

Add a video-tools health screen with:

- Installed yt-dlp and ffmpeg versions.
- Last update.
- Check for update.
- Rollback.
- Diagnostic test.

The signed updater package exists in the codebase but is not connected to the application.

---

## 10. Visual and accessibility audit

### Strong points

- Calm Windows 11 direction.
- Consistent spacing.
- Good neutral surfaces.
- Understandable toolbar.
- Familiar settings navigation.
- Polished light theme.
- Distinctive pitch-black dark mode.

### Recommended improvements

- Stronger empty states.
- Optional download-details pane.
- Reserve green for meaningful active/success states.
- Do not communicate status by color alone.
- Improve disabled-control contrast.
- Make error states more visible than success states.
- Reduce onboarding copy.
- Add responsive behavior below the current minimum window width.
- Test at 125%, 150%, 200%, and 225% display scaling.
- Respect Windows text-size settings.
- Support high-contrast mode.
- Add visible keyboard-focus rings.
- Ensure every icon-only action has an accessible name.
- Add complete keyboard navigation and shortcuts.
- Test with Windows Narrator.
- Test custom-title-bar drag regions and caption buttons at every scale.

---

## 11. Testing and release readiness

### Checks that currently pass

- `go vet ./...`
- `go test ./...`
- TypeScript checking.
- Frontend production build.
- Existing extension unit tests.

### Current test gaps

- Only three extension unit tests.
- No meaningful Vue component test suite.
- No complete installed Chrome/Edge automation suite.
- No crash-recovery stress suite.
- No SQLite migration tests because persistence is still JSON.
- Race testing could not run in the current environment because CGO is disabled.
- No long-duration bandwidth benchmark.
- No signed production binaries.

### Required scenarios

- Redirect chains.
- Expired links.
- Authentication-required links.
- Unknown content length.
- Incorrect range responses.
- Server throttling and dropped connections.
- Files from 1 byte through sparse multi-gigabyte fixtures.
- Forced app termination during transfer.
- Sleep and resume.
- Network loss and interface switching.
- App and extension restarts in every order.
- Chrome and Edge updates.
- Histories exceeding 1,000 rows.
- Unicode, reserved-character, and long-path filenames.
- Low disk space.
- Destination removal during transfer.
- yt-dlp/ffmpeg updater rollback.
- Structured local logs with header, credential, and secret redaction.

---

## 12. Recommended roadmap

### Phase 0 — Public MVP blockers

1. Wire or remove every nonfunctional setting.
2. Replace JSON persistence with SQLite.
3. Add ETag/If-Range resume correctness.
4. Add range-rejection fallback.
5. Improve actionable error messages.
6. Wire the signed yt-dlp updater and rollback.
7. Add installed Chrome/Edge end-to-end tests.
8. Code-sign the installer and application binaries.
9. Add a redacted diagnostics export.
10. Simplify browser onboarding.

### Phase 1 — IDM-level daily usability

1. Dynamic segment rebalancing.
2. Multiple queues.
3. Per-queue scheduling and concurrency.
4. Drag-and-drop links and files.
5. Per-host connection rules.
6. Proxy and common HTTP authentication support.
7. Column and toolbar customization.
8. Download inspector.
9. Completion actions.
10. Windows Defender integration.

### Phase 2 — Power-user parity

1. Recurring synchronization queues.
2. Download quotas.
3. Command-line interface.
4. Import/export downloads and settings.
5. ZIP archive preview.
6. Credentials through Windows Credential Manager.
7. Remote-file-change detection.
8. Advanced batch naming.
9. Mirror selection.
10. Optional Site Grabber.

### Phase 3 — Rivlet differentiators

- Automatic host-performance profiles.
- Smart connection count based on measured throughput.
- Download provenance and privacy reports.
- Better codec/container recommendations than IDM.
- Unified HTTP, video, and torrent queue scheduling.
- Optional portable mode.
- Extension health repair.
- Polished compact progress island.
- Rules such as “Videos from this site → Videos folder.”
- Local-only bandwidth history and download statistics.

---

## Final recommendation

Do not add another large headline feature yet.

The best next milestone is a **Trust and Reliability Release** where:

- Every visible control works.
- Downloads survive crashes correctly.
- Expired and authenticated links fail clearly.
- Browser takeover is tested end to end.
- Updates are signed and rollback-capable.
- Installer and binaries are code-signed.
- Persistence is transactional.
- Existing downloads can be diagnosed and recovered.

After that milestone, prioritize multiple queues and dynamic segmentation. These provide the strongest movement toward IDM's real functional advantage while retaining Rivlet's superior visual direction.

---

## Research references

- [IDM product and engine overview](https://www.internetdownloadmanager.com/support/about.html)
- [IDM features and dynamic segmentation](https://www.internetdownloadmanager.com/features2.html)
- [IDM queues](https://www.internetdownloadmanager.com/support/idm-scheduler/idm_queues.html)
- [IDM scheduler](https://www.internetdownloadmanager.com/support/idm-scheduler/idm_scheduler.html)
- [IDM Site Grabber](https://www.internetdownloadmanager.com/support/idm-grabber/idm_grabber.html)
- [IDM release notes](https://www.internetdownloadmanager.com/support/new.html)
- [Windows 11 design principles](https://learn.microsoft.com/en-us/windows/apps/design/design-principles)
- [Windows controls and command bars](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/)
- [Windows settings guidance](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings)
- [Windows accessibility overview](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility-overview)
- [Windows accessible text requirements](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessible-text-requirements)
- [Windows custom title-bar guidance](https://learn.microsoft.com/en-us/windows/apps/design/controls/title-bar)
- [HTTP Semantics and byte ranges: RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Go HTTP transport documentation](https://go.dev/pkg/net/http/?m=old)
- [Go `os.File.WriteAt` documentation](https://pkg.go.dev/os)
