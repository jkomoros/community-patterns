#!/usr/bin/env -S deno run --allow-all
/// <reference lib="deno.ns" />

/**
 * Pattern Launcher CLI
 * Quick interactive tool to deploy CommonTools patterns
 */

// ===== CONFIGURATION =====

// Get repo root (one level up from tools/)
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const CONFIG_FILE = `${REPO_ROOT}.launcher-config`;
const DEFAULT_LABS_DIR = `${REPO_ROOT}../labs`;
const IDENTITY_PATH = `${REPO_ROOT}claude.key`;

interface PatternRecord {
  path: string;
  lastUsed: string; // ISO timestamp
}

interface Config {
  lastSpace: string;
  labsDir?: string;  // Optional: override default labs location
  patterns: PatternRecord[];
}

// ===== UTILITY FUNCTIONS =====

async function loadConfig(): Promise<Config> {
  try {
    const content = await Deno.readTextFile(CONFIG_FILE);
    return JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid, return default
    return {
      lastSpace: "test-space",
      patterns: [],
    };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await Deno.writeTextFile(
    CONFIG_FILE,
    JSON.stringify(config, null, 2)
  );
}

function formatTimeSince(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

function getShortPath(absolutePath: string): string {
  // Try to make path relative to community-patterns
  const cwd = Deno.cwd();
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length + 1);
  }
  // Otherwise show just filename
  return absolutePath.split("/").pop() || absolutePath;
}

async function prompt(message: string, defaultValue?: string): Promise<string> {
  const displayDefault = defaultValue ? ` [${defaultValue}]` : "";
  console.log(`${message}${displayDefault}: `);

  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    return defaultValue || "";
  }

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input || defaultValue || "";
}

// ===== MAIN FUNCTIONS =====

async function promptForSpace(config: Config): Promise<string> {
  console.log("\n🚀 Pattern Launcher\n");
  const space = await prompt("Enter space name", config.lastSpace);
  return space;
}

async function selectPattern(config: Config): Promise<string | null> {
  console.log("\n📋 Select a pattern:\n");

  if (config.patterns.length > 0) {
    console.log("  [Recent Patterns]");
    config.patterns.slice(0, 10).forEach((p, i) => {
      const shortPath = getShortPath(p.path);
      const timeStr = formatTimeSince(p.lastUsed);
      console.log(`  ${i + 1}. ${shortPath} (${timeStr})`);
    });
    console.log();
  }

  console.log("  [Actions]");
  console.log("  b. Browse for a new pattern");
  console.log("  q. Quit\n");

  const choice = await prompt("Enter selection");

  if (choice.toLowerCase() === "q") {
    return null;
  }

  if (choice.toLowerCase() === "b") {
    return await browseForPattern();
  }

  // Try to parse as number
  const index = parseInt(choice, 10) - 1;
  if (index >= 0 && index < config.patterns.length) {
    return config.patterns[index].path;
  }

  console.log("❌ Invalid selection");
  return await selectPattern(config);
}

async function browseForPattern(): Promise<string | null> {
  // Start in the patterns directory
  const startDir = `${REPO_ROOT}patterns/`;
  return await navigateDirectory(startDir);
}

async function navigateDirectory(currentPath: string): Promise<string | null> {
  console.log(`\n📁 ${currentPath}\n`);

  // Read directory contents
  const entries: { name: string; isDir: boolean; isPattern: boolean }[] = [];

  try {
    for await (const entry of Deno.readDir(currentPath)) {
      const isPattern = entry.isFile && entry.name.endsWith(".tsx");
      // Show directories and .tsx files only
      if (entry.isDirectory || isPattern) {
        entries.push({
          name: entry.name,
          isDir: entry.isDirectory,
          isPattern,
        });
      }
    }
  } catch (error) {
    console.log(`❌ Cannot read directory: ${error.message}`);
    return null;
  }

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Display entries
  if (entries.length === 0) {
    console.log("  (no .tsx files or directories)\n");
  } else {
    entries.forEach((entry, i) => {
      const icon = entry.isDir ? "📁" : "📄";
      console.log(`  ${i + 1}. ${icon} ${entry.name}`);
    });
    console.log();
  }

  // Show options
  console.log("  [Actions]");
  if (currentPath !== "/") {
    console.log("  .. Go up one directory");
  }
  console.log("  p. Enter absolute path manually");
  console.log("  q. Cancel\n");

  const choice = await prompt("Enter selection");

  if (choice.toLowerCase() === "q") {
    return null;
  }

  if (choice.toLowerCase() === "p") {
    return await enterPathManually();
  }

  if (choice === "..") {
    // Go up one directory
    const parentPath = currentPath.split("/").slice(0, -2).join("/") + "/";
    if (parentPath.length > 0) {
      return await navigateDirectory(parentPath);
    }
    return await navigateDirectory("/");
  }

  // Try to parse as number
  const index = parseInt(choice, 10) - 1;
  if (index >= 0 && index < entries.length) {
    const selected = entries[index];
    const fullPath = `${currentPath}${selected.name}`;

    if (selected.isDir) {
      // Navigate into directory
      return await navigateDirectory(`${fullPath}/`);
    } else {
      // Selected a file
      return fullPath;
    }
  }

  console.log("❌ Invalid selection");
  return await navigateDirectory(currentPath);
}

