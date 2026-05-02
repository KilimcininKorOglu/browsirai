/**
 * Firefox connection — connects to Firefox via WebDriver BiDi.
 *
 * Strategy (ordered by preference):
 * 1. If Firefox is already running with --remote-debugging-port → connect
 * 2. If Firefox is running without debugging → quit & relaunch
 * 3. If Firefox is not running → launch with --remote-debugging-port
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import http from "node:http";
import { join, basename } from "node:path";
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
  /** Path to an existing Firefox profile directory */
  profilePath?: string;
  /** Browser to use: firefox, waterfox, librewolf, floorp, zen */
  browser?: string;
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
// Profile copy for locked profiles
// ---------------------------------------------------------------------------

const PROFILE_ESSENTIAL_FILES = [
  "cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm",
  "key4.db", "cert9.db",
  "logins.json", "logins-backup.json",
  "permissions.sqlite",
  "storage.sqlite",
  "storage-sync-v2.sqlite", "storage-sync-v2.sqlite-wal", "storage-sync-v2.sqlite-shm",
];

function isProfileLocked(profilePath: string): boolean {
  return existsSync(join(profilePath, ".parentlock")) || existsSync(join(profilePath, "lock"));
}

function copyProfileToTemp(sourceProfile: string): string {
  const tempDir = join(tmpdir(), "foxbrowser-profile-copy");
  mkdirSync(tempDir, { recursive: true });

  for (const file of PROFILE_ESSENTIAL_FILES) {
    const src = join(sourceProfile, file);
    if (existsSync(src)) {
      copyFileSync(src, join(tempDir, file));
    }
  }

  // Copy storage/ directory (localStorage, sessionStorage, IndexedDB)
  const storageDir = join(sourceProfile, "storage");
  if (existsSync(storageDir)) {
    copyDirRecursive(storageDir, join(tempDir, "storage"));
  }

  // Remove lock files from copy
  const lockFiles = [".parentlock", "lock"];
  for (const lf of lockFiles) {
    const lockPath = join(tempDir, lf);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }

  return tempDir;
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Browser binary paths per browser and platform
// ---------------------------------------------------------------------------

const BROWSER_PATHS: Record<string, Record<string, string[]>> = {
  firefox: {
    darwin: [
      "/Applications/Firefox.app/Contents/MacOS/firefox",
      "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
      "/Applications/Firefox Nightly.app/Contents/MacOS/firefox",
    ],
    linux: [
      "firefox", "firefox-esr", "firefox-developer-edition", "firefox-nightly",
      "/usr/bin/firefox", "/usr/lib/firefox/firefox", "/usr/lib64/firefox/firefox",
      "/snap/bin/firefox", "/opt/firefox/firefox", "/usr/lib/firefox-esr/firefox-esr",
    ],
    win32: [
      "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    ],
  },
  waterfox: {
    darwin: ["/Applications/Waterfox.app/Contents/MacOS/waterfox"],
    linux: ["waterfox", "/usr/bin/waterfox"],
    win32: ["C:\\Program Files\\Waterfox\\waterfox.exe"],
  },
  librewolf: {
    darwin: ["/Applications/LibreWolf.app/Contents/MacOS/librewolf"],
    linux: ["librewolf", "/usr/bin/librewolf"],
    win32: ["C:\\Program Files\\LibreWolf\\librewolf.exe"],
  },
  floorp: {
    darwin: ["/Applications/Floorp.app/Contents/MacOS/floorp"],
    linux: ["floorp", "/usr/bin/floorp"],
    win32: ["C:\\Program Files\\Floorp\\floorp.exe"],
  },
  zen: {
    darwin: ["/Applications/Zen Browser.app/Contents/MacOS/zen"],
    linux: ["zen-browser", "zen"],
    win32: ["C:\\Program Files\\Zen Browser\\zen.exe"],
  },
};

// ---------------------------------------------------------------------------
// Browser data directories per browser and platform
// ---------------------------------------------------------------------------

const BROWSER_DATA_DIRS: Record<string, Record<string, string>> = {
  firefox:   { darwin: "Firefox",      linux: ".mozilla/firefox", win32: "Mozilla\\Firefox" },
  waterfox:  { darwin: "Waterfox",     linux: ".waterfox",        win32: "Waterfox" },
  librewolf: { darwin: "LibreWolf",    linux: ".librewolf",       win32: "LibreWolf" },
  floorp:    { darwin: "Floorp",       linux: ".floorp",          win32: "Floorp" },
  zen:       { darwin: "Zen Browser",  linux: ".zen",             win32: "Zen Browser" },
};

// ---------------------------------------------------------------------------
// Browser process names for running detection
// ---------------------------------------------------------------------------

const BROWSER_PROCESS_NAMES: Record<string, { unix: string[]; win32: string }> = {
  firefox:   { unix: ["firefox", "firefox-bin"], win32: "firefox.exe" },
  waterfox:  { unix: ["waterfox"],               win32: "waterfox.exe" },
  librewolf: { unix: ["librewolf"],              win32: "librewolf.exe" },
  floorp:    { unix: ["floorp"],                 win32: "floorp.exe" },
  zen:       { unix: ["zen", "zen-browser"],     win32: "zen.exe" },
};

export function getBrowserDataDir(browser: string = "firefox"): string {
  const home = homedir();
  const dirs = BROWSER_DATA_DIRS[browser] ?? BROWSER_DATA_DIRS.firefox;
  const platform = process.platform;

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", dirs.darwin);
  }
  if (platform === "win32") {
    return join(home, "AppData", "Roaming", dirs.win32);
  }
  return join(home, dirs.linux);
}

/** @deprecated Use getBrowserDataDir() instead */
export function getDefaultFirefoxDataDir(): string {
  return getBrowserDataDir("firefox");
}

// ---------------------------------------------------------------------------
// Find Firefox
// ---------------------------------------------------------------------------

export function findBrowser(browser: string = "firefox"): string | null {
  const platform = process.platform;
  const browserPaths = BROWSER_PATHS[browser] ?? BROWSER_PATHS.firefox;
  const candidates = browserPaths[platform] ?? [];

  for (const candidate of candidates) {
    if (candidate.startsWith("/") || platform === "darwin" || platform === "win32") {
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

/** @deprecated Use findBrowser() instead */
export const findFirefox = findBrowser;

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
 * Verifies Firefox BiDi is truly usable by probing the HTTP server.
 *
 * Firefox BiDi does not serve `/json/version` (that is a CDP endpoint).
 * Instead, we hit the root `/` which returns 200 when the BiDi httpd is up.
 */
export function isBiDiHealthy(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/`, (res) => {
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

let launchedPid: number | undefined;

export function getLaunchedFirefoxPid(): number | undefined {
  return launchedPid;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if Firefox is currently running.
 */
export function isBrowserRunning(browser: string = "firefox"): boolean {
  const names = BROWSER_PROCESS_NAMES[browser] ?? BROWSER_PROCESS_NAMES.firefox;
  try {
    if (process.platform === "win32") {
      const r = execSync(`tasklist /FI "IMAGENAME eq ${names.win32}" /NH`, { stdio: "pipe" }).toString();
      return r.includes(names.win32);
    }
    const pgrepCmds = names.unix.map(n => `pgrep -x '${n}'`).join(" || ");
    const r = execSync(pgrepCmds, { stdio: "pipe" }).toString().trim();
    return r.length > 0;
  } catch {
    return false;
  }
}

/** @deprecated Use isBrowserRunning() instead */
export const isFirefoxRunning = isBrowserRunning;

/**
 * Quits the foxbrowser-launched Firefox process. Only kills the process
 * that was spawned by launchFirefoxWithDebugging or launchHeadlessFirefox.
 * Does nothing if no Firefox was launched by foxbrowser.
 */
export async function quitFirefox(): Promise<void> {
  if (launchedPid === undefined) {
    return;
  }

  if (!isProcessAlive(launchedPid)) {
    launchedPid = undefined;
    return;
  }

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${launchedPid}`, { stdio: "pipe", timeout: 5000 });
    } else {
      process.kill(launchedPid, "SIGTERM");
    }
  } catch {
    // May have already exited
  }

  for (let i = 0; i < 15; i++) {
    if (!isProcessAlive(launchedPid)) {
      launchedPid = undefined;
      return;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  if (isProcessAlive(launchedPid)) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /PID ${launchedPid}`, { stdio: "pipe", timeout: 5000 });
      } else {
        process.kill(launchedPid, "SIGKILL");
      }
    } catch {
      // best effort
    }

    for (let i = 0; i < 15; i++) {
      if (!isProcessAlive(launchedPid)) break;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  launchedPid = undefined;
  await new Promise(r => setTimeout(r, 500));
}

// ---------------------------------------------------------------------------
// WebSocket endpoint discovery
// ---------------------------------------------------------------------------

async function getWsEndpoint(port: number): Promise<string | undefined> {
  // Firefox BiDi WebSocket endpoint is always at /session
  return `ws://127.0.0.1:${port}/session`;
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
export async function launchFirefoxWithDebugging(
  port = 9222,
  headless = false,
  profilePath?: string,
  extraArgs?: string[],
  browser: string = "firefox",
): Promise<LaunchResult> {
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

  const browserPath = findBrowser(browser);
  if (!browserPath) {
    return { success: false, port, error: `${browser} not found. Install ${browser} and try again.` };
  }

  const usesSeparateInstance = isBrowserRunning(browser);
  const targetPort = usesSeparateInstance ? SEPARATE_PORT : port;

  let profileDir: string | undefined;

  if (profilePath) {
    if (isProfileLocked(profilePath)) {
      profileDir = copyProfileToTemp(profilePath);
    } else {
      profileDir = profilePath;
    }
  } else if (usesSeparateInstance) {
    profileDir = join(tmpdir(), "foxbrowser-firefox");
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

  if (extraArgs) {
    args.push(...extraArgs);
  }

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
  });
  if (child.pid !== undefined) launchedPid = child.pid;
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

  const browserPath = findBrowser();
  if (!browserPath) {
    return { success: false, port: HEADLESS_PORT, error: "Firefox not found." };
  }

  const profileDir = join(tmpdir(), "foxbrowser-firefox-headless");
  mkdirSync(profileDir, { recursive: true });

  const child = spawn(browserPath, [
    "--headless",
    `--remote-debugging-port=${HEADLESS_PORT}`,
    "--profile", profileDir,
    "--no-remote",
  ], {
    detached: true,
    stdio: "ignore",
  });
  if (child.pid !== undefined) launchedPid = child.pid;
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
    const { loadConfig } = await import("./config.js");
    const cfg = loadConfig();
    const configArgs = cfg.firefox.firefoxArgs?.length ? cfg.firefox.firefoxArgs : undefined;
    const browserName = options.browser ?? cfg.firefox.browser ?? "firefox";
    const launch = await launchFirefoxWithDebugging(targetPort, options.headless, options.profilePath, configArgs, browserName);
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
