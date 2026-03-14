/**
 * Firefox connection — connects to Firefox via WebDriver BiDi.
 *
 * Strategy (ordered by preference):
 * 1. If Firefox is already running with --remote-debugging-port → connect
 * 2. If Firefox is running without debugging → quit & relaunch
 * 3. If Firefox is not running → launch with --remote-debugging-port
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createConnection } from "node:net";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectOptions {
  /** Remote debugging port override (default 9222) */
  port?: number;
  /** If true, auto-launch Firefox when not connected */
  autoLaunch?: boolean;
  /** If true, launch Firefox in headless mode */
  headless?: boolean;
}

export interface ConnectResult {
  /** Whether connection to Firefox succeeded */
  success: boolean;
  /** Port Firefox is listening on */
  port: number;
  /** Full WebSocket endpoint URL */
  wsEndpoint?: string;
  /** Error message if connection failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Well-known Firefox paths per platform
// ---------------------------------------------------------------------------

const FIREFOX_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
    "/Applications/Firefox Nightly.app/Contents/MacOS/firefox",
  ],
  linux: [
    "firefox",
    "firefox-esr",
    "firefox-developer-edition",
    "firefox-nightly",
  ],
  win32: [
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
  ],
};

// ---------------------------------------------------------------------------
// Default Firefox data directory per platform
// ---------------------------------------------------------------------------

export function getDefaultFirefoxDataDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "Firefox");
    case "win32":
      return join(home, "AppData", "Roaming", "Mozilla", "Firefox");
    default: // linux
      return join(home, ".mozilla", "firefox");
  }
}

// ---------------------------------------------------------------------------
// Find Firefox
// ---------------------------------------------------------------------------

export function findFirefox(): string | null {
  const platform = process.platform;
  const candidates = FIREFOX_PATHS[platform] ?? [];

  for (const candidate of candidates) {
    if (platform === "darwin" || platform === "win32") {
      if (existsSync(candidate)) return candidate;
    } else {
      try {
        const result = execSync(`which ${candidate}`, { stdio: "pipe" });
        const path = result.toString().trim();
        if (path) return path;
      } catch {
        // try next
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Port check
// ---------------------------------------------------------------------------

export function isPortReachable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    socket.setTimeout(2000);
    socket.on("connect", () => { socket.end(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

/**
 * Verifies Firefox BiDi is truly usable by hitting /json/version.
 */
export function isBiDiHealthy(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/json/version`, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

// ---------------------------------------------------------------------------
// Firefox process management
// ---------------------------------------------------------------------------

/**
 * Checks if Firefox is currently running.
 */
export function isFirefoxRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const r = execSync('tasklist /FI "IMAGENAME eq firefox.exe" /NH', { stdio: "pipe" }).toString();
      return r.includes("firefox.exe");
    }
    const r = execSync("pgrep -x firefox || pgrep -x 'firefox-bin'", { stdio: "pipe" }).toString().trim();
    return r.length > 0;
  } catch {
    return false;
  }
}

/**
 * Quits Firefox gracefully, waits for it to fully exit.
 */
export async function quitFirefox(): Promise<void> {
  try {
    if (process.platform === "darwin") {
      execSync('osascript -e \'tell application "Firefox" to quit\'', { stdio: "pipe", timeout: 5000 });
    } else if (process.platform === "win32") {
      execSync("taskkill /IM firefox.exe", { stdio: "pipe", timeout: 5000 });
    } else {
      execSync("pkill -TERM firefox || pkill -TERM firefox-bin", { stdio: "pipe", timeout: 5000 });
    }
  } catch {
    // May not be running
  }

  for (let i = 0; i < 15; i++) {
    if (!isFirefoxRunning()) break;
    await new Promise(r => setTimeout(r, 200));
  }

  if (isFirefoxRunning()) {
    try {
      if (process.platform === "win32") {
        execSync("taskkill /F /IM firefox.exe", { stdio: "pipe", timeout: 5000 });
      } else {
        execSync("pkill -9 firefox || pkill -9 firefox-bin", { stdio: "pipe", timeout: 5000 });
      }
    } catch {
      // best effort
    }

    for (let i = 0; i < 15; i++) {
      if (!isFirefoxRunning()) break;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  await new Promise(r => setTimeout(r, 500));
}

// ---------------------------------------------------------------------------
// WebSocket endpoint discovery
// ---------------------------------------------------------------------------

async function getWsEndpoint(port: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => { body += c.toString(); });
      res.on("end", () => {
        try {
          const data = JSON.parse(body) as { webSocketDebuggerUrl?: string };
          resolve(data.webSocketDebuggerUrl ?? `ws://127.0.0.1:${port}/session`);
        } catch { resolve(`ws://127.0.0.1:${port}/session`); }
      });
    });
    req.setTimeout(3000, () => { req.destroy(); resolve(undefined); });
    req.on("error", () => resolve(undefined));
  });
}

