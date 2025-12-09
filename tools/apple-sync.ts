#!/usr/bin/env -S deno run --allow-all
/// <reference lib="deno.ns" />

/**
 * Apple Data Sync CLI
 * Syncs iMessage, Calendar, Reminders, Notes, and Contacts to CommonTools patterns
 */

// Note: We use the system sqlite3 CLI instead of Deno SQLite library
// because the iMessage database uses WAL mode which the Deno library doesn't handle well

// ===== CONFIGURATION =====

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const CONFIG_FILE = `${REPO_ROOT}.apple-sync-config`;
const STATE_FILE = `${REPO_ROOT}.apple-sync-state`;
const DEFAULT_LABS_DIR = `${REPO_ROOT}../labs`;
const IDENTITY_PATH = `${REPO_ROOT}claude.key`;

// Apple data locations
const IMESSAGE_DB = `${Deno.env.get("HOME")}/Library/Messages/chat.db`;
const CALENDAR_DB_LEGACY = `${Deno.env.get("HOME")}/Library/Calendars/Calendar.sqlitedb`;
const CALENDAR_DB_MODERN = `${Deno.env.get("HOME")}/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb`;
const NOTES_DB = `${Deno.env.get("HOME")}/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite`;

interface Config {
  space?: string;
  apiUrl?: string;
  labsDir?: string;
  charms?: {
    imessage?: string; // Charm ID for iMessage viewer
    calendar?: string; // Charm ID for calendar viewer
    reminders?: string; // Charm ID for reminders viewer
    notes?: string; // Charm ID for notes viewer
  };
}

interface SyncState {
  imessage?: {
    lastRowId?: number;
    lastSyncTime?: string;
  };
  calendar?: {
    lastSyncTime?: string;
  };
  reminders?: {
    lastSyncTime?: string;
  };
  notes?: {
    lastSyncTime?: string;
  };
}

// ===== UTILITY FUNCTIONS =====

