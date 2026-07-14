# Rivlet

<p align="center">
  <img src="landing/public/assets/rivlet-logo.png" alt="Rivlet logo" width="160">
</p>

Rivlet is a fast, modern download manager for Windows. It accelerates compatible HTTP/HTTPS downloads with parallel connections and provides queues, scheduling, categories, browser capture, clipboard monitoring, bandwidth controls, torrent support, and video downloads in a native Windows 11-style app.

Rivlet is free for everyone: no account, subscription, ads, telemetry, or feature gates.

## Features

- Multi-connection HTTP/HTTPS downloads with pause, resume, retries, and integrity checks
- Download categories, filters, queues, priorities, scheduling, and completion actions
- Global, per-queue, and per-download bandwidth controls
- Chrome and Edge browser capture through the included extension and native host
- Clipboard monitoring and support for custom headers, proxies, and stored credentials
- Torrent downloads and video format selection through yt-dlp when installed
- Light and dark themes, Windows notifications, and a system-tray experience

## Tech stack

- Desktop shell and backend: Go + [Wails v2](https://wails.io/)
- Desktop UI: Vue 3, TypeScript, Vite, and Pinia
- Browser extension: Chrome/Edge Manifest V3
- Landing page: static HTML, CSS, and JavaScript

## Requirements

- Windows 10 or Windows 11
- Go 1.25 or newer
- Node.js 20 or newer with npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation/)
- NSIS on `PATH` when producing the Windows installer

## Run locally

```powershell
git clone <your-fork-url>
cd <repository-directory>
wails dev
```

`wails dev` installs the frontend dependencies and starts the desktop app with live reload.

## Test and build

Run backend tests:

```powershell
go test ./...
```

Check the frontend:

```powershell
cd frontend
npm install
npm run build
```

Build the production executable:

```powershell
wails build -platform windows/amd64
```

Build a Windows installer (requires NSIS):

```powershell
wails build -platform windows/amd64 -nsis
```

The outputs are written to `build/bin/`, including `Rivlet.exe` and `Rivlet-amd64-installer.exe`.

## Browser extension

Build the extension and native integration host:

```powershell
.\scripts\build-integration.ps1
```

For local extension development, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`.

The extension can hand supported downloads to Rivlet. Use it only for files and media you have the right to download; respect website terms and applicable copyright law.

## Landing page

The public site lives in `landing/` and is intentionally framework-free. Its installer CTAs point to `landing/public/downloads/Rivlet-Setup.exe`.

To publish the static site to the existing Cloudflare Pages project:

```powershell
cd landing
npx wrangler pages deploy . --project-name rivlet --branch main
```

Before deploying a release, copy the freshly built installer to `landing/public/downloads/Rivlet-Setup.exe`.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, add or update tests where practical, and run the relevant checks above before opening a pull request.

## License

A project license has not yet been selected. Add one before publishing the repository publicly so contributors and users understand the terms.
