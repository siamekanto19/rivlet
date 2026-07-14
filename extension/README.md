# Rivlet Integration for Chrome and Edge

1. Install Rivlet or run `scripts/build-integration.ps1` from the repository.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the installed `integration/extension` directory (or this repository's `extension/dist`).
5. Open the extension's **Details → Extension options**, test the native connection, and explicitly grant all-site access if video detection is desired.

The extension never requests browser-cookie permission. DRM-protected media is not supported.
