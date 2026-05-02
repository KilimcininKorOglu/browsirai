# Changelog

## [1.1.0] - 2026-05-02

### Added
- Waterfox, LibreWolf, Floorp, and Zen Browser support with per-browser binary paths, profile dirs, and process detection
- Auto-copy locked browser profiles for seamless session access without closing personal browser
- Firefox profile selection in interactive installer (`npx foxbrowser install`)
- `browser_network_request` tool for single request detail with headers
- `browser_firefox_info` tool for browser version, session status, tab count
- `browser_click` text parameter for clicking by visible text content
- Screenshot `saveTo` parameter to save to disk instead of returning base64
- `--profile-path`, `--accept-insecure-certs` configuration options
- `FOXBROWSER_BROWSER`, `FOXBROWSER_PROFILE`, `ACCEPT_INSECURE_CERTS` environment variables
- Windsurf and Zed platform auto-detection
- Continue YAML config support in installer
- Linux Firefox absolute paths for snap, flatpak, and manual installs
- CI workflow (lint, test, build) and release workflow (npm publish with provenance)
- Native value setter fallback for React-controlled inputs in `fill_form` and `type`
- Zero-size element guards in `hover` and `fill_form`
- Vendor API key redaction (OpenAI sk-, GitHub ghp_, AWS AKIA, Slack xoxb-, Google ya29.)
- AWS, GitHub, and session headers to redaction list
- OAuth callback params (code, id_token, assertion) to URL redaction

### Changed
- Token optimization: removed all per-tool hints, shortened connect summary from ~800 to ~40 tokens
- Snapshot filtering: script, style, SVG, noscript, meta, template, aria-hidden elements excluded
- `browser_html` returns raw HTML instead of JSON wrapper
- `browser_scroll` returns human-readable message instead of JSON
- Network filter strips glob wildcards for substring matching
- `firefoxArgs` removed from MCP tool API (config file only, prevents flag injection)
- All user-facing strings use dynamic browser name instead of hardcoded Firefox
- Dependencies pinned to exact versions for supply chain security
- Error type renamed from `cdp_timeout` to `bidi_timeout`
- TypeScript lib updated to ES2023 for `findLastIndex` support

### Fixed
- Firefox BiDi protocol compatibility: session.new required after WebSocket connect
- BiDi health check uses root `/` instead of CDP `/json/version` endpoint
- BiDi value deserialization for script.evaluate/callFunction responses
- Context auto-injection for browsingContext.* and input.* commands
- `execCommand('insertText')` replaced with real key events for SPA compatibility
- `fill_form` clears text with Ctrl+A+Backspace instead of el.value=''
- Resize preset "reset" returns actual viewport dimensions instead of 0x0
- Case-insensitive body key redaction in network output
- Session state files written with 0o600 permissions (owner-only)
- Filesystem paths stripped from tool responses
- Sensitive headers redacted in `browser_network_request` detail view

### Security
- 7 vulnerabilities found and fixed via security sweep (BUG-008 through BUG-014)
- Hardcoded secrets scan: clean
- Path traversal scan: clean
- RCE/command injection scan: clean
