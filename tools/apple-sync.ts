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
  charms?: {
    imessage?: string; // Charm ID for iMessage viewer
    calendar?: string; // Charm ID for calendar viewer
    reminders?: string; // Charm ID for reminders viewer
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
  calendar          Sync Calendar events
  reminders         Sync Reminders (not yet implemented)
  status            Show sync status and configuration
  --all             Sync all data sources
  --help            Show this help message

OPTIONS:
  --mock            Use mock/sample data instead of real Apple data
                    (useful for testing without iMessage set up)
  --charm <id>      Override charm ID for this sync (use with imessage/calendar/reminders)

EXAMPLES:
  ./tools/apple-sync.ts init
  ./tools/apple-sync.ts imessage
  ./tools/apple-sync.ts imessage --mock    # Test with sample data
  ./tools/apple-sync.ts imessage --charm baed...xyz  # Specify charm ID
  ./tools/apple-sync.ts --all

CONFIGURATION:
  Config stored in: ${CONFIG_FILE}
  State stored in:  ${STATE_FILE}
`);
}

// ===== CHARM READ/WRITE =====

interface CharmOptions {
  apiUrl: string;
  space: string;
  charmId: string;
  path: string;
}

interface WriteToCharmOptions extends CharmOptions {
  data: unknown;
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

  // Prompt for charm IDs
  console.log("\nCharm IDs (leave blank to skip):");
  console.log("  Deploy a pattern first, then copy its charm ID here.");
  console.log("  Example: baedreibive33kcfxiweainjam2anrs5jxwiem4qwnemlumlyjlz63qtn6i\n");

  const imessageCharm = await prompt(
    "  iMessage viewer charm ID",
    config.charms?.imessage || ""
  );

  const calendarCharm = await prompt(
    "  Calendar viewer charm ID",
    config.charms?.calendar || ""
  );

  // Save config
  config.space = space;
  config.apiUrl = apiUrl;
  config.charms = {
    imessage: imessageCharm || undefined,
    calendar: calendarCharm || undefined,
    reminders: config.charms?.reminders,
  };
  await saveConfig(config);

  console.log(`\n✅ Configuration saved to ${CONFIG_FILE}`);
  console.log(`   Space: ${space}`);
  console.log(`   API: ${apiUrl}`);
  if (imessageCharm) {
    console.log(`   iMessage charm: ${imessageCharm}`);
  }
  if (calendarCharm) {
    console.log(`   Calendar charm: ${calendarCharm}`);
  }
  console.log("");
}

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

async function cmdImessage(useMock: boolean = false, overrideCharmId?: string): Promise<void> {
  console.log("\n📱 Syncing iMessage...\n");

  const config = await loadConfig();
  if (!config.space) {
    console.log("❌ No space configured. Run './tools/apple-sync.ts init' first.");
    Deno.exit(1);
  }

  // Get charm ID from override, config, or prompt
  const charmId = overrideCharmId || config.charms?.imessage;
  if (!charmId) {
    console.log("❌ No iMessage charm ID configured.");
    console.log("   Either run './tools/apple-sync.ts init' to configure it,");
    console.log("   or pass --charm <id> on the command line.\n");
    Deno.exit(1);
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

async function cmdCalendar(useMock: boolean = false, overrideCharmId?: string): Promise<void> {
  console.log("\n📅 Syncing Calendar...\n");

  const config = await loadConfig();
  if (!config.space) {
    console.log("❌ No space configured. Run './tools/apple-sync.ts init' first.");
    Deno.exit(1);
  }

  const charmId = overrideCharmId || config.charms?.calendar;
  if (!charmId) {
    console.log("❌ No Calendar charm ID configured.");
    console.log("   Either run './tools/apple-sync.ts init' to configure it,");
    console.log("   or pass --charm <id> on the command line.\n");
    Deno.exit(1);
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
      events = await readCalendarEvents(30, 7);
      console.log(`  Found ${events.length} events`);
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
  const eventsForCharm = events.map(evt => ({
    id: evt.id,
    title: evt.title,
    startDate: evt.startDate.toISOString(),
    endDate: evt.endDate.toISOString(),
    location: evt.location,
    notes: evt.notes,
    calendarName: evt.calendarName,
    isAllDay: evt.isAllDay,
  }));

  // Write to charm
  console.log("\n  Writing to charm...");
  try {
    await writeToCharm({
      apiUrl: config.apiUrl || "http://localhost:8000",
      space: config.space,
      charmId: charmId,
      path: "events",
      data: eventsForCharm,
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

  console.log(`\n✅ Synced ${events.length} calendar events\n`);
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

  // Parse --charm argument
  const charmIndex = args.indexOf("--charm");
  const overrideCharmId = charmIndex !== -1 && args[charmIndex + 1]
    ? args[charmIndex + 1]
    : undefined;

  switch (command) {
    case "init":
      await cmdInit();
      break;
    case "status":
      await cmdStatus();
      break;
    case "imessage":
      await cmdImessage(useMock, overrideCharmId);
      break;
    case "calendar":
      await cmdCalendar(useMock, overrideCharmId);
      break;
    case "reminders":
      console.log("\n✅ Reminders sync not yet implemented\n");
      break;
    case "--all":
      await cmdImessage(useMock, overrideCharmId);
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
