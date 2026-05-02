/**
 * Runs the platform installer — configures foxbrowser for the current OS and IDE.
 */

import { intro, select, confirm, spinner, outro, note, isCancel, cancel, log } from "@clack/prompts";
import { detectPlatform, getInstallConfig } from "./adapters/detect.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { connectFirefox, getDefaultFirefoxDataDir } from "./firefox-launcher.js";

import type { PlatformId } from "./adapters/types.js";

interface FirefoxProfile {
  name: string;
  path: string;
  isRelative: boolean;
  isDefault: boolean;
}

function parseFirefoxProfiles(): FirefoxProfile[] {
  const dataDir = getDefaultFirefoxDataDir();
  const iniPath = join(dataDir, "profiles.ini");
  if (!existsSync(iniPath)) return [];

  const content = readFileSync(iniPath, "utf-8");
  const profiles: FirefoxProfile[] = [];
  let current: Partial<FirefoxProfile> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[Profile")) {
      if (current.name && current.path) {
        profiles.push(current as FirefoxProfile);
      }
      current = { isRelative: true, isDefault: false };
    } else if (trimmed.startsWith("Name=")) {
      current.name = trimmed.slice(5);
    } else if (trimmed.startsWith("Path=")) {
      current.path = trimmed.slice(5);
    } else if (trimmed.startsWith("IsRelative=")) {
      current.isRelative = trimmed.slice(11) === "1";
    } else if (trimmed.startsWith("Default=1")) {
      current.isDefault = true;
    }
  }
  if (current.name && current.path) {
    profiles.push(current as FirefoxProfile);
  }

  return profiles.map(p => ({
    ...p,
    path: p.isRelative ? join(dataDir, p.path) : p.path,
  }));
}

/** All supported platforms for the select prompt. */
const platformOptions: Array<{ value: PlatformId; label: string }> = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "vscode-copilot", label: "VS Code Copilot" },
  { value: "opencode", label: "OpenCode" },
  { value: "zed", label: "Zed" },
  { value: "windsurf", label: "Windsurf" },
  { value: "cline", label: "Cline" },
  { value: "continue", label: "Continue" },
];

/**
 * Resolve a config path, expanding ~ to the home directory.
 * For project scope, paths are relative to cwd.
 * For global scope, paths starting with ~ are resolved to the home directory.
 */
function resolveConfigPath(configPath: string, scope: string): string {
  if (configPath.startsWith("~")) {
    return resolve(homedir(), configPath.slice(2));
  }
  if (scope === "global") {
    // Global scope: resolve relative to home directory
    return resolve(homedir(), configPath);
  }
  // Project scope: resolve relative to cwd
  return resolve(process.cwd(), configPath);
}

async function writeYamlConfig(
  filePath: string,
  serverEntry: Record<string, unknown>,
  profilePath?: string,
): Promise<void> {
  const args = (serverEntry.args as string[]) ?? ["-y", "foxbrowser"];
  const command = (serverEntry.command as string) ?? "npx";

  let envBlock = "";
  if (profilePath) {
    envBlock = `\n      env:\n        FOXBROWSER_PROFILE: "${profilePath}"`;
  }

  const yamlEntry = `  foxbrowser:\n    command: ${command}\n    args: [${args.map(a => `"${a}"`).join(", ")}]${envBlock}`;

  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    if (existing.includes("foxbrowser:")) {
      const updated = existing.replace(
        /  foxbrowser:[\s\S]*?(?=\n  \S|\n[a-zA-Z]|\s*$)/,
        yamlEntry,
      );
      writeFileSync(filePath, updated);
    } else if (existing.includes("mcpServers:")) {
      const updated = existing.replace(
        "mcpServers:",
        `mcpServers:\n${yamlEntry}`,
      );
      writeFileSync(filePath, updated);
    } else {
      const appended = existing.trimEnd() + `\nmcpServers:\n${yamlEntry}\n`;
      writeFileSync(filePath, appended);
    }
  } else {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `mcpServers:\n${yamlEntry}\n`);
  }
}

