/**
 * Browser Discovery Module for Firefox WebDriver BiDi.
 *
 * Discovers running Firefox instances via:
 * - HTTP endpoint on the remote debugging port
 * - Port scanning
 * - OS-specific Firefox path resolution
 *
 * @module
 */

import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Information about a discovered Firefox instance. */
export interface BrowserInfo {
  /** Browser name (always "Firefox"). */
  browser: string;
  /** Browser version string. */
  version: string;
  /** WebSocket URL for BiDi connection. */
  webSocketUrl: string;
}

/** Error codes for discovery failures. */
export type DiscoveryErrorCode =
  | "BROWSER_NOT_FOUND"
  | "DEBUG_PORT_UNAVAILABLE";

/** Structured error type for browser discovery failures. */
export class DiscoveryError extends Error {
  readonly code: DiscoveryErrorCode;

  constructor(code: DiscoveryErrorCode, message: string) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DiscoverBrowserOptions {
  /** Host to connect to (default: "127.0.0.1") */
  host?: string;
  /** Port to connect to (default: 9222) */
  port?: number;
  /** Timeout in ms for the HTTP request */
  timeout?: number;
}

export interface ScanPortsOptions {
  /** Host to scan (default: "127.0.0.1") */
  host?: string;
  /** Ports to scan */
  ports?: number[];
}

/** A single target from Firefox's /json/list response. */
export interface TargetInfo {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

// ---------------------------------------------------------------------------
// HTTP-based discovery
// ---------------------------------------------------------------------------

/**
 * Discovers a running Firefox instance by querying its HTTP
 * debugging endpoint at /json/version.
 *
 * Firefox exposes a similar endpoint to Chrome when launched
 * with `--remote-debugging-port`.
 */
export async function discoverBrowser(
  options: DiscoverBrowserOptions = {},
): Promise<BrowserInfo> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 9222;
  const timeout = options.timeout ?? 5000;

  const url = `http://${host}:${port}/json/version`;

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    response = await globalThis.fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
  } catch {
    throw new DiscoveryError(
      "BROWSER_NOT_FOUND",
      `No Firefox found on ${host}:${port}. ` +
        `Ensure Firefox is running with remote debugging enabled: ` +
        `firefox --remote-debugging-port=${port}`,
    );
  }

  if (!response.ok) {
    throw new DiscoveryError(
      "DEBUG_PORT_UNAVAILABLE",
      `Port ${port} is responding but does not appear to be a Firefox debugging endpoint (HTTP ${response.status}). ` +
        `Please relaunch Firefox with --remote-debugging-port=${port}`,
    );
  }

  let data: Record<string, string>;
  try {
    data = (await response.json()) as Record<string, string>;
  } catch {
    throw new DiscoveryError(
      "DEBUG_PORT_UNAVAILABLE",
      `Port ${port} returned invalid JSON. Please relaunch Firefox with --remote-debugging-port=${port}`,
    );
  }

  const browserField = data["Browser"] ?? "Firefox";
  const version = extractVersion(browserField);

  let wsUrl = data["webSocketDebuggerUrl"] ?? "";
  if (wsUrl) {
    try {
      const parsed = new URL(wsUrl);
      parsed.hostname = host;
      parsed.port = String(port);
      wsUrl = parsed.toString();
      if (!data["webSocketDebuggerUrl"]?.endsWith("/") && wsUrl.endsWith("/")) {
        wsUrl = wsUrl.slice(0, -1);
      }
    } catch {
      // If URL parsing fails, use as-is
    }
  }

  if (!wsUrl) {
    wsUrl = `ws://${host}:${port}/session`;
  }

  return {
    browser: "Firefox",
    version,
    webSocketUrl: wsUrl,
  };
}

function extractVersion(browserField: string): string {
  const match = browserField.match(/[\w]+\/([\d.]+)/);
  return match?.[1] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Port scanning
// ---------------------------------------------------------------------------

const DEFAULT_SCAN_PORTS = [9222, 9229];

/**
 * Scans multiple ports for running Firefox BiDi endpoints.
 */
export async function scanPorts(
  options: ScanPortsOptions = {},
): Promise<BrowserInfo[]> {
  const host = options.host ?? "127.0.0.1";
  const ports = options.ports ?? DEFAULT_SCAN_PORTS;

  const results: BrowserInfo[] = [];

  for (const port of ports) {
    try {
      const info = await discoverBrowser({ host, port, timeout: 2000 });
      results.push(info);
    } catch {
      // Port not responding — skip
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// OS-specific Firefox profile paths
// ---------------------------------------------------------------------------

type BrowserType = "firefox" | "firefox-developer" | "firefox-nightly";

interface BrowserPathConfig {
  darwin: string;
  linux: string;
  win32: string;
}

const BROWSER_PROFILE_PATHS: Record<BrowserType, Partial<BrowserPathConfig>> = {
  firefox: {
    darwin: "Library/Application Support/Firefox/Profiles",
    linux: ".mozilla/firefox",
    win32: "Mozilla\\Firefox\\Profiles",
  },
  "firefox-developer": {
    darwin: "Library/Application Support/Firefox/Profiles",
    linux: ".mozilla/firefox",
    win32: "Mozilla\\Firefox\\Profiles",
  },
  "firefox-nightly": {
    darwin: "Library/Application Support/Firefox/Profiles",
    linux: ".mozilla/firefox",
    win32: "Mozilla\\Firefox\\Profiles",
  },
};

/**
 * Returns the OS-specific path to Firefox's profiles directory.
 */
export function getFirefoxProfilesDir(
  platform: NodeJS.Platform,
  browser: string = "firefox",
): string {
  const browserKey = browser.toLowerCase() as BrowserType;
  const paths = BROWSER_PROFILE_PATHS[browserKey] ?? BROWSER_PROFILE_PATHS.firefox;

  const osPlatform = platform as keyof BrowserPathConfig;

  if (osPlatform !== "darwin" && osPlatform !== "linux" && osPlatform !== "win32") {
    throw new Error(
      `Unsupported platform "${platform}". Supported platforms: darwin, linux, win32`,
    );
  }

  const relativePath = paths[osPlatform];
  if (!relativePath) {
    throw new Error(
      `Unsupported platform "${platform}" for browser "${browser}"`,
    );
  }

  if (osPlatform === "win32") {
    const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
    return join(appData, relativePath);
  }

  return join(homedir(), relativePath);
}