async function loadConfig(): Promise<Config> {
  try {
    const content = await Deno.readTextFile(CONFIG_FILE);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveConfig(config: Config): Promise<void> {
  await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function loadState(): Promise<SyncState> {
  try {
    const content = await Deno.readTextFile(STATE_FILE);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveState(state: SyncState): Promise<void> {
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function prompt(message: string, defaultValue?: string): Promise<string> {
  const displayDefault = defaultValue ? ` [${defaultValue}]` : "";
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(`${message}${displayDefault}: `));

  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    return defaultValue || "";
  }

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input || defaultValue || "";
}

function printHelp(): void {
  console.log(`
Apple Data Sync CLI
Syncs Apple data (iMessage, Calendar, etc.) to CommonTools patterns

USAGE:
  ./tools/apple-sync.ts <command> [options]

COMMANDS:
  imessage          Sync iMessage conversations
  calendar          Sync Calendar events
  reminders         Sync Reminders
  notes             Sync Notes
  status            Show sync status and configuration
  --all             Sync all data sources
  --help            Show this help message

OPTIONS:
  --space <name>    Specify space name (saved for future runs)
  --mock            Use mock/sample data instead of real Apple data
  --charm <id>      Override charm ID for this sync (optional - charms are auto-created)
  --daemon          Run in background daemon mode (syncs every 5 minutes)
  --interval <min>  Sync interval in minutes for daemon mode (default: 5)
  --days-back <n>   Days of history to sync for calendar (default: 30)

EXAMPLES:
  ./tools/apple-sync.ts --all                     # Prompts for space on first run
  ./tools/apple-sync.ts --all --space my-space    # Or specify space directly
  ./tools/apple-sync.ts imessage --mock           # Test with sample data
  ./tools/apple-sync.ts calendar                  # Sync just calendar
  ./tools/apple-sync.ts calendar --days-back 365  # Sync 1 year of calendar history
  ./tools/apple-sync.ts --all --daemon            # Run as background daemon
  ./tools/apple-sync.ts --all --daemon --interval 10  # Sync every 10 minutes

CONFIGURATION:
  Config stored in: ${CONFIG_FILE}
  State stored in:  ${STATE_FILE}
`);
}

// ===== CHARM READ/WRITE =====

// Pattern source paths (relative to repo root)
const PATTERN_PATHS: Record<string, string> = {
  imessage: "patterns/jkomoros/WIP/imessage-viewer.tsx",
  calendar: "patterns/jkomoros/calendar-viewer.tsx",
  reminders: "patterns/jkomoros/WIP/reminders-viewer.tsx",
  notes: "patterns/jkomoros/WIP/notes-viewer.tsx",
};

// Pattern name identifiers (used to find existing charms)
const PATTERN_NAMES: Record<string, string> = {
  imessage: "imessage-viewer",
  calendar: "calendar-viewer",
  reminders: "reminders-viewer",
  notes: "notes-viewer",
};

interface CharmInfo {
  id: string;
  name: string;
  sourceFile?: string;
}

interface CharmOptions {
  apiUrl: string;
  space: string;
  charmId: string;
  path: string;
}

interface WriteToCharmOptions extends CharmOptions {
  data: unknown;
}

/**
 * List all charms in a space
 */
async function listCharmsInSpace(apiUrl: string, space: string): Promise<CharmInfo[]> {
  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "ls",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    // Empty space or no charms is not an error
    if (stderr.includes("No charms") || stderr.includes("empty")) {
      return [];
    }
    throw new Error(`Failed to list charms: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  if (!stdout) {
    return [];
  }

  // Parse the output - each line is a charm ID
  const charms: CharmInfo[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && trimmed.startsWith("baedrei")) {
      charms.push({ id: trimmed, name: "" });
    }
  }

  return charms;
}

/**
 * Check if a charm is valid (has source cell)
 * Returns false only if charm is definitely invalid (missing source cell)
 * Returns true for other errors (assume charm might be valid, let it fail later if not)
 */
async function isCharmValid(apiUrl: string, space: string, charmId: string): Promise<boolean> {
  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  // Try to get the sourceFile - this will fail if charm is invalid
  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "get",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
      "--charm", charmId,
      "sourceFile",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();
  const stderr = new TextDecoder().decode(output.stderr);

  // Only return false for known "charm is invalid" error patterns
  if (stderr.includes("missing source cell") || stderr.includes("missing recipe")) {
    return false;
  }

  // For other errors or success, assume charm is valid
  // (will fail later with a proper error message if not)
  return true;
}

/**
 * Get charm metadata to find its source file name
 */
async function getCharmSourceFile(apiUrl: string, space: string, charmId: string): Promise<string | null> {
  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  // Try to get the source file from charm metadata
  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "get",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
      "--charm", charmId,
      "sourceFile",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    return null;
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  if (!stdout || stdout === "null" || stdout === "undefined") {
    return null;
  }

  // Remove quotes if present
  return stdout.replace(/^"|"$/g, "");
}

/**
 * Find an existing charm by pattern name in a space
 */
async function findCharmByPattern(
  apiUrl: string,
  space: string,
  patternType: keyof typeof PATTERN_NAMES
): Promise<string | null> {
  const targetName = PATTERN_NAMES[patternType];
  const charms = await listCharmsInSpace(apiUrl, space);

  for (const charm of charms) {
    const sourceFile = await getCharmSourceFile(apiUrl, space, charm.id);
    if (sourceFile && sourceFile.includes(targetName)) {
      return charm.id;
    }
  }

  return null;
}

/**
 * Create a new charm from a pattern file
 */
async function createCharm(
  apiUrl: string,
  space: string,
  patternType: keyof typeof PATTERN_PATHS
): Promise<string> {
  const patternPath = `${REPO_ROOT}${PATTERN_PATHS[patternType]}`;
  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  console.log(`  Creating new ${patternType} charm...`);

  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "new",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
      patternPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to create charm: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  // The charm ID is the last line that starts with "baedrei"
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("baedrei")) {
      console.log(`  ✓ Created charm: ${line.substring(0, 20)}...`);
      return line;
    }
  }

  throw new Error(`Could not find charm ID in output: ${stdout}`);
}

/**
 * Get or create a charm for a pattern type
 * First checks if one exists in the space, if not creates it
 */
async function getOrCreateCharm(
  apiUrl: string,
  space: string,
  patternType: keyof typeof PATTERN_PATHS,
  config: Config
): Promise<string> {
  // First check if we have it in config
  const configCharmId = config.charms?.[patternType as keyof typeof config.charms];
  if (configCharmId) {
    // Validate the cached charm is still valid
    console.log(`  Validating cached ${patternType} charm...`);
    if (await isCharmValid(apiUrl, space, configCharmId)) {
      console.log(`  ✓ Cached charm is valid`);
      return configCharmId;
    }
    // Cached charm is invalid - clear it from config
    console.log(`  ⚠️  Cached charm is invalid (missing source cell), will create new one`);
    delete (config.charms as Record<string, string>)[patternType];
    await saveConfig(config);
  }

  // Try to find existing charm in space
  console.log(`  Looking for existing ${patternType} charm...`);
  const existingCharmId = await findCharmByPattern(apiUrl, space, patternType);
  if (existingCharmId) {
    console.log(`  ✓ Found existing charm: ${existingCharmId.substring(0, 20)}...`);
    // Save to config for future use
    config.charms = config.charms || {};
    (config.charms as Record<string, string>)[patternType] = existingCharmId;
    await saveConfig(config);
    return existingCharmId;
  }

  // Create new charm
  const newCharmId = await createCharm(apiUrl, space, patternType);
  // Save to config
  config.charms = config.charms || {};
  (config.charms as Record<string, string>)[patternType] = newCharmId;
  await saveConfig(config);
  return newCharmId;
}

async function readFromCharm<T>(options: CharmOptions): Promise<T | null> {
  const { apiUrl, space, charmId, path } = options;

  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "get",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
      "--charm", charmId,
      "--input",
      path,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    // If charm has no data yet, return null instead of error
    const stderr = new TextDecoder().decode(output.stderr);
    if (stderr.includes("undefined") || stderr.includes("null")) {
      return null;
    }
    throw new Error(`Failed to read from charm: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  if (!stdout || stdout === "null" || stdout === "undefined") {
    return null;
  }

  try {
    return JSON.parse(stdout) as T;
  } catch {
    return null;
  }
}

async function writeToCharm(options: WriteToCharmOptions): Promise<void> {
  const { apiUrl, space, charmId, path, data } = options;

  // Use deno task ct charm set to write to the charm
  const labsDir = DEFAULT_LABS_DIR;
  const denoJson = `${labsDir}/deno.json`;

  // Prepare the JSON data
  const jsonData = JSON.stringify(data);

  // Build the command
  const command = new Deno.Command("deno", {
    args: [
      "task",
      "--config", denoJson,
      "ct", "charm", "set",
      "--api-url", apiUrl,
      "--identity", IDENTITY_PATH,
      "--space", space,
      "--charm", charmId,
      "--input",
      path,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Write JSON to stdin
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(jsonData));
  await writer.close();

  const output = await process.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to write to charm: ${stderr}`);
  }
}

// ===== COMMANDS =====

async function cmdStatus(): Promise<void> {
  console.log("\n🍎 Apple Sync Status\n");

  const config = await loadConfig();
  const state = await loadState();

  console.log("Configuration:");
  console.log(`  Space: ${config.space || "(not set)"}`);
  console.log(`  API URL: ${config.apiUrl || "(not set)"}`);
  console.log(`  Labs Dir: ${config.labsDir || DEFAULT_LABS_DIR}`);
  console.log("\nCharm IDs:");
  console.log(`  iMessage: ${config.charms?.imessage || "(not set)"}`);
  console.log(`  Calendar: ${config.charms?.calendar || "(not set)"}`);
  console.log(`  Reminders: ${config.charms?.reminders || "(not set)"}`);
  console.log(`  Notes: ${config.charms?.notes || "(not set)"}`);

  console.log("\nSync State:");
  if (state.imessage?.lastSyncTime) {
    console.log(`  iMessage: Last synced ${state.imessage.lastSyncTime}`);
    console.log(`            Last Row ID: ${state.imessage.lastRowId}`);
  } else {
    console.log("  iMessage: Never synced");
  }

  if (state.calendar?.lastSyncTime) {
    console.log(`  Calendar: Last synced ${state.calendar.lastSyncTime}`);
  } else {
    console.log("  Calendar: Never synced");
  }

  if (state.reminders?.lastSyncTime) {
    console.log(`  Reminders: Last synced ${state.reminders.lastSyncTime}`);
  } else {
    console.log("  Reminders: Never synced");
  }

  if (state.notes?.lastSyncTime) {
    console.log(`  Notes: Last synced ${state.notes.lastSyncTime}`);
  } else {
    console.log("  Notes: Never synced");
  }

  console.log("\nData Sources:");

  // Check iMessage DB
  try {
    await Deno.stat(IMESSAGE_DB);
    console.log(`  ✅ iMessage: ${IMESSAGE_DB}`);
  } catch {
    console.log(`  ❌ iMessage: ${IMESSAGE_DB} (not found or no access)`);
  }

  // Check Calendar DB
  let calendarFound = false;
  try {
    await Deno.stat(CALENDAR_DB_MODERN);
    console.log(`  ✅ Calendar: ${CALENDAR_DB_MODERN}`);
    calendarFound = true;
  } catch {
    try {
      await Deno.stat(CALENDAR_DB_LEGACY);
      console.log(`  ✅ Calendar: ${CALENDAR_DB_LEGACY}`);
      calendarFound = true;
    } catch {
      // Neither found
    }
  }
  if (!calendarFound) {
    console.log(`  ❌ Calendar: Not found (checked both legacy and modern paths)`);
  }

  // Check Notes DB
  try {
    await Deno.stat(NOTES_DB);
    console.log(`  ✅ Notes: ${NOTES_DB}`);
  } catch {
    console.log(`  ❌ Notes: ${NOTES_DB} (not found or no access)`);
  }

  console.log("");
}

async function cmdImessage(useMock: boolean = false, overrideCharmId?: string): Promise<void> {
  console.log("\n📱 Syncing iMessage...\n");

  const config = await loadConfig();
  const apiUrl = config.apiUrl || "http://localhost:8000";

  // Get charm ID from override, or validate/create
  let charmId: string;
  if (overrideCharmId) {
    // User explicitly provided a charm ID - use it
    charmId = overrideCharmId;
  } else {
    // Get or create charm (validates cached charms)
    charmId = await getOrCreateCharm(apiUrl, config.space!, "imessage", config);
  }

  const state = await loadState();
  const lastRowId = state.imessage?.lastRowId || 0;

  let messages: IMessage[];

  if (useMock) {
    console.log("  Mode: MOCK DATA (for testing)");
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Generating mock messages...");
    messages = generateMockMessages(20);
    console.log(`  Generated ${messages.length} mock messages`);
  } else {
    // Check if database exists
    try {
      await Deno.stat(IMESSAGE_DB);
    } catch {
      console.log(`❌ Cannot access iMessage database at: ${IMESSAGE_DB}`);
      console.log("\n💡 Tips:");
      console.log("   1. Make sure iMessage is set up on this Mac");
      console.log("   2. Grant Full Disk Access to your terminal:");
      console.log("      System Settings > Privacy & Security > Full Disk Access");
      console.log("   3. Use --mock flag to test with sample data:\n");
      console.log("      ./tools/apple-sync.ts imessage --mock\n");
      Deno.exit(1);
    }

    console.log(`  Database: ${IMESSAGE_DB}`);
    console.log(`  Last synced row ID: ${lastRowId}`);
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Reading messages...");

    try {
      messages = await readIMessages(lastRowId);
      console.log(`  Found ${messages.length} new messages`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n❌ Error reading messages: ${errorMsg}`);

      // Check for permission error
      if (errorMsg.includes("Operation not permitted") || errorMsg.includes("os error 1")) {
        console.log("\n🔒 This is a macOS permission issue. To fix it:\n");
        console.log("   1. Open System Settings (or System Preferences)");
        console.log("   2. Go to Privacy & Security → Full Disk Access");
        console.log("   3. Click the + button and add your terminal app:");
        console.log("      • Terminal.app (in /Applications/Utilities/)");
        console.log("      • iTerm (if using iTerm)");
        console.log("      • Visual Studio Code (if running from VS Code terminal)");
        console.log("   4. Restart your terminal after granting access");
        console.log("\n   Then run this command again.\n");
      }

      console.log("💡 To test with sample data instead, use --mock:\n");
      console.log("   ./tools/apple-sync.ts imessage --mock\n");
      Deno.exit(1);
    }
  }

  if (messages.length === 0) {
    console.log("\n✅ Already up to date!\n");
    return;
  }

  // Find the max row ID for next sync
  const maxRowId = Math.max(...messages.map(m => m.rowId));

  // Show sample of messages
  console.log("\n  Sample messages:");
  for (const msg of messages.slice(0, 5)) {
    const direction = msg.isFromMe ? "→" : "←";
    const preview = (msg.text || "(no text)").substring(0, 40);
    console.log(`    ${direction} ${msg.handleId}: ${preview}`);
  }
  if (messages.length > 5) {
    console.log(`    ... and ${messages.length - 5} more`);
  }

  // Convert messages to format expected by the pattern
  // The pattern expects Message[] with date as ISO string
  const newMessagesForCharm = messages.map(msg => ({
    rowId: msg.rowId,
    guid: msg.guid,
    text: msg.text,
    isFromMe: msg.isFromMe,
    date: msg.date.toISOString(),
    chatId: msg.chatId,
    handleId: msg.handleId,
  }));

  // Read existing messages from charm and merge
  console.log("\n  Reading existing messages from charm...");
  const charmConfig = {
    apiUrl: config.apiUrl || "http://localhost:8000",
    space: config.space,
    charmId: charmId,
    path: "messages",
  };

  interface CharmMessage {
    rowId: number;
    guid: string;
    text: string | null;
    isFromMe: boolean;
    date: string;
    chatId: string;
    handleId: string;
  }

  let existingMessages: CharmMessage[] = [];
  try {
    const existing = await readFromCharm<CharmMessage[]>(charmConfig);
    existingMessages = existing || [];
    console.log(`  Found ${existingMessages.length} existing messages`);
  } catch (error) {
    // If we can't read, assume empty - first sync
    console.log("  No existing messages (first sync)");
  }

  // Merge: dedupe by guid, keeping newest version
  const messagesByGuid = new Map<string, CharmMessage>();
  for (const msg of existingMessages) {
    if (msg && msg.guid) {
      messagesByGuid.set(msg.guid, msg);
    }
  }
  for (const msg of newMessagesForCharm) {
    if (msg && msg.guid) {
      messagesByGuid.set(msg.guid, msg);
    }
  }

  const mergedMessages = Array.from(messagesByGuid.values());
  // Sort by date
  mergedMessages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const newCount = mergedMessages.length - existingMessages.length;
  console.log(`  Merged: ${newCount} new messages added (${mergedMessages.length} total)`);

  // Write merged messages to charm
  console.log("\n  Writing to charm...");
  try {
    await writeToCharm({
      ...charmConfig,
      data: mergedMessages,
    });
    console.log("  ✓ Written to charm");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error writing to charm: ${errorMsg}`);
    Deno.exit(1);
  }

  // Update state (only for real data, not mock)
  if (!useMock) {
    state.imessage = {
      lastRowId: maxRowId,
      lastSyncTime: new Date().toISOString(),
    };
    await saveState(state);
  }

  console.log(`\n✅ Synced ${newCount} new messages (${mergedMessages.length} total)`);
  if (!useMock) {
    console.log(`   New last row ID: ${maxRowId}`);
  }
  console.log("");
}

// ===== IMESSAGE DATABASE =====

interface IMessage {
  rowId: number;
  guid: string;
  text: string | null;
  isFromMe: boolean;
  date: Date;
  chatId: string;
  handleId: string;
}

async function readIMessages(sinceRowId: number = 0): Promise<IMessage[]> {
  // Use system sqlite3 CLI because the Deno SQLite library doesn't handle
  // WAL-mode databases properly (gives "file is not a database" error)

  const query = `
    SELECT
      message.ROWID,
      message.guid,
      message.text,
      message.is_from_me,
      message.date,
      chat.chat_identifier,
      handle.id
    FROM message
    LEFT JOIN chat_message_join ON message.ROWID = chat_message_join.message_id
    LEFT JOIN chat ON chat_message_join.chat_id = chat.ROWID
    LEFT JOIN handle ON message.handle_id = handle.ROWID
    WHERE message.ROWID > ${sinceRowId}
    ORDER BY message.ROWID ASC
    LIMIT 1000
  `;

  const command = new Deno.Command("sqlite3", {
    args: [
      "-json",  // Output as JSON for easy parsing
      IMESSAGE_DB,
      query,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(stderr);
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  if (!stdout || stdout === "[]") {
    return [];
  }

  // Parse JSON output from sqlite3
  interface SqliteRow {
    ROWID: number;
    guid: string;
    text: string | null;
    is_from_me: number;
    date: number;
    chat_identifier: string | null;
    id: string | null;
  }

  const rows: SqliteRow[] = JSON.parse(stdout);

  // Convert Apple's date format (nanoseconds since 2001-01-01) to JS Date
  const APPLE_EPOCH = new Date("2001-01-01T00:00:00Z").getTime();

  return rows.map((row) => ({
    rowId: row.ROWID,
    guid: row.guid,
    text: row.text,
    isFromMe: row.is_from_me === 1,
    date: new Date(APPLE_EPOCH + (row.date / 1000000000) * 1000),
    chatId: row.chat_identifier || "unknown",
    handleId: row.id || "unknown",
  }));
}

function generateMockMessages(count: number = 20): IMessage[] {
  const contacts = [
    "+15551234567",  // Proper 11-digit phone format
    "+15559876543",
    "friend@example.com",
    "work@company.com",
  ];

  const sampleTexts = [
    "Hey, how's it going?",
    "Can you pick up some milk on the way home?",
    "Meeting moved to 3pm",
    "Thanks for lunch!",
    "Running late, be there in 10",
    "Did you see the game last night?",
    "Happy birthday! 🎉",
    "Call me when you get a chance",
    "Sounds good!",
    "👍",
    "lol",
    "On my way",
    "See you tomorrow",
    "Can't make it tonight, sorry",
    "Just finished the project",
  ];

  const messages: IMessage[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    const isFromMe = Math.random() > 0.5;
    const minutesAgo = Math.floor(Math.random() * 60 * 24 * 7); // Within last week

    messages.push({
      rowId: i + 1,
      guid: `mock-${i}-${Date.now()}`,
      text,
      isFromMe,
      date: new Date(now - minutesAgo * 60 * 1000),
      chatId: contact,
      handleId: contact,
    });
  }

  // Sort by date
  messages.sort((a, b) => a.date.getTime() - b.date.getTime());

  return messages;
}

// ===== CALENDAR =====

interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  notes: string | null;
  calendarName: string;
  isAllDay: boolean;
}

async function readCalendarEvents(daysAhead: number = 30, daysBack: number = 7): Promise<CalendarEvent[]> {
  // Use AppleScript to read calendar events
  // This is more reliable than parsing the Core Data SQLite format
  const script = `
    set startDate to (current date) - (${daysBack} * days)
    set endDate to (current date) + (${daysAhead} * days)
    set eventList to ""

    tell application "Calendar"
      set allCalendars to calendars
      repeat with cal in allCalendars
        set calName to name of cal
        set calEvents to (every event of cal whose start date >= startDate and start date <= endDate)
        repeat with evt in calEvents
          set evtId to uid of evt
          set evtTitle to summary of evt
          set evtStart to start date of evt
          set evtEnd to end date of evt
          set evtLoc to location of evt
          set evtNotes to description of evt
          set evtAllDay to allday event of evt

          -- Format as JSON-ish line
          set eventLine to "EVENT:" & evtId & "|" & evtTitle & "|" & (evtStart as «class isot» as string) & "|" & (evtEnd as «class isot» as string) & "|" & evtLoc & "|" & evtNotes & "|" & calName & "|" & evtAllDay
          set eventList to eventList & eventLine & linefeed
        end repeat
      end repeat
    end tell

    return eventList
  `;

  const command = new Deno.Command("osascript", {
    args: ["-e", script],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`AppleScript error: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout);
  const events: CalendarEvent[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("EVENT:")) continue;
    const parts = line.substring(6).split("|");
    if (parts.length < 8) continue;

    const [id, title, startStr, endStr, location, notes, calendarName, allDayStr] = parts;

    events.push({
      id,
      title,
      startDate: new Date(startStr),
      endDate: new Date(endStr),
      location: location && location !== "missing value" ? location : null,
      notes: notes && notes !== "missing value" ? notes : null,
      calendarName,
      isAllDay: allDayStr === "true",
    });
  }

  // Sort by start date
  events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return events;
}

function generateMockCalendarEvents(count: number = 15): CalendarEvent[] {
  const titles = [
    "Team Meeting",
    "Doctor Appointment",
    "Lunch with Sarah",
    "Project Review",
    "Dentist",
    "Birthday Party",
    "Conference Call",
    "Gym",
    "Coffee Chat",
    "Sprint Planning",
  ];

  const calendars = ["Work", "Personal", "Family"];
  const locations = [
    "Conference Room A",
    "123 Main St",
    "Zoom Meeting",
    null,
    "Office",
  ];

  const events: CalendarEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const daysOffset = Math.floor(Math.random() * 30) - 7; // -7 to +23 days
    const hour = 8 + Math.floor(Math.random() * 10); // 8am to 6pm
    const duration = [30, 60, 90, 120][Math.floor(Math.random() * 4)]; // 30min to 2hr
    const isAllDay = Math.random() < 0.1;

    const startDate = new Date(now + daysOffset * 24 * 60 * 60 * 1000);
    startDate.setHours(hour, 0, 0, 0);

    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    events.push({
      id: `mock-event-${i}-${Date.now()}`,
      title: titles[Math.floor(Math.random() * titles.length)],
      startDate: isAllDay ? new Date(startDate.setHours(0, 0, 0, 0)) : startDate,
      endDate: isAllDay ? new Date(endDate.setHours(23, 59, 59, 999)) : endDate,
      location: locations[Math.floor(Math.random() * locations.length)],
      notes: Math.random() < 0.3 ? "Some notes about this event" : null,
      calendarName: calendars[Math.floor(Math.random() * calendars.length)],
      isAllDay,
    });
  }

  events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return events;
}

async function cmdCalendar(useMock: boolean = false, overrideCharmId?: string, daysBack: number = 30): Promise<void> {
  console.log("\n📅 Syncing Calendar...\n");

  const config = await loadConfig();
  const apiUrl = config.apiUrl || "http://localhost:8000";

  // Get charm ID from override, or validate/create
  let charmId: string;
  if (overrideCharmId) {
    // User explicitly provided a charm ID - use it
    charmId = overrideCharmId;
  } else {
    // Get or create charm (validates cached charms)
    charmId = await getOrCreateCharm(apiUrl, config.space!, "calendar", config);
  }

  let events: CalendarEvent[];

  if (useMock) {
    console.log("  Mode: MOCK DATA (for testing)");
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Generating mock events...");
    events = generateMockCalendarEvents(15);
    console.log(`  Generated ${events.length} mock events`);
  } else {
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Reading calendar events via AppleScript...");

    try {
      events = await readCalendarEvents(30, daysBack);
      console.log(`  Found ${events.length} events (${daysBack} days back, 30 days ahead)`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n❌ Error reading calendar: ${errorMsg}`);
      console.log("\n💡 Tips:");
      console.log("   1. Make sure Calendar.app has events");
      console.log("   2. You may need to grant automation access:");
      console.log("      System Settings > Privacy > Automation");
      console.log("   3. Use --mock flag to test with sample data:\n");
      console.log("      ./tools/apple-sync.ts calendar --mock\n");
      Deno.exit(1);
    }
  }

  if (events.length === 0) {
    console.log("\n✅ No events found.\n");
    return;
  }

  // Show sample of events
  console.log("\n  Sample events:");
  for (const evt of events.slice(0, 5)) {
    const dateStr = evt.startDate.toLocaleDateString();
    console.log(`    📅 ${dateStr}: ${evt.title} (${evt.calendarName})`);
  }
  if (events.length > 5) {
    console.log(`    ... and ${events.length - 5} more`);
  }

  // Convert events to format for charm
  const newEventsForCharm = events.map(evt => ({
    id: evt.id,
    title: evt.title,
    startDate: evt.startDate.toISOString(),
    endDate: evt.endDate.toISOString(),
    location: evt.location,
    notes: evt.notes,
    calendarName: evt.calendarName,
    isAllDay: evt.isAllDay,
  }));

  // Read existing events from charm and merge
  console.log("\n  Reading existing events from charm...");
  const charmConfig = {
    apiUrl: config.apiUrl || "http://localhost:8000",
    space: config.space,
    charmId: charmId,
    path: "events",
  };

  interface CharmEvent {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    location: string | null;
    notes: string | null;
    calendarName: string;
    isAllDay: boolean;
  }

  let existingEvents: CharmEvent[] = [];
  try {
    const existing = await readFromCharm<CharmEvent[]>(charmConfig);
    existingEvents = existing || [];
    console.log(`  Found ${existingEvents.length} existing events`);
  } catch {
    console.log("  No existing events (first sync)");
  }

  // Merge: dedupe by id, new events overwrite old (they may be updated)
  const eventsById = new Map<string, CharmEvent>();
  for (const evt of existingEvents) {
    if (evt && evt.id) {
      eventsById.set(evt.id, evt);
    }
  }
  for (const evt of newEventsForCharm) {
    if (evt && evt.id) {
      eventsById.set(evt.id, evt);
    }
  }

  const mergedEvents = Array.from(eventsById.values());
  // Sort by start date
  mergedEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const newCount = mergedEvents.length - existingEvents.length;
  const updateInfo = newCount >= 0 ? `${newCount} new` : `${-newCount} removed`;
  console.log(`  Merged: ${updateInfo} (${mergedEvents.length} total)`);

  // Write merged events to charm
  console.log("\n  Writing to charm...");
  try {
    await writeToCharm({
      ...charmConfig,
      data: mergedEvents,
    });
    console.log("  ✓ Written to charm");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error writing to charm: ${errorMsg}`);
    Deno.exit(1);
  }

  // Update state
  const state = await loadState();
  state.calendar = {
    lastSyncTime: new Date().toISOString(),
  };
  await saveState(state);

  console.log(`\n✅ Synced calendar (${mergedEvents.length} total events)\n`);
}

// ===== REMINDERS =====

interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  dueDate: Date | null;
  isCompleted: boolean;
  completionDate: Date | null;
  priority: number; // 0 = none, 1-9 scale (1 = high, 5 = medium, 9 = low)
  listName: string;
}

async function readReminders(includeCompleted: boolean = false): Promise<Reminder[]> {
  // Use AppleScript to read reminders
  const completedFilter = includeCompleted ? "" : "whose completed is false";
  const script = `
    set reminderList to ""

    tell application "Reminders"
      set allLists to lists
      repeat with remindersList in allLists
        set listName to name of remindersList
        set theReminders to (every reminder of remindersList ${completedFilter})
        repeat with r in theReminders
          set rId to id of r
          set rTitle to name of r
          set rNotes to body of r
          set rCompleted to completed of r
          set rPriority to priority of r

          -- Handle dates carefully
          set rDueDate to "null"
          try
            set dd to due date of r
            if dd is not missing value then
              set rDueDate to (dd as «class isot» as string)
            end if
          end try

          set rCompletionDate to "null"
          try
            set cd to completion date of r
            if cd is not missing value then
              set rCompletionDate to (cd as «class isot» as string)
            end if
          end try

          -- Format as pipe-delimited line
          set reminderLine to "REMINDER:" & rId & "|" & rTitle & "|" & rNotes & "|" & rDueDate & "|" & rCompleted & "|" & rCompletionDate & "|" & rPriority & "|" & listName
          set reminderList to reminderList & reminderLine & linefeed
        end repeat
      end repeat
    end tell

    return reminderList
  `;

  const command = new Deno.Command("osascript", {
    args: ["-e", script],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`AppleScript error: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout);
  const reminders: Reminder[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("REMINDER:")) continue;
    const parts = line.substring(9).split("|");
    if (parts.length < 8) continue;

    const [id, title, notes, dueDateStr, completedStr, completionDateStr, priorityStr, listName] = parts;

    reminders.push({
      id,
      title,
      notes: notes && notes !== "missing value" ? notes : null,
      dueDate: dueDateStr && dueDateStr !== "null" && dueDateStr !== "missing value"
        ? new Date(dueDateStr)
        : null,
      isCompleted: completedStr === "true",
      completionDate: completionDateStr && completionDateStr !== "null" && completionDateStr !== "missing value"
        ? new Date(completionDateStr)
        : null,
      priority: parseInt(priorityStr) || 0,
      listName,
    });
  }

  // Sort by due date (null dates at end), then by priority
  reminders.sort((a, b) => {
    // Completed items at bottom
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    // Items with due dates first
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      const dateDiff = a.dueDate.getTime() - b.dueDate.getTime();
      if (dateDiff !== 0) return dateDiff;
    }
    // Then by priority (lower number = higher priority)
    if (a.priority !== b.priority) {
      if (a.priority === 0) return 1;
      if (b.priority === 0) return -1;
      return a.priority - b.priority;
    }
    return 0;
  });

  return reminders;
}

function generateMockReminders(count: number = 15): Reminder[] {
  const titles = [
    "Buy groceries",
    "Call mom",
    "Schedule dentist appointment",
    "Review quarterly report",
    "Send birthday card",
    "Pay electric bill",
    "Book flight tickets",
    "Pick up dry cleaning",
    "Renew gym membership",
    "Submit expense report",
    "Water plants",
    "Backup laptop",
  ];

  const lists = ["Personal", "Work", "Shopping", "Home"];
  const notes = [
    "Don't forget!",
    "Very important",
    null,
    null,
    "Check email for details",
    null,
  ];

  const reminders: Reminder[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const hasDueDate = Math.random() > 0.3;
    const daysOffset = Math.floor(Math.random() * 14) - 3; // -3 to +11 days
    const isCompleted = Math.random() < 0.2;
    const priority = Math.random() < 0.3 ? [1, 5, 9][Math.floor(Math.random() * 3)] : 0;

    let dueDate: Date | null = null;
    if (hasDueDate) {
      dueDate = new Date(now + daysOffset * 24 * 60 * 60 * 1000);
      dueDate.setHours(9, 0, 0, 0);
    }

    reminders.push({
      id: `mock-reminder-${i}-${Date.now()}`,
      title: titles[Math.floor(Math.random() * titles.length)],
      notes: notes[Math.floor(Math.random() * notes.length)],
      dueDate,
      isCompleted,
      completionDate: isCompleted ? new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000) : null,
      priority,
      listName: lists[Math.floor(Math.random() * lists.length)],
    });
  }

  // Sort same as real reminders
  reminders.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      const dateDiff = a.dueDate.getTime() - b.dueDate.getTime();
      if (dateDiff !== 0) return dateDiff;
    }
    if (a.priority !== b.priority) {
      if (a.priority === 0) return 1;
      if (b.priority === 0) return -1;
      return a.priority - b.priority;
    }
    return 0;
  });

  return reminders;
}

async function cmdReminders(useMock: boolean = false, overrideCharmId?: string): Promise<void> {
  console.log("\n✅ Syncing Reminders...\n");

  const config = await loadConfig();
  const apiUrl = config.apiUrl || "http://localhost:8000";

  // Get charm ID from override, or validate/create
  let charmId: string;
  if (overrideCharmId) {
    // User explicitly provided a charm ID - use it
    charmId = overrideCharmId;
  } else {
    // Get or create charm (validates cached charms)
    charmId = await getOrCreateCharm(apiUrl, config.space!, "reminders", config);
  }

  let reminders: Reminder[];

  if (useMock) {
    console.log("  Mode: MOCK DATA (for testing)");
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Generating mock reminders...");
    reminders = generateMockReminders(15);
    console.log(`  Generated ${reminders.length} mock reminders`);
  } else {
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Reading reminders via AppleScript...");

    try {
      reminders = await readReminders(false); // Don't include completed by default
      console.log(`  Found ${reminders.length} reminders`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n❌ Error reading reminders: ${errorMsg}`);
      console.log("\n💡 Tips:");
      console.log("   1. Make sure Reminders.app has items");
      console.log("   2. You may need to grant automation access:");
      console.log("      System Settings > Privacy > Automation");
      console.log("   3. Use --mock flag to test with sample data:\n");
      console.log("      ./tools/apple-sync.ts reminders --mock\n");
      Deno.exit(1);
    }
  }

  if (reminders.length === 0) {
    console.log("\n✅ No reminders found.\n");
    return;
  }

  // Show sample of reminders
  console.log("\n  Sample reminders:");
  for (const r of reminders.slice(0, 5)) {
    const dueDateStr = r.dueDate ? r.dueDate.toLocaleDateString() : "No date";
    const status = r.isCompleted ? "✓" : "○";
    console.log(`    ${status} ${r.title} (${r.listName}) - ${dueDateStr}`);
  }
  if (reminders.length > 5) {
    console.log(`    ... and ${reminders.length - 5} more`);
  }

  // Convert reminders to format for charm
  const newRemindersForCharm = reminders.map(r => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueDate: r.dueDate?.toISOString() || null,
    isCompleted: r.isCompleted,
    completionDate: r.completionDate?.toISOString() || null,
    priority: r.priority,
    listName: r.listName,
  }));

  // Read existing reminders from charm and merge
  console.log("\n  Reading existing reminders from charm...");
  const charmConfig = {
    apiUrl: config.apiUrl || "http://localhost:8000",
    space: config.space,
    charmId: charmId,
    path: "reminders",
  };

  interface CharmReminder {
    id: string;
    title: string;
    notes: string | null;
    dueDate: string | null;
    isCompleted: boolean;
    completionDate: string | null;
    priority: number;
    listName: string;
  }

  let existingReminders: CharmReminder[] = [];
  try {
    const existing = await readFromCharm<CharmReminder[]>(charmConfig);
    existingReminders = existing || [];
    console.log(`  Found ${existingReminders.length} existing reminders`);
  } catch {
    console.log("  No existing reminders (first sync)");
  }

  // Merge: dedupe by id, new reminders overwrite old (they may be updated/completed)
  const remindersById = new Map<string, CharmReminder>();
  for (const r of existingReminders) {
    if (r && r.id) {
      remindersById.set(r.id, r);
    }
  }
  for (const r of newRemindersForCharm) {
    if (r && r.id) {
      remindersById.set(r.id, r);
    }
  }

  const mergedReminders = Array.from(remindersById.values());
  // Sort: incomplete first, then by due date, then by priority
  mergedReminders.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (dateDiff !== 0) return dateDiff;
    }
    if (a.priority !== b.priority) {
      if (a.priority === 0) return 1;
      if (b.priority === 0) return -1;
      return a.priority - b.priority;
    }
    return 0;
  });

  const newCount = mergedReminders.length - existingReminders.length;
  const updateInfo = newCount >= 0 ? `${newCount} new` : `${-newCount} removed`;
  console.log(`  Merged: ${updateInfo} (${mergedReminders.length} total)`);

  // Write merged reminders to charm
  console.log("\n  Writing to charm...");
  try {
    await writeToCharm({
      ...charmConfig,
      data: mergedReminders,
    });
    console.log("  ✓ Written to charm");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error writing to charm: ${errorMsg}`);
    Deno.exit(1);
  }

  // Update state
  const state = await loadState();
  state.reminders = {
    lastSyncTime: new Date().toISOString(),
  };
  await saveState(state);

  console.log(`\n✅ Synced reminders (${mergedReminders.length} total)\n`);
}

// ===== NOTES =====

interface Note {
  id: string;
  title: string;
  body: string;
  creationDate: Date;
  modificationDate: Date;
  folderName: string;
}

async function readNotes(): Promise<Note[]> {
  // Use AppleScript to read notes
  const script = `
    set noteList to ""

    tell application "Notes"
      set allFolders to folders
      repeat with f in allFolders
        set folderName to name of f
        set theNotes to every note of f
        repeat with n in theNotes
          set nId to id of n
          set nTitle to name of n
          set nBody to plaintext of n
          set nCreated to creation date of n
          set nModified to modification date of n

          -- Replace pipe characters in body to avoid parsing issues
          set AppleScript's text item delimiters to "|"
          set bodyParts to text items of nBody
          set AppleScript's text item delimiters to "[PIPE]"
          set nBody to bodyParts as string
          set AppleScript's text item delimiters to ""

          -- Replace newlines in body
          set AppleScript's text item delimiters to (ASCII character 10)
          set bodyParts to text items of nBody
          set AppleScript's text item delimiters to "[NL]"
          set nBody to bodyParts as string
          set AppleScript's text item delimiters to ""

          set AppleScript's text item delimiters to (ASCII character 13)
          set bodyParts to text items of nBody
          set AppleScript's text item delimiters to "[NL]"
          set nBody to bodyParts as string
          set AppleScript's text item delimiters to ""

          -- Also handle title newlines
          set AppleScript's text item delimiters to (ASCII character 10)
          set titleParts to text items of nTitle
          set AppleScript's text item delimiters to " "
          set nTitle to titleParts as string
          set AppleScript's text item delimiters to ""

          -- Format as pipe-delimited line
          set noteLine to "NOTE:" & nId & "|" & nTitle & "|" & nBody & "|" & (nCreated as «class isot» as string) & "|" & (nModified as «class isot» as string) & "|" & folderName
          set noteList to noteList & noteLine & linefeed
        end repeat
      end repeat
    end tell

    return noteList
  `;

  const command = new Deno.Command("osascript", {
    args: ["-e", script],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`AppleScript error: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout);
  const notes: Note[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("NOTE:")) continue;
    const parts = line.substring(5).split("|");
    if (parts.length < 6) continue;

    const [id, title, body, createdStr, modifiedStr, folderName] = parts;

    // Restore newlines and pipes in body
    const restoredBody = body
      .replace(/\[NL\]/g, "\n")
      .replace(/\[PIPE\]/g, "|");

    notes.push({
      id,
      title,
      body: restoredBody,
      creationDate: new Date(createdStr),
      modificationDate: new Date(modifiedStr),
      folderName,
    });
  }

  // Sort by modification date (newest first)
  notes.sort((a, b) => b.modificationDate.getTime() - a.modificationDate.getTime());

  return notes;
}

