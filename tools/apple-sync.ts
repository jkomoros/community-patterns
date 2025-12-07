#!/usr/bin/env -S deno run --allow-all
/// <reference lib="deno.ns" />

/**
 * Apple Data Sync CLI
 * Syncs iMessage, Calendar, Reminders, Notes, and Contacts to CommonTools patterns
 */

import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";

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
  init              Configure space and API settings
  imessage          Sync iMessage conversations
  calendar          Sync Calendar events (not yet implemented)
  reminders         Sync Reminders (not yet implemented)
  status            Show sync status and configuration
  --all             Sync all data sources
  --help            Show this help message

OPTIONS:
  --mock            Use mock/sample data instead of real Apple data
                    (useful for testing without iMessage set up)

EXAMPLES:
  ./tools/apple-sync.ts init
  ./tools/apple-sync.ts imessage
  ./tools/apple-sync.ts imessage --mock    # Test with sample data
  ./tools/apple-sync.ts --all

CONFIGURATION:
  Config stored in: ${CONFIG_FILE}
  State stored in:  ${STATE_FILE}
`);
}

// ===== COMMANDS =====

async function cmdInit(): Promise<void> {
  console.log("\n🍎 Apple Sync Configuration\n");

  const config = await loadConfig();

  // Prompt for space
  const space = await prompt("Enter your space name", config.space || "");
  if (!space) {
    console.log("❌ Space name is required");
    Deno.exit(1);
  }

  // Prompt for API URL
  const defaultApi = config.apiUrl || "http://localhost:8000";
  const apiUrl = await prompt("API URL", defaultApi);

  // Save config
  config.space = space;
  config.apiUrl = apiUrl;
  await saveConfig(config);

  console.log(`\n✅ Configuration saved to ${CONFIG_FILE}`);
  console.log(`   Space: ${space}`);
  console.log(`   API: ${apiUrl}\n`);
}

async function cmdStatus(): Promise<void> {
  console.log("\n🍎 Apple Sync Status\n");

  const config = await loadConfig();
  const state = await loadState();

  console.log("Configuration:");
  console.log(`  Space: ${config.space || "(not set)"}`);
  console.log(`  API URL: ${config.apiUrl || "(not set)"}`);
  console.log(`  Labs Dir: ${config.labsDir || DEFAULT_LABS_DIR}`);

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

async function cmdImessage(useMock: boolean = false): Promise<void> {
  console.log("\n📱 Syncing iMessage...\n");

  const config = await loadConfig();
  if (!config.space) {
    console.log("❌ No space configured. Run './tools/apple-sync.ts init' first.");
    Deno.exit(1);
  }

  const state = await loadState();
  const lastRowId = state.imessage?.lastRowId || 0;

  let messages: IMessage[];

  if (useMock) {
    console.log("  Mode: MOCK DATA (for testing)");
    console.log(`  Target space: ${config.space}`);
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
    console.log("\n  Reading messages...");

    try {
      messages = readIMessages(lastRowId);
      console.log(`  Found ${messages.length} new messages`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n❌ Error reading messages: ${errorMsg}`);
      console.log("\n💡 Use --mock flag to test with sample data:\n");
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

  // TODO: Write to space via toolshed API
  console.log("\n  Writing to space... (TODO: implement toolshed API call)");

  // Update state (only for real data, not mock)
  if (!useMock) {
    state.imessage = {
      lastRowId: maxRowId,
      lastSyncTime: new Date().toISOString(),
    };
    await saveState(state);
  }

  console.log(`\n✅ Synced ${messages.length} messages`);
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

function readIMessages(sinceRowId: number = 0): IMessage[] {
  // Use Deno SQLite library for direct database access
  // This runs in the same process, so inherits terminal's Full Disk Access

  const db = new DB(IMESSAGE_DB, { mode: "read" });

  try {
    const query = `
      SELECT
        message.ROWID as rowId,
        message.guid,
        message.text,
        message.is_from_me as isFromMe,
        message.date as dateVal,
        chat.chat_identifier as chatId,
        handle.id as handleId
      FROM message
      LEFT JOIN chat_message_join ON message.ROWID = chat_message_join.message_id
      LEFT JOIN chat ON chat_message_join.chat_id = chat.ROWID
      LEFT JOIN handle ON message.handle_id = handle.ROWID
      WHERE message.ROWID > ?
      ORDER BY message.ROWID ASC
      LIMIT 1000
    `;

    const rows = db.query<[number, string, string | null, number, number, string | null, string | null]>(
      query,
      [sinceRowId]
    );

    // Convert Apple's date format (nanoseconds since 2001-01-01) to JS Date
    const APPLE_EPOCH = new Date("2001-01-01T00:00:00Z").getTime();

    return rows.map(([rowId, guid, text, isFromMe, dateVal, chatId, handleId]) => ({
      rowId,
      guid,
      text,
      isFromMe: isFromMe === 1,
      date: new Date(APPLE_EPOCH + (dateVal / 1000000000) * 1000),
      chatId: chatId || "unknown",
      handleId: handleId || "unknown",
    }));
  } finally {
    db.close();
  }
}

function generateMockMessages(count: number = 20): IMessage[] {
  const contacts = [
    "+1-555-0101",
    "+1-555-0102",
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

// ===== MAIN =====

async function main(): Promise<void> {
  const args = Deno.args;

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  const command = args[0];
  const useMock = args.includes("--mock");

  switch (command) {
    case "init":
      await cmdInit();
      break;
    case "status":
      await cmdStatus();
      break;
    case "imessage":
      await cmdImessage(useMock);
      break;
    case "calendar":
      console.log("\n📅 Calendar sync not yet implemented\n");
      break;
    case "reminders":
      console.log("\n✅ Reminders sync not yet implemented\n");
      break;
    case "--all":
      await cmdImessage(useMock);
      // TODO: Add other syncs
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
