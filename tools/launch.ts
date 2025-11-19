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
  // Parse path to extract: filename, repo, username, WIP status
  // Example: /Users/alex/Code/community-patterns/patterns/jkomoros/WIP/cozy-poll.tsx
  // Result: "cozy-poll.tsx  (community-patterns/jkomoros/WIP)"

  const parts = absolutePath.split("/");
  const filename = parts[parts.length - 1];

  // Find the repo directory (look for common repo names)
  let repoIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (
      part === "labs" ||
      part === "recipes" ||
      part.startsWith("community-patterns")
    ) {
      repoIndex = i;
      break;
    }
  }

  if (repoIndex === -1) {
    // Can't determine repo structure, just return filename
    return filename;
  }

  const repo = parts[repoIndex];

  // Look for patterns directory after repo
  const patternsIndex = parts.indexOf("patterns", repoIndex);
  if (patternsIndex === -1 || patternsIndex + 1 >= parts.length) {
    // No patterns directory found, just return filename
    return filename;
  }

  // Username is right after patterns/
  const username = parts[patternsIndex + 1];

  // Check if WIP is in the path
  const isWIP = parts.includes("WIP");

  // Build the tag
  const tags = [repo, username];
  if (isWIP) {
    tags.push("WIP");
  }

  return `${filename}  (${tags.join("/")})`;
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

// ANSI escape codes
const CURSOR_UP = "\x1b[A";
const CURSOR_DOWN = "\x1b[B";
const CLEAR_LINE = "\x1b[2K";
const CURSOR_TO_START = "\x1b[0G";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

interface SelectOption {
  label: string;
  value: string;
  icon?: string;
}

async function interactiveSelect(
  options: SelectOption[],
  title?: string
): Promise<string | null> {
  if (options.length === 0) {
    return null;
  }

  if (title) {
    console.log(`\n${title}\n`);
  }

  let selectedIndex = 0;

  // Enable raw mode to capture arrow keys
  Deno.stdin.setRaw(true);

  // Hide cursor
  await Deno.stdout.write(new TextEncoder().encode(HIDE_CURSOR));

  // Initial render
  const renderOptions = () => {
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const icon = option.icon || "";
      const prefix = i === selectedIndex ? "→ " : "  ";
      const style = i === selectedIndex ? "\x1b[7m" : ""; // Reverse video for selected
      const reset = i === selectedIndex ? "\x1b[0m" : "";

      console.log(`${prefix}${style}${icon}${option.label}${reset}`);
    }
  };

  renderOptions();

  // Listen for input
  const buf = new Uint8Array(3);

  while (true) {
    const n = await Deno.stdin.read(buf);

    if (n === null) break;

    const input = buf.slice(0, n);

    // Check for arrow keys
    if (input[0] === 0x1b && input[1] === 0x5b) {
      // Move cursor up to start of list
      for (let i = 0; i < options.length; i++) {
        await Deno.stdout.write(new TextEncoder().encode(CURSOR_UP));
      }

      if (input[2] === 0x41) {
        // Up arrow
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      } else if (input[2] === 0x42) {
        // Down arrow
        selectedIndex = (selectedIndex + 1) % options.length;
      }

      // Clear all lines
      for (let i = 0; i < options.length; i++) {
        await Deno.stdout.write(new TextEncoder().encode(CLEAR_LINE + CURSOR_TO_START));
        if (i < options.length - 1) {
          await Deno.stdout.write(new TextEncoder().encode(CURSOR_DOWN));
        }
      }

      // Move back to start
      for (let i = 0; i < options.length - 1; i++) {
        await Deno.stdout.write(new TextEncoder().encode(CURSOR_UP));
      }
      await Deno.stdout.write(new TextEncoder().encode(CURSOR_TO_START));

      // Re-render
      renderOptions();
    } else if (input[0] === 0x0d || input[0] === 0x0a) {
      // Enter key
      Deno.stdin.setRaw(false);
      await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
      return options[selectedIndex].value;
    } else if (input[0] === 0x71 || input[0] === 0x51) {
      // 'q' or 'Q' key
      Deno.stdin.setRaw(false);
      await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
      return null;
    } else if (input[0] === 0x03) {
      // Ctrl-C
      Deno.stdin.setRaw(false);
      await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR + "\n"));
      console.log("\n👋 Cancelled");
      Deno.exit(0);
    }
  }

  Deno.stdin.setRaw(false);
  await Deno.stdout.write(new TextEncoder().encode(SHOW_CURSOR));
  return null;
}

// ===== MAIN FUNCTIONS =====

async function promptForSpace(config: Config): Promise<string> {
  const options: SelectOption[] = [];

  // Add last used space if available
  if (config.lastSpace) {
    options.push({
      label: `${config.lastSpace} (last used)`,
      value: config.lastSpace,
      icon: "🔄 ",
    });

    // Generate incremented space name
    const nextSpace = getNextSpaceName(config.lastSpace);
    options.push({
      label: `${nextSpace} (next)`,
      value: nextSpace,
      icon: "➡️  ",
    });
  }

  // Add "new space" option
  options.push({
    label: "Enter new space name...",
    value: "__new__",
    icon: "✨ ",
  });

  const selection = await interactiveSelect(
    options,
    "🚀 Pattern Launcher\n\nSelect space (↑/↓ to move, Enter to select):"
  );

  if (selection === "__new__") {
    return await prompt("Enter space name", config.lastSpace || "test-space");
  }

  return selection || config.lastSpace || "test-space";
}

