# Rivlet Product Context

Rivlet is a native Windows download manager and accelerator built with Go,
Wails, Vue, and TypeScript. It handles HTTP downloads, browser capture, video,
and torrents with segmented downloads, queues, schedules, categories, retries,
bandwidth controls, custom proxies, host profiles, and browser-profile support.

Rivlet is completely free. Every feature is available to every user without an
account, subscription, purchase, activation, telemetry, advertising, or feature
gate.

The desktop interface lives in `frontend/`; the Go download engine is in
`backend/`; the Chrome/Edge extension is in `extension/`; and the static landing
site is in `landing/index.html`.

Run the desktop app with `wails dev`, build it with `wails build`, and preview
the landing page by serving the `landing/` directory with any static web server.