function generateMockNotes(count: number = 12): Note[] {
  const titles = [
    "Meeting Notes",
    "Shopping List",
    "Recipe: Pasta",
    "Book Recommendations",
    "Project Ideas",
    "Travel Plans",
    "Gift Ideas",
    "Daily Journal",
    "Workout Routine",
    "Budget Notes",
    "Home Improvement",
    "Learning Goals",
  ];

  const folders = ["Notes", "Work", "Personal", "Archive"];

  const bodies = [
    "This is a sample note with some content.\n\nIt has multiple paragraphs.",
    "- Item 1\n- Item 2\n- Item 3",
    "Important reminder: Don't forget to follow up on this.",
    "Quick note to self about something I need to remember.",
    "Detailed notes from today's meeting:\n\n1. First topic discussed\n2. Second topic\n3. Action items",
  ];

  const notes: Note[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 60); // Within last 60 days
    const modDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const createDate = new Date(modDate.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);

    notes.push({
      id: `mock-note-${i}-${Date.now()}`,
      title: titles[Math.floor(Math.random() * titles.length)],
      body: bodies[Math.floor(Math.random() * bodies.length)],
      creationDate: createDate,
      modificationDate: modDate,
      folderName: folders[Math.floor(Math.random() * folders.length)],
    });
  }

  // Sort by modification date (newest first)
  notes.sort((a, b) => b.modificationDate.getTime() - a.modificationDate.getTime());

  return notes;
}