// ---------------------------------------------------------------------------
// Launch Firefox with remote debugging
// ---------------------------------------------------------------------------

export interface LaunchResult {
  success: boolean;
  port: number;
  wsEndpoint?: string;
  error?: string;
}

const SEPARATE_PORT = 9444;

/**
 * Launches Firefox with --remote-debugging-port for BiDi access.
 *
 * NEVER quits the user's running Firefox. If Firefox is already running
 * without debugging, a separate instance is launched with a temp profile.
 */
export async function launchFirefoxWithDebugging(port = 9222, headless = false): Promise<LaunchResult> {
  const healthy = await isBiDiHealthy(port);
  if (healthy) {
    const ws = await getWsEndpoint(port);
    return { success: true, port, wsEndpoint: ws };
  }

  const sepHealthy = await isBiDiHealthy(SEPARATE_PORT);
  if (sepHealthy) {
    const ws = await getWsEndpoint(SEPARATE_PORT);
    return { success: true, port: SEPARATE_PORT, wsEndpoint: ws };
  }

  const firefoxPath = findFirefox();
  if (!firefoxPath) {
    return { success: false, port, error: "Firefox not found. Install Firefox and try again." };
  }

  const usesSeparateInstance = isFirefoxRunning();
  const targetPort = usesSeparateInstance ? SEPARATE_PORT : port;

  const profileDir = usesSeparateInstance
    ? join(tmpdir(), "browsirai-firefox")
    : undefined;

  if (profileDir) {
    mkdirSync(profileDir, { recursive: true });
  }

  const args = [
    `--remote-debugging-port=${targetPort}`,
  ];

  if (profileDir) {
    args.push("--profile", profileDir, "--no-remote");
  }

  if (headless) {
    args.push("--headless");
  }

  const child = spawn(firefoxPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait for BiDi to become healthy (up to 15 seconds)
  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 200));
    const ok = await isBiDiHealthy(targetPort);
    if (ok) {
      const ws = await getWsEndpoint(targetPort);
      return { success: true, port: targetPort, wsEndpoint: ws };
    }
  }

  return {
    success: false,
    port: targetPort,
    error: "Firefox launched but BiDi port not reachable after 15s.",
  };
}

// ---------------------------------------------------------------------------
// Headless Firefox
// ---------------------------------------------------------------------------

const HEADLESS_PORT = 9333;

/**
 * Launches a separate headless Firefox on port 9333 with a temp profile.
 */
export async function launchHeadlessFirefox(): Promise<LaunchResult> {
  const healthy = await isBiDiHealthy(HEADLESS_PORT);
  if (healthy) {
    const ws = await getWsEndpoint(HEADLESS_PORT);
    return { success: true, port: HEADLESS_PORT, wsEndpoint: ws };
  }

  const firefoxPath = findFirefox();
  if (!firefoxPath) {
    return { success: false, port: HEADLESS_PORT, error: "Firefox not found." };
  }

  const profileDir = join(tmpdir(), "browsirai-firefox-headless");
  mkdirSync(profileDir, { recursive: true });

  const child = spawn(firefoxPath, [
    "--headless",
    `--remote-debugging-port=${HEADLESS_PORT}`,
    "--profile", profileDir,
    "--no-remote",
  ], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await isBiDiHealthy(HEADLESS_PORT)) {
      const ws = await getWsEndpoint(HEADLESS_PORT);
      return { success: true, port: HEADLESS_PORT, wsEndpoint: ws };
    }
  }

  return { success: false, port: HEADLESS_PORT, error: "Headless Firefox did not start in 15s." };
}

// ---------------------------------------------------------------------------
// Connect to Firefox
// ---------------------------------------------------------------------------

/**
 * Connects to Firefox via WebDriver BiDi.
 *
 * Strategy:
 * 1. Try default port 9222 (Firefox already has debugging enabled)
 * 2. If autoLaunch is true, launch Firefox with --remote-debugging-port
 */
export async function connectFirefox(options: ConnectOptions = {}): Promise<ConnectResult> {
  const targetPort = options.port ?? 9222;

  const healthy = await isBiDiHealthy(targetPort);
  if (healthy) {
    const ws = await getWsEndpoint(targetPort);
    return {
      success: true,
      port: targetPort,
      wsEndpoint: ws,
    };
  }

  if (options.autoLaunch) {
    const launch = await launchFirefoxWithDebugging(targetPort, options.headless);
    if (launch.success) {
      return {
        success: true,
        port: launch.port,
        wsEndpoint: launch.wsEndpoint,
      };
    }
    return {
      success: false,
      port: targetPort,
      error: launch.error,
    };
  }

  return {
    success: false,
    port: targetPort,
    error: "Firefox remote debugging is not enabled. Launch Firefox with --remote-debugging-port=9222",
  };
}
