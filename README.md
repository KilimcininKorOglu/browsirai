# foxbrowser

[![npm version](https://img.shields.io/npm/v/foxbrowser.svg?style=flat-square)](https://www.npmjs.com/package/foxbrowser)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)

**Your browser. Your sessions. Your agent.**

An MCP server + CLI that connects AI coding agents to Firefox and Gecko-based browsers (Waterfox, LibreWolf, Floorp, Zen Browser) via WebDriver BiDi. Use as an MCP server for LLM-driven automation, or as a standalone CLI for direct browser control from the terminal.

## Why foxbrowser?

- **Standard protocol** — Uses WebDriver BiDi, the W3C standard for browser automation. No proprietary protocols, no vendor lock-in.

- **Credentials never reach the LLM** — Cookie values are managed at the browser level via BiDi storage commands. They never enter the MCP message stream, never reach the model context, never leave your machine.

- **Use your real browser sessions** — Automatically copies your Firefox profile (cookies, logins, certificates) even while your personal Firefox is running. No manual setup, no browser restart.

- **Works with Firefox forks** — Supports Waterfox, LibreWolf, Floorp, and Zen Browser out of the box. Same tools, same workflow.

- **No extra browser to install** — Uses your existing Firefox or fork installation. No separate binary downloads.

- **20x cheaper than screenshot-default tools** — Server-side snapshot redirection returns ~500 tokens instead of ~10K per interaction. 50 interactions/day: 25K tokens vs 500K.

- **Always up to date** — Auto-upgrade checks npm registry on every server start. Next session launches with the latest version. Zero manual intervention.

## Quick Start

```bash
npx foxbrowser install
```

Interactive installer that auto-detects your AI platform, lets you choose your browser (Firefox, Waterfox, LibreWolf, Floorp, Zen), select a profile for session access, and writes the MCP config. No global install needed.

<details>
<summary><strong>Claude Code</strong></summary>

```json
{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

```json

{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>VS Code Copilot</strong></summary>

```json

{
  "servers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

```json

{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

```json

{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cline</strong></summary>

```json

{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Zed</strong></summary>

```json

{
  "context_servers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

<details>
<summary><strong>Continue</strong></summary>

```yaml
# ~/.continue/config.yaml
mcpServers:
  foxbrowser:
    command: npx
    args: ["-y", "foxbrowser"]
```
</details>

<details>
<summary><strong>OpenCode</strong></summary>

```json

{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"]
    }
  }
}
```
</details>

## CLI Mode

foxbrowser also works as a standalone CLI -- no LLM required. Same commands, same browser connection.

```bash
npm install -g foxbrowser     # global install for CLI usage
```

Or use without installing: `npx foxbrowser <command>`.

```bash
foxbrowser open example.com
foxbrowser snapshot -i
foxbrowser click @e5
foxbrowser fill @e2 "hello world"
foxbrowser press Enter
foxbrowser eval "document.title"
```

### Commands (30)

| Category        | Commands                                                                              |
|-----------------|---------------------------------------------------------------------------------------|
| **Navigation**  | `open` (goto, navigate), `back`, `scroll`, `wait`, `tab` (tabs), `close`, `resize`    |
| **Observation** | `snapshot`, `screenshot`, `html`, `eval`, `find`, `source`, `console`, `network`      |
| **Actions**     | `click`, `fill`, `type`, `press` (key), `hover`, `drag`, `select`, `upload`, `dialog` |
| **Network**     | `route`, `abort`, `unroute`, `save`, `load`, `diff`                                   |

### Short Flags

```bash
foxbrowser snapshot -i          # interactive elements only
foxbrowser snapshot -c          # compact output
foxbrowser snapshot -d 3        # depth limit
foxbrowser snapshot -s "main"   # scope to selector
foxbrowser screenshot -o ss.png # save to file
```

### Positional Arguments

```bash
foxbrowser click @e5            # ref (not --ref=@e5)
foxbrowser click "#submit"      # CSS selector
foxbrowser fill @e2 "text"      # ref + value
foxbrowser drag @e1 @e2         # source + target
foxbrowser select @e3 "option1" # ref + value(s)
foxbrowser scroll down           # direction
foxbrowser resize 1280 720      # width height
```

### Workflow Example

```bash
foxbrowser open github.com/login
foxbrowser snapshot -i
# @e12 textbox "Username"
# @e15 textbox "Password"
# @e18 button "Sign in"
foxbrowser fill @e12 "user@example.com"
foxbrowser fill @e15 "password"
foxbrowser click @e18
foxbrowser wait --url="github.com/dashboard"
foxbrowser snapshot -i
```

## Features

| Feature                 | Description                                                                                                 |
|-------------------------|-------------------------------------------------------------------------------------------------------------|
| **WebDriver BiDi**      | W3C standard protocol. Cross-browser compatible, future-proof.                                              |
| **Firefox Forks**       | Waterfox, LibreWolf, Floorp, Zen Browser. One config: `browser: "librewolf"`.                               |
| **Daemon Architecture** | MCP server survives browser crashes. Auto-reconnects on next `browser_connect`.                             |
| **Profile Copy**        | Auto-copies locked Firefox profiles. Access your logins/cookies without closing your personal browser.      |
| **Skill Injection**     | On every connect, injects workflow hints, cost hierarchy, and identity resolution rules into agent context. |
| **EventBuffer Capture** | Server-side BiDi event listeners. Network requests and console messages survive page navigations.           |
| **Source Inspection**   | Maps DOM elements to source code: React (Fiber tree + jsxDEV), Vue (`__file`), Svelte (`__svelte_meta`).    |
| **Network Intercept**   | Route, abort, and mock HTTP requests with glob pattern matching via BiDi network module.                    |
| **Element Refs**        | Accessibility tree nodes get `@eN` refs. Click, fill, hover, drag -- all by ref.                            |
| **Clean Snapshots**     | Filters out script, style, SVG, and aria-hidden noise. Only meaningful content in the tree.                 |
| **Pixel Diff**          | Compare two screenshots pixel-by-pixel. Returns diff percentage and visual overlay.                         |
| **Session Persistence** | Save/load cookies, localStorage, sessionStorage across agent sessions.                                      |
| **Insecure Certs**      | Accept self-signed TLS certificates with `ACCEPT_INSECURE_CERTS=true` for local development.               |
| **Auto-Upgrade**        | Checks npm registry on server start. Background upgrade applies on next restart.                            |
| **Cost Optimization**   | `browser_screenshot` auto-returns text snapshot (~500 tokens) unless `visual: true` (~10K tokens).          |
| **Minimal Overhead**    | No per-tool hints or verbose tips in responses. Connect summary is 5 lines (~40 tokens, not ~800).          |

## Tools (35)

### Connection and Lifecycle

| Tool              | What it does                                                                               | ~Tokens |
|-------------------|--------------------------------------------------------------------------------------------|--------:|
| `browser_connect` | Connect to browser via WebDriver BiDi. Auto-launches if needed. `browser` param selects fork. |       - |
| `browser_firefox_info` | Browser version, user-agent, session status, open tab count.                          |     ~10 |
| `browser_tabs`    | List open tabs, filter by title/URL glob.                                                  |     ~10 |
| `browser_list`    | List available browser instances on default ports.                                         |     ~10 |
| `browser_close`   | Close tab(s) or detach. `force: true` to actually close.                                   |       - |
| `browser_resize`  | Set viewport dimensions or preset (`mobile`, `tablet`, `desktop`, `reset`).                |     ~10 |

### Navigation

| Tool                    | What it does                                                              | ~Tokens |
|-------------------------|---------------------------------------------------------------------------|--------:|
| `browser_navigate`      | Navigate to URL. `waitUntil`: `load`, `domcontentloaded`, `networkidle`.  |    ~500 |
| `browser_navigate_back` | Go back or forward in history.                                            |    ~500 |
| `browser_scroll`        | Scroll page/element by direction and pixels, or scroll element into view. |     ~10 |
| `browser_wait_for`      | Wait for text, selector, URL glob, JS condition, or timeout.              |     ~10 |

### Observation

| Tool                           | What it does                                                                           |   ~Tokens |
|--------------------------------|----------------------------------------------------------------------------------------|----------:|
| `browser_snapshot`             | Accessibility tree with `@eN` refs. `compact`, `interactive`, `cursor`, `depth` modes. |      ~500 |
| `browser_screenshot`           | Returns text snapshot by default. `visual: true` for image. `saveTo` saves to disk.    | ~500/~10K |
| `browser_annotated_screenshot` | Screenshot with numbered labels on interactive elements.                               |      ~12K |
| `browser_html`                 | Raw HTML of page or element by selector.                                               |      ~500 |
| `browser_find`                 | Find elements by ARIA role, name, or text. Returns `@eN` ref.                          |      ~100 |
| `browser_inspect_source`       | Source file, line, component name. React/Vue/Svelte.                                   |      ~100 |
| `browser_evaluate`             | Run JavaScript in page context. Async supported.                                       |       ~10 |

### Interaction

| Tool                    | What it does                                                                   | ~Tokens |
|-------------------------|--------------------------------------------------------------------------------|--------:|
| `browser_click`         | Click by `@eN` ref, CSS selector, visible text, or x/y coordinates.            |     ~10 |
| `browser_fill_form`     | Clear + type into a field. Handles textbox, checkbox, radio, combobox, slider. |     ~10 |
| `browser_type`          | Type text (appends, doesn't clear). `slowly` mode for key-event listeners.     |     ~10 |
| `browser_press_key`     | Press key or combination (`Control+c`, `Meta+a`, `Enter`, `Escape`).           |     ~10 |
| `browser_hover`         | Hover over element by ref.                                                     |     ~10 |
| `browser_drag`          | Drag from one ref to another with synthesized pointer events.                  |     ~10 |
| `browser_select_option` | Select dropdown options by value or label text.                                |     ~10 |
| `browser_file_upload`   | Upload files to a file input by ref.                                           |     ~10 |
| `browser_handle_dialog` | Accept/dismiss alert, confirm, prompt. With optional prompt text.              |     ~10 |

### Network and Debugging

| Tool                       | What it does                                                                           | ~Tokens |
|----------------------------|----------------------------------------------------------------------------------------|--------:|
| `browser_network_requests` | List captured requests. Filter by URL glob, exclude static resources.                  |    ~100 |
| `browser_network_request`  | Get full details (headers) of a single request by index.                               |    ~200 |
| `browser_console_messages` | Retrieve console log/warn/error/info messages. Filter by level.                        |    ~100 |
| `browser_route`            | Intercept requests matching URL glob. Respond with custom body/status/headers.         |     ~10 |
| `browser_abort`            | Block requests matching URL glob.                                                      |     ~10 |
| `browser_unroute`          | Remove intercept rules. `all: true` to clear everything.                               |     ~10 |

### State and Persistence

| Tool                 | What it does                                                             | ~Tokens |
|----------------------|--------------------------------------------------------------------------|--------:|
| `browser_save_state` | Save cookies, localStorage, sessionStorage to named file.                |     ~10 |
| `browser_load_state` | Restore saved state. Optionally navigate to URL after loading.           |     ~10 |
| `browser_diff`       | Pixel-by-pixel comparison. Returns diff %, pixel counts, visual overlay. |    ~11K |

> **~Tokens** = approximate tokens returned to the LLM per call.

## Architecture

### Protocol

foxbrowser uses **WebDriver BiDi** -- the W3C standard bidirectional protocol for browser automation. Unlike CDP (Chrome DevTools Protocol), BiDi is designed as an open standard with cross-browser support.

```
┌──────────────────┐     WebDriver BiDi      ┌──────────────────┐
│  foxbrowser       │ ◄──────────────────────► │  Browser         │
│  MCP Server      │     WebSocket            │  (BiDi endpoint) │
│                  │                          │                  │
│  - Tool handlers │                          │  - DOM access    │
│  - Event buffer  │                          │  - Input actions │
│  - Skill inject  │                          │  - Network       │
└────────┬─────────┘                          └──────────────────┘
         │
         │ MCP (stdio)
         ▼
┌────────────────┐
│  AI Agent      │
│  (Claude, etc) │
└────────────────┘
```

### Cost Optimization

```
browser_evaluate     ~10 tokens    JS expression
browser_snapshot    ~500 tokens    Accessibility tree
browser_screenshot  ~10K tokens    Visual (opt-in)

20x cost reduction vs screenshot-default tools
```

`browser_screenshot` without `visual: true` auto-returns a text snapshot. The LLM gets the same information at 1/20th the cost.

Tool responses contain zero verbose hints or tips -- only the data requested. The connect summary is 5 lines (~40 tokens) instead of a full reference document (~800 tokens). Over a 50-call session, this saves ~2500 tokens of overhead.

| Scenario                  | Screenshot-default tool |       foxbrowser |
|---------------------------|------------------------:|-----------------:|
| 50 interactions/day       |         500K tokens/day |   25K tokens/day |
| 20 devs x 22 working days |       220M tokens/month | 11M tokens/month |

### Benchmark: foxbrowser vs Playwright MCP

Real-world comparison on the same page ([nvidia.srv.hermestech.uk](https://nvidia.srv.hermestech.uk/) -- a data-heavy dashboard with tables, charts, and 141 model listings).

| Metric                     | foxbrowser | Playwright MCP | Difference |
|----------------------------|------------|----------------|------------|
| Snapshot characters        | ~6,200     | ~12,800        | **52% less** |
| Estimated tokens           | ~1,550     | ~3,200         | **52% less** |
| Element refs               | ~230       | ~555           | **59% less** |
| Navigate response          | 26 chars   | ~150 chars     | **83% less** |
| Screenshot (default)       | ~500 tok   | ~10,000 tok    | **95% less** |

**Why the difference:**

- foxbrowser filters `<script>`, `<style>`, `<svg>`, `<noscript>`, `<meta>`, and `aria-hidden` elements from snapshots
- Playwright includes structural noise (`generic`, `rowgroup`, `columnheader` wrappers)
- foxbrowser `browser_screenshot` auto-downgrades to text snapshot (~500 tokens) unless `visual: true` is explicitly requested
- foxbrowser tool responses contain zero verbose hints -- only the requested data

**Test methodology:** Both tools navigated to the same URL, called `browser_snapshot` (default parameters), and the raw text output was measured. Token estimates use the ~4 characters per token approximation. Tested on 2026-05-02.

### EventBuffer

Network requests and console messages are captured via **server-side BiDi event listeners** -- not browser-side JavaScript injection. This means:

- Captures survive page navigations (no re-injection needed)
- Bounded ring buffer (500 events) prevents memory leaks
- URL secrets are automatically redacted (JWT, Bearer tokens, auth headers)
- Static resources (images, fonts, stylesheets) can be filtered out

### Auto-Upgrade

```
Session 1: server starts -> checks npm registry -> background upgrade
Session 2: starts with latest version
```

- 1-hour rate limit between checks
- npx: clears npm cache (next invocation fetches latest)
- global: `npm install -g foxbrowser@latest` in background
- dev mode: skipped
- Upgrade notice shown on `browser_connect` if newer version available
- All errors silently caught -- never crashes the server

### Skill Injection

On every `browser_connect`, foxbrowser injects a structured skill document into the agent context:

- **Cost hierarchy** -- guides the agent to prefer `evaluate` > `snapshot` > `screenshot`
- **Workflow patterns** -- snapshot-ref interaction model, when to re-snapshot
- **Identity resolution** -- use browser session cookies, never guess usernames

## Configuration

foxbrowser can be configured through environment variables, a JSON config file, or `browser_connect` tool parameters. Priority: environment variables > config file > defaults.

### Environment Variables

| Variable                | Description                           | Default     |
|-------------------------|---------------------------------------|-------------|
| `FIREFOX_DEBUG_PORT`    | Remote debugging port                 | `9222`      |
| `FOXBROWSER_HOST`       | Debug host address                    | `127.0.0.1` |
| `FOXBROWSER_HEADLESS`   | Launch browser in headless mode       | `false`     |
| `FOXBROWSER_BROWSER`    | Browser to use                        | `firefox`   |
| `FOXBROWSER_PROFILE`    | Path to browser profile directory     | (auto)      |
| `FOXBROWSER_CONFIG`     | Path to config file                   | (see below) |
| `ACCEPT_INSECURE_CERTS` | Accept self-signed TLS certificates   | `false`     |

### Config File

Default path: `~/.foxbrowser/config.json`

```json
{
  "firefox": {
    "port": 9222,
    "host": "127.0.0.1",
    "browser": "firefox",
    "profilePath": "/path/to/profile",
    "firefoxArgs": ["--safe-mode"],
    "prefs": {},
    "acceptInsecureCerts": false
  },
  "screenshot": {
    "quality": 80,
    "maxWidth": 1280
  },
  "network": {
    "maxRequests": 100
  },
  "connection": {
    "connectTimeout": 5000,
    "reconnectAttempts": 3,
    "commandTimeout": 30000
  }
}
```

### MCP Server Configuration

Environment variables can be passed via your MCP config:

```json
{
  "mcpServers": {
    "foxbrowser": {
      "command": "npx",
      "args": ["-y", "foxbrowser"],
      "env": {
        "FOXBROWSER_BROWSER": "librewolf",
        "FOXBROWSER_PROFILE": "/path/to/profile"
      }
    }
  }
}
```

### Using an Existing Browser Profile

To access your logged-in sessions, cookies, and saved passwords:

1. Find your profile path: open `about:profiles` in your browser, or check:
   - macOS: `~/Library/Application Support/Firefox/Profiles/`
   - Linux: `~/.mozilla/firefox/`
   - Windows: `%APPDATA%\Mozilla\Firefox\Profiles\`
2. Set `FOXBROWSER_PROFILE` to the profile's root directory

foxbrowser automatically detects if the profile is locked by your running browser and copies the essential files (cookies, logins, certificates, storage) to a temp directory. Your personal browser stays untouched.

Alternatively, launch your browser with remote debugging enabled to connect directly:

```bash
firefox --remote-debugging-port=9222    # or waterfox, librewolf, floorp, zen
```

foxbrowser will auto-detect and connect to it without launching a new instance.

## Process Safety

foxbrowser never touches your personal browser session:

- If your browser is already running, foxbrowser launches a separate instance
- When `profilePath` is set and the profile is locked, foxbrowser copies cookies/logins to a temp directory instead of interfering with the running browser
- `browser_close` only affects foxbrowser's own tabs and instances
- **Never** use `pkill` or `killall` on browser processes -- this kills all instances including your personal browser

## Diagnostics

```bash
foxbrowser doctor
```

Checks browser installation, Node.js version, BiDi connectivity, and platform configuration.

## Security

### What foxbrowser does

- Launches a **browser instance** with WebDriver BiDi enabled
- Returns only **page content** to the agent (DOM text, evaluate results, snapshots)
- **Redacts secrets** in network output: Authorization, Cookie, Set-Cookie, Bearer tokens, JWTs, and vendor API keys
- **Case-insensitive** body key redaction (password, token, client_secret in any casing)
- **Restricts file permissions** on saved session state (owner-only, `0o600`)
- **Strips filesystem paths** from responses to prevent home directory disclosure
- Resets state gracefully when Firefox closes (MCP server stays alive)

### What foxbrowser does NOT do

- Send cookie values to the LLM provider
- Store credentials in any config file
- Use a cloud relay or proxy
- Require you to enter passwords into the agent
- Modify your browser profile or existing sessions
- Expose `firefoxArgs` via MCP API (config file only -- prevents flag injection)

## Supported Platforms

### AI Platforms

| Platform        | Auto-detect | Config format |
|-----------------|-------------|---------------|
| Claude Code     | Yes         | JSON          |
| Cursor          | Yes         | JSON          |
| Gemini CLI      | Yes         | JSON          |
| VS Code Copilot | Yes         | JSON          |
| Windsurf        | Yes         | JSON          |
| Zed             | Yes         | JSON          |
| OpenCode        | Yes         | JSON          |
| Cline           | Manual      | JSON          |
| Continue        | Manual      | YAML          |

### Browsers

| Browser       | macOS | Linux | Windows | BiDi |
|---------------|-------|-------|---------|------|
| Firefox       | Yes   | Yes   | Yes     | Yes  |
| Waterfox      | Yes   | Yes   | Yes     | Yes  |
| LibreWolf     | Yes   | Yes   | Yes     | Yes  |
| Floorp        | Yes   | Yes   | Yes     | Yes  |
| Zen Browser   | Yes   | Yes   | Yes     | Yes  |
| Tor Browser   | -     | -     | -       | No   |
| Mullvad       | -     | -     | -       | No   |

## FAQ

<details>
<summary><strong>Does the LLM see my passwords or cookies?</strong></summary>

No. Cookie values are managed at the browser level via BiDi storage commands. The LLM only sees page content -- text, DOM elements, JavaScript evaluation results.
</details>

<details>
<summary><strong>Why Firefox and WebDriver BiDi?</strong></summary>

WebDriver BiDi is the W3C standard for browser automation. It provides a standardized, cross-browser compatible protocol. Firefox has the most mature BiDi implementation among browsers.
</details>

<details>
<summary><strong>What happens when I close Firefox?</strong></summary>

The MCP server stays alive. On the next `browser_connect`, it launches a fresh Firefox instance.
</details>

<details>
<summary><strong>Does it work headless?</strong></summary>

Yes. `browser_connect { "headless": true }` or set `FOXBROWSER_HEADLESS=1`. Note: some services may detect headless browsers.
</details>

<details>
<summary><strong>How do I use my existing Firefox profile?</strong></summary>

Set the profile path via environment variable or config:

```bash
FOXBROWSER_PROFILE="/path/to/firefox/profile" npx foxbrowser
```

Or pass it as a tool parameter: `browser_connect { "profilePath": "/path/to/profile" }`. Find your profile path at `about:profiles` in Firefox. If the profile is locked by your running Firefox, foxbrowser automatically copies cookies and logins to a temp directory -- no need to close your browser.
</details>

<details>
<summary><strong>Can I connect to my already-running Firefox?</strong></summary>

Yes, if Firefox was launched with `--remote-debugging-port=9222`. foxbrowser will detect the open port and connect directly -- no new instance launched. Without this flag, foxbrowser launches a separate instance.
</details>

<details>
<summary><strong>Why does foxbrowser launch a new Firefox instead of using mine?</strong></summary>

Firefox requires the `--remote-debugging-port` flag at startup to enable the WebDriver BiDi protocol. This cannot be toggled on a running Firefox. Set `FOXBROWSER_PROFILE` to your profile path -- foxbrowser will automatically copy your cookies and logins to a temp directory and launch a separate instance. Your personal Firefox stays open and untouched.
</details>

<details>
<summary><strong>Can the LLM see sensitive page content?</strong></summary>

Yes -- the LLM sees the same content you would see in the browser. This is inherent to any browser automation tool. The key difference is that **authentication credentials** (cookies, tokens, session IDs) are never in the LLM context.
</details>

## License

AGPL-3.0 -- free to use, modify, and distribute. If you modify and deploy as a network service, you must open-source your changes.