async function cmdNotes(useMock: boolean = false, overrideCharmId?: string): Promise<void> {
  console.log("\n📝 Syncing Notes...\n");

  const config = await loadConfig();
  const apiUrl = config.apiUrl || "http://localhost:8000";

  // Get charm ID from override, or validate/create
  let charmId: string;
  if (overrideCharmId) {
    // User explicitly provided a charm ID - use it
    charmId = overrideCharmId;
  } else {
    // Get or create charm (validates cached charms)
    charmId = await getOrCreateCharm(apiUrl, config.space!, "notes", config);
  }

  let notes: Note[];

  if (useMock) {
    console.log("  Mode: MOCK DATA (for testing)");
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Generating mock notes...");
    notes = generateMockNotes(12);
    console.log(`  Generated ${notes.length} mock notes`);
  } else {
    console.log(`  Target space: ${config.space}`);
    console.log(`  Target charm: ${charmId}`);
    console.log("\n  Reading notes via AppleScript...");

    try {
      notes = await readNotes();
      console.log(`  Found ${notes.length} notes`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n❌ Error reading notes: ${errorMsg}`);
      console.log("\n💡 Tips:");
      console.log("   1. Make sure Notes.app has notes");
      console.log("   2. You may need to grant automation access:");
      console.log("      System Settings > Privacy > Automation");
      console.log("   3. Use --mock flag to test with sample data:\n");
      console.log("      ./tools/apple-sync.ts notes --mock\n");
      Deno.exit(1);
    }
  }

  if (notes.length === 0) {
    console.log("\n✅ No notes found.\n");
    return;
  }

  // Show sample of notes
  console.log("\n  Sample notes:");
  for (const n of notes.slice(0, 5)) {
    const dateStr = n.modificationDate.toLocaleDateString();
    const preview = n.title.substring(0, 40);
    console.log(`    📝 ${preview} (${n.folderName}) - ${dateStr}`);
  }
  if (notes.length > 5) {
    console.log(`    ... and ${notes.length - 5} more`);
  }

  // Convert notes to format for charm
  const newNotesForCharm = notes.map(n => ({
    id: n.id,
    title: n.title,
    body: n.body,
    creationDate: n.creationDate.toISOString(),
    modificationDate: n.modificationDate.toISOString(),
    folderName: n.folderName,
  }));

  // Read existing notes from charm and merge
  console.log("\n  Reading existing notes from charm...");
  const charmConfig = {
    apiUrl: config.apiUrl || "http://localhost:8000",
    space: config.space,
    charmId: charmId,
    path: "notes",
  };

  interface CharmNote {
    id: string;
    title: string;
    body: string;
    creationDate: string;
    modificationDate: string;
    folderName: string;
  }

  let existingNotes: CharmNote[] = [];
  try {
    const existing = await readFromCharm<CharmNote[]>(charmConfig);
    existingNotes = existing || [];
    console.log(`  Found ${existingNotes.length} existing notes`);
  } catch {
    console.log("  No existing notes (first sync)");
  }

  // Merge: dedupe by id, keep the one with newer modificationDate
  const notesById = new Map<string, CharmNote>();
  for (const n of existingNotes) {
    if (n && n.id) {
      notesById.set(n.id, n);
    }
  }
  for (const n of newNotesForCharm) {
    if (n && n.id) {
      const existing = notesById.get(n.id);
      // Keep newer version based on modificationDate
      if (!existing || new Date(n.modificationDate) >= new Date(existing.modificationDate)) {
        notesById.set(n.id, n);
      }
    }
  }

  const mergedNotes = Array.from(notesById.values());
  // Sort by modification date (newest first)
  mergedNotes.sort((a, b) => new Date(b.modificationDate).getTime() - new Date(a.modificationDate).getTime());

  const newCount = mergedNotes.length - existingNotes.length;
  const updateInfo = newCount >= 0 ? `${newCount} new` : `${-newCount} removed`;
  console.log(`  Merged: ${updateInfo} (${mergedNotes.length} total)`);

  // Write merged notes to charm
  console.log("\n  Writing to charm...");
  try {
    await writeToCharm({
      ...charmConfig,
      data: mergedNotes,
    });
    console.log("  ✓ Written to charm");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ Error writing to charm: ${errorMsg}`);
    Deno.exit(1);
  }

  // Update state
  const state = await loadState();
  state.notes = {
    lastSyncTime: new Date().toISOString(),
  };
  await saveState(state);

  console.log(`\n✅ Synced notes (${mergedNotes.length} total)\n`);
}

// ===== MAIN =====

/**
 * Ensure we have a space configured, prompting if needed
 */
async function ensureSpace(overrideSpace?: string): Promise<void> {
  const config = await loadConfig();

  // If --space provided, save it
  if (overrideSpace) {
    config.space = overrideSpace;
    config.apiUrl = config.apiUrl || "http://localhost:8000";
    config.charms = config.charms || {};
    await saveConfig(config);
    console.log(`\n✅ Using space: ${overrideSpace}\n`);
    return;
  }

  // If already configured, we're good
  if (config.space) {
    return;
  }

  // Prompt for space name
  console.log("\n🍎 First-time setup\n");
  const space = await prompt("Enter your space name");
  if (!space) {
    console.log("❌ Space name is required");
    Deno.exit(1);
  }

  config.space = space;
  config.apiUrl = "http://localhost:8000";
  config.charms = {};
  await saveConfig(config);
  console.log(`\n✅ Configuration saved. Using space: ${space}\n`);
}

/**
 * Run a single sync cycle for specified sources
 */
async function runSyncCycle(
  sources: string[],
  useMock: boolean,
  overrideCharmId?: string,
  daysBack: number = 30
): Promise<void> {
  for (const source of sources) {
    try {
      switch (source) {
        case "imessage":
          await cmdImessage(useMock, overrideCharmId);
          break;
        case "calendar":
          await cmdCalendar(useMock, overrideCharmId, daysBack);
          break;
        case "reminders":
          await cmdReminders(useMock, overrideCharmId);
          break;
        case "notes":
          await cmdNotes(useMock, overrideCharmId);
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n⚠️  Error syncing ${source}: ${errorMsg}`);
      // Continue with other sources in daemon mode
    }
  }
}

/**
 * Run in daemon mode - sync on interval
 */
async function runDaemon(
  sources: string[],
  intervalMinutes: number,
  useMock: boolean,
  overrideCharmId?: string,
  daysBack: number = 30
): Promise<void> {
  console.log(`\n🔄 Starting daemon mode (syncing every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'})`);
  console.log(`   Sources: ${sources.join(", ")}`);
  console.log(`   Press Ctrl+C to stop\n`);

  // Run initial sync
  console.log(`\n━━━ Sync at ${new Date().toLocaleTimeString()} ━━━`);
  await runSyncCycle(sources, useMock, overrideCharmId, daysBack);

  // Set up interval
  const intervalMs = intervalMinutes * 60 * 1000;

  // Use setInterval for recurring syncs
  const intervalId = setInterval(async () => {
    console.log(`\n━━━ Sync at ${new Date().toLocaleTimeString()} ━━━`);
    await runSyncCycle(sources, useMock, overrideCharmId, daysBack);
  }, intervalMs);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("\n\n👋 Daemon stopped");
    clearInterval(intervalId);
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {}); // Never resolves - runs until killed
}

async function main(): Promise<void> {
  const args = Deno.args;

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  const command = args[0];
  const useMock = args.includes("--mock");
  const isDaemon = args.includes("--daemon");

  // Parse --charm argument
  const charmIndex = args.indexOf("--charm");
  const overrideCharmId = charmIndex !== -1 && args[charmIndex + 1]
    ? args[charmIndex + 1]
    : undefined;

  // Parse --space argument
  const spaceIndex = args.indexOf("--space");
  const overrideSpace = spaceIndex !== -1 && args[spaceIndex + 1]
    ? args[spaceIndex + 1]
    : undefined;

  // Parse --interval argument (default 5 minutes)
  const intervalIndex = args.indexOf("--interval");
  const intervalMinutes = intervalIndex !== -1 && args[intervalIndex + 1]
    ? parseInt(args[intervalIndex + 1]) || 5
    : 5;

  // Parse --days-back argument (default 30 days)
  const daysBackIndex = args.indexOf("--days-back");
  const daysBack = daysBackIndex !== -1 && args[daysBackIndex + 1]
    ? parseInt(args[daysBackIndex + 1]) || 30
    : 30;

  // Status doesn't need space setup
  if (command === "status") {
    await cmdStatus();
    return;
  }

  // Ensure space is configured before any sync command
  await ensureSpace(overrideSpace);

  // Determine which sources to sync
  let sources: string[] = [];
  switch (command) {
    case "status":
      // Already handled above
      return;
    case "imessage":
      sources = ["imessage"];
      break;
    case "calendar":
      sources = ["calendar"];
      break;
    case "reminders":
      sources = ["reminders"];
      break;
    case "notes":
      sources = ["notes"];
      break;
    case "--all":
      sources = ["imessage", "calendar", "reminders", "notes"];
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      Deno.exit(1);
  }

  // Run in daemon mode or single sync
  if (isDaemon) {
    await runDaemon(sources, intervalMinutes, useMock, overrideCharmId, daysBack);
  } else {
    await runSyncCycle(sources, useMock, overrideCharmId, daysBack);
  }
}

if (import.meta.main) {
  main();
}