function getNextSpaceName(lastSpace: string): string {
  // Check if the space ends with "-<number>"
  const match = lastSpace.match(/^(.+)-(\d+)$/);

  if (match) {
    // Has a trailing number, increment it
    // e.g., "alex-1119-1" → "alex-1119-2"
    const base = match[1];
    const num = parseInt(match[2], 10);
    return `${base}-${num + 1}`;
  } else {
    // No trailing number, append "-1"
    // e.g., "alex-1119" → "alex-1119-1"
    return `${lastSpace}-1`;
  }
}

async function selectPattern(config: Config): Promise<string | null> {
  const options: SelectOption[] = [];

  // Add recent patterns
  if (config.patterns.length > 0) {
    config.patterns.slice(0, 10).forEach((p) => {
      const shortPath = getShortPath(p.path);
      const timeStr = formatTimeSince(p.lastUsed);
      options.push({
        label: `${shortPath} (${timeStr})`,
        value: p.path,
        icon: "📄 ",
      });
    });
  }

  // Add browse action
  options.push({
    label: "Browse for a new pattern...",
    value: "__browse__",
    icon: "📁 ",
  });

  const selection = await interactiveSelect(
    options,
    "📋 Select a pattern (↑/↓ to move, Enter to select, Q to quit):"
  );

  if (selection === "__browse__") {
    return await browseForPattern();
  }

  return selection;
}

async function browseForPattern(): Promise<string | null> {
  // Start in the patterns directory
  const startDir = `${REPO_ROOT}patterns/`;
  return await navigateDirectory(startDir);
}

async function navigateDirectory(currentPath: string): Promise<string | null> {
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

  // Build options for interactive selection
  const options: SelectOption[] = [];

  // Add entries
  entries.forEach((entry) => {
    const icon = entry.isDir ? "📁 " : "📄 ";
    options.push({
      label: entry.name,
      value: entry.name,
      icon,
    });
  });

  // Add navigation actions
  if (currentPath !== "/") {
    options.push({
      label: ".. (Go up one directory)",
      value: "__up__",
      icon: "⬆️  ",
    });
  }
  options.push({
    label: "Enter absolute path manually...",
    value: "__manual__",
    icon: "✏️  ",
  });

  const title = `📁 ${currentPath}\n(↑/↓ to move, Enter to select, Q to cancel)`;
  const selection = await interactiveSelect(options, title);

  if (selection === null) {
    return null;
  }

  if (selection === "__up__") {
    // Go up one directory
    const parentPath = currentPath.split("/").slice(0, -2).join("/") + "/";
    if (parentPath.length > 0) {
      return await navigateDirectory(parentPath);
    }
    return await navigateDirectory("/");
  }

  if (selection === "__manual__") {
    return await enterPathManually();
  }

  // Check if it's a directory or file
  const selectedEntry = entries.find((e) => e.name === selection);
  if (!selectedEntry) return null;

  const fullPath = `${currentPath}${selectedEntry.name}`;

  if (selectedEntry.isDir) {
    // Navigate into directory
    return await navigateDirectory(`${fullPath}/`);
  } else {
    // Selected a file
    return fullPath;
  }
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
): Promise<string | null> {
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

  // Run deployment command - capture output to extract charm ID
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
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  // Stream output in real-time
  const output = new TextDecoder().decode(stdout);
  const errorOutput = new TextDecoder().decode(stderr);

  if (output) console.log(output);
  if (errorOutput) console.error(errorOutput);

  if (code === 0) {
    // Extract charm ID from output
    // Looking for pattern like: "Created charm: <charm-id>" or charm ID in URL
    const charmIdMatch = output.match(/Created charm[:\s]+([a-f0-9-]+)/i) ||
                         output.match(/charm[\/\s]+([a-f0-9-]{36})/i) ||
                         output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);

    const charmId = charmIdMatch ? charmIdMatch[1] : null;

    if (charmId) {
      const fullUrl = `${apiUrl}/${space}/${charmId}`;
      console.log("\n✅ Deployed successfully!");
      console.log(`\n🔗 ${fullUrl}\n`);
      return charmId;
    } else {
      console.log("\n✅ Deployed successfully!");
      console.log(`   View at: ${apiUrl}/${space}/`);
      console.log("   (Could not extract charm ID from output)\n");
      return "success";
    }
  } else {
    console.log("\n❌ Deployment failed");
    return null;
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
  const result = await deployPattern(patternPath, space, isProd, labsDir);

  if (result) {
    // Update config
    config.lastSpace = space;
    config = recordPatternUsage(config, patternPath);
    await saveConfig(config);
  } else {
    // Deployment failed
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