async function enterPathManually(): Promise<string | null> {
  console.log("\n📁 Enter absolute path to pattern file:");
  const path = await prompt("Path");

  if (!path) {
    return null;
  }

  // Check if file exists
  try {
    const stat = await Deno.stat(path);
    if (!stat.isFile) {
      console.log("❌ Path is not a file");
      return await enterPathManually();
    }
    if (!path.endsWith(".tsx")) {
      console.log("⚠️  Warning: File doesn't end with .tsx");
    }
    return path;
  } catch {
    console.log("❌ File not found");
    return await enterPathManually();
  }
}

async function getLabsDir(config: Config): Promise<string> {
  // Use configured labs dir if available
  if (config.labsDir) {
    return config.labsDir;
  }

  // Try default location
  try {
    const stat = await Deno.stat(DEFAULT_LABS_DIR);
    if (stat.isDirectory) {
      return DEFAULT_LABS_DIR;
    }
  } catch {
    // Default doesn't exist
  }

  // Prompt user for labs location
  console.log("\n⚠️  Could not find labs directory at default location:");
  console.log(`   ${DEFAULT_LABS_DIR}`);
  console.log("\nPlease enter the path to your labs repository:");

  const labsPath = await prompt("Labs directory path");

  // Verify it exists
  try {
    const stat = await Deno.stat(labsPath);
    if (!stat.isDirectory) {
      console.log("❌ Not a directory");
      Deno.exit(1);
    }
    return labsPath;
  } catch {
    console.log("❌ Directory not found");
    Deno.exit(1);
  }
}

async function deployPattern(
  patternPath: string,
  space: string,
  isProd: boolean,
  labsDir: string
): Promise<boolean> {
  const apiUrl = isProd
    ? "https://api.commontools.io"
    : "http://localhost:8000";

  console.log("\n🚀 Deploying...");
  console.log(`  Pattern: ${getShortPath(patternPath)}`);
  console.log(`  Space: ${space}`);
  console.log(`  API: ${apiUrl}`);
  console.log(`  Identity: ${IDENTITY_PATH}\n`);

  // Set environment variables
  Deno.env.set("CT_IDENTITY", IDENTITY_PATH);
  Deno.env.set("CT_API_URL", apiUrl);

  // Run deployment command
  const command = new Deno.Command("deno", {
    args: [
      "task",
      "ct",
      "charm",
      "new",
      "--space",
      space,
      patternPath,
    ],
    cwd: labsDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();

  if (code === 0) {
    console.log("\n✅ Deployed successfully!");
    console.log(`   View at: ${apiUrl}/${space}/`);
    return true;
  } else {
    console.log("\n❌ Deployment failed");
    return false;
  }
}

function recordPatternUsage(config: Config, patternPath: string): Config {
  // Remove existing entry for this pattern
  const filtered = config.patterns.filter((p) => p.path !== patternPath);

  // Add to front with current timestamp
  filtered.unshift({
    path: patternPath,
    lastUsed: new Date().toISOString(),
  });

  // Keep only last 50
  config.patterns = filtered.slice(0, 50);

  return config;
}

// ===== MAIN =====

async function main() {
  const args = Deno.args;
  const isProd = args.includes("--prod");

  // Load config
  let config = await loadConfig();

  // Get labs directory (may prompt user if not configured)
  const labsDir = await getLabsDir(config);

  // Save labs dir to config if it was just determined
  if (!config.labsDir && labsDir !== DEFAULT_LABS_DIR) {
    config.labsDir = labsDir;
    await saveConfig(config);
  }

  // Prompt for space
  const space = await promptForSpace(config);
  if (!space) {
    console.log("❌ No space provided");
    Deno.exit(1);
  }

  // Select pattern
  const patternPath = await selectPattern(config);
  if (!patternPath) {
    console.log("👋 Cancelled");
    Deno.exit(0);
  }

  // Deploy
  const success = await deployPattern(patternPath, space, isProd, labsDir);

  if (success) {
    // Update config
    config.lastSpace = space;
    config = recordPatternUsage(config, patternPath);
    await saveConfig(config);

    console.log("\n✨ Done!");
  }

  // Wait for user to press enter
  console.log("\nPress Enter to exit...");
  await prompt("");
}

if (import.meta.main) {
  main();
}