export async function runInstall(): Promise<void> {
  intro("foxbrowser installer");

  // Auto-detect platform
  const detected = detectPlatform();

  // Check which platforms already have foxbrowser installed
  const installedPlatforms = new Set<PlatformId>();
  for (const opt of platformOptions) {
    const config = getInstallConfig(opt.value);
    const paths = [
      resolve(process.cwd(), config.configPath),
      config.configPath.startsWith("~")
        ? resolve(homedir(), config.configPath.slice(2))
        : resolve(homedir(), config.configPath),
    ];
    for (const filePath of paths) {
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf-8");
          if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
            if (content.includes("foxbrowser:")) installedPlatforms.add(opt.value);
          } else {
            const existing = JSON.parse(content) as Record<string, unknown>;
            const section = existing[config.configKey] as Record<string, unknown> | undefined;
            if (section?.foxbrowser) installedPlatforms.add(opt.value);
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  // Platform selection — mark installed ones
  const platform = await select({
    message: "Select your AI coding platform:",
    options: platformOptions.map(opt => ({
      value: opt.value,
      label: installedPlatforms.has(opt.value) ? `${opt.label} (installed)` : opt.label,
    })),
    initialValue: detected.platform,
  });

  if (isCancel(platform)) {
    cancel("Installation cancelled.");
    return;
  }

  // Scope selection
  const scope = await select({
    message: "Install scope:",
    options: [
      { value: "project", label: "Project (current directory)" },
      { value: "global", label: "Global (user home)" },
    ],
  });

  if (isCancel(scope)) {
    cancel("Installation cancelled.");
    return;
  }

  const selectedPlatform = platform as PlatformId;
  const selectedScope = scope as string;

  // Firefox profile selection
  const profiles = parseFirefoxProfiles();
  let selectedProfilePath: string | undefined;

  if (profiles.length > 0) {
    const profileChoice = await select({
      message: "Firefox profile to use:",
      options: [
        { value: "__none__", label: "None (auto-launch with temporary profile)" },
        ...profiles.map(p => ({
          value: p.path,
          label: p.isDefault ? `${p.name} (default)` : p.name,
          hint: p.path,
        })),
      ],
    });

    if (isCancel(profileChoice)) {
      cancel("Installation cancelled.");
      return;
    }

    if (profileChoice !== "__none__") {
      selectedProfilePath = profileChoice as string;
    }
  }

  // Get install config for chosen platform
  const config = getInstallConfig(selectedPlatform);

  // Build server entry with optional profile
  const serverEntry = { ...config.serverEntry } as Record<string, unknown>;
  if (selectedProfilePath) {
    const env = (serverEntry.env ?? {}) as Record<string, string>;
    env.FOXBROWSER_PROFILE = selectedProfilePath;
    serverEntry.env = env;
  }

  // Resolve file path
  const filePath = resolveConfigPath(config.configPath, selectedScope);
  const isYaml = filePath.endsWith(".yaml") || filePath.endsWith(".yml");

  if (isYaml) {
    // YAML config (Continue) — append/write foxbrowser entry
    await writeYamlConfig(filePath, serverEntry, selectedProfilePath);
  } else {
    // JSON config (all other platforms)
    const serverConfig: Record<string, unknown> = {
      [config.configKey]: {
        foxbrowser: serverEntry,
      },
    };

    if (existsSync(filePath)) {
      const existingRaw = readFileSync(filePath, "utf-8");
      const existingConfig = JSON.parse(existingRaw as string) as Record<string, unknown>;

      const shouldMerge = await confirm({
        message: `Config file already exists at ${filePath}. Merge foxbrowser into it?`,
      });

      if (isCancel(shouldMerge) || !shouldMerge) {
        cancel("Installation cancelled.");
        return;
      }

      const existingSection = (existingConfig[config.configKey] ?? {}) as Record<string, unknown>;
      existingConfig[config.configKey] = {
        ...existingSection,
        foxbrowser: serverEntry,
      };

      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(existingConfig, null, 2));
    } else {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(serverConfig, null, 2));
    }
  }

  log.success(`Config written to ${filePath}`);

  // --- Check/establish BiDi connection (auto-launches Firefox if needed) ---
  const s = spinner();
  s.start("Connecting to Firefox via WebDriver BiDi...");

  const connection = await connectFirefox({
    autoLaunch: true,
    profilePath: selectedProfilePath,
  });
  if (connection.success) {
    s.stop(connection.wsEndpoint
      ? `Connected to Firefox (port ${connection.port})`
      : `BiDi reachable on port ${connection.port}`);
  } else {
    s.stop(connection.error ?? "Could not connect to Firefox");
    log.warn("Run `foxbrowser doctor` to diagnose.");
  }

  outro("foxbrowser is ready! Your AI agent can now control your browser.");
}
