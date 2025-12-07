# Apple Data Importers Research

Research into importing iMessage and iCal/Apple Calendar data into patterns.

## Executive Summary

Both iMessage and iCal data are accessible on macOS, but through different mechanisms than the Google OAuth flow used in existing importers. The key difference is these are **local-first** data sources that require macOS-specific access rather than web APIs.

---

## iMessage Import Options

### Option 1: Direct SQLite Database Access (Recommended for Read-Only)

**Location:** `~/Library/Messages/chat.db`

**How it works:**
- iMessage stores all messages in a SQLite database
- Can be read directly using SQL queries
- Requires Full Disk Access permission

**Pros:**
- Direct, fast access to all historical data
- No external dependencies
- Well-documented schema (though undocumented by Apple)
- Read-only - safe, can't corrupt messages

**Cons:**
- macOS only (not available on iOS/iPadOS)
- Requires Full Disk Access permission in System Settings
- Schema changes occasionally with macOS updates
- Recent macOS versions (Ventura+) encode messages in `attributedBody` as hex blob instead of plain text

**Schema Overview:**
- `message` - Individual messages (text, date, is_from_me)
- `handle` - Contact identifiers (phone numbers, emails)
- `chat` - Conversation threads
- `chat_message_join` - Links messages to chats
- `attachment` - File attachments

**Key Query:**
```sql
SELECT
  datetime(message.date / 1000000000 + strftime("%s", "2001-01-01"), "unixepoch", "localtime") AS message_date,
  message.text,
  message.is_from_me,
  chat.chat_identifier
FROM chat
JOIN chat_message_join ON chat."ROWID" = chat_message_join.chat_id
JOIN message ON chat_message_join.message_id = message."ROWID"
ORDER BY message_date ASC;
```

**Sources:**
- [Accessing Your iMessages with SQL - David Bieber](https://davidbieber.com/snippets/2020-05-20-imessage-sql-db/)
- [Using SQL to Look Through All of Your iMessage Text Messages - Simon Willison](https://simonwillison.net/2020/May/22/using-sql-look-through-all-your-imessage-text-messages/)
- [Searching Your iMessage Database with SQL - Atomic Object](https://spin.atomicobject.com/search-imessage-sql/)


### Option 2: MCP Server Integration

Several MCP (Model Context Protocol) servers exist for iMessage:

**Available Servers:**

1. **[imessage-query-fastmcp-mcp-server](https://github.com/hannesrudolph/imessage-query-fastmcp-mcp-server)**
   - Built with FastMCP framework and imessagedb library
   - Read-only (safest option)
   - Python-based

2. **[mac_messages_mcp](https://github.com/carterlasalle/mac_messages_mcp)**
   - Full read/write support
   - Includes contact management, group chat handling
   - Attachment processing
   - Phone number validation

3. **[imessage-mcp](https://github.com/wyattjoh/imessage-mcp)**
   - Read-only iMessage access
   - Search by text, contact, or date range

4. **[imessage-mcp-server](https://github.com/marissamarym/imessage-mcp-server)** (by Marissa Mayer)
   - Uses AppleScript for message sending
   - TypeScript-based

**Integration Approach:**
If patterns can consume MCP tools, we could:
1. Configure an MCP server as a dependency
2. Use MCP tool calls to fetch messages
3. Transform results into pattern data structures


### Option 3: Python Libraries

**[imessage_reader](https://github.com/niftycode/imessage_reader)**
- Forensic tool for extracting iMessage data
- Python 3, works on macOS 10.14+
- Could be wrapped in a Deno/Node subprocess

---

## iCal/Apple Calendar Import Options

### Option 1: Direct SQLite Database Access

**Location:**
- Legacy: `~/Library/Calendars/Calendar.sqlitedb`
- Modern (macOS 15+): `~/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb`

**How it works:**
- Apple Calendar stores events in a Core Data SQLite database
- Can be queried directly, but format is Core Data-specific
- Dates stored as offset from Jan 1, 2001 (Apple's reference date)

**Pros:**
- Direct access to all local calendar data
- No external authentication needed
- Includes synced calendars (iCloud, Google, etc.)

**Cons:**
- Core Data format is complex (not plain SQL-friendly)
- Protected by privacy permissions
- Schema undocumented, changes with OS updates
- Should NOT be modified directly

**Sources:**
- [icalPal - Command-line tool for macOS Calendar](https://github.com/ajrosen/icalPal)


### Option 2: MCP Server Integration (Recommended)

Several MCP servers exist for Apple Calendar:

**Available Servers:**

1. **[mcp-ical](https://github.com/Omar-V2/mcp-ical)**
   - Natural language interaction with macOS Calendar
   - Works with synced Google Calendar too
   - Can create events in custom calendars

2. **[apple-mcp](https://github.com/supermemoryai/apple-mcp)** (by supermemory.ai)
   - Comprehensive Apple integration
   - Covers Contacts, Notes, Messages, Mail, Reminders, Calendar, Maps
   - Unified MCP interface

3. **[@foxychat-mcp/apple-calendar](https://www.npmjs.com/package/@foxychat-mcp/apple-calendar)**
   - TypeScript with Zod validation
   - Uses AppleScript for native access
   - Full CRUD operations

4. **[apple-calendar-mcp](https://glama.ai/mcp/servers/@shadowfax92/apple-calendar-mcp)** (shadowfax92)
   - List calendars, retrieve events
   - Create, update, delete events


### Option 3: AppleScript / EventKit

**AppleScript:**
- macOS Calendar has AppleScript dictionary
- Can list calendars, create events
- Has some reliability issues with writes

**EventKit (via Node.js):**
- **[eventkit-node](https://github.com/dacay/eventkit-node)** - Native addon for Node.js
- Bridges to Apple's EventKit framework
- Requires Info.plist privacy descriptions

**Sources:**
- [Calendar Scripting Guide - Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/CalendarScriptingGuide/index.html)
- [Accessing Calendar using EventKit - Apple](https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui)


### Option 4: ICS File Parsing

If users export calendars to .ics files:

**JavaScript/TypeScript Libraries:**
- **[node-ical](https://github.com/jens-maus/node-ical)** - Minimal iCalendar parser
- **[ical.js](https://github.com/kewisch/ical.js)** - Mozilla's parser, includes TypeScript types
- **[ts-ics](https://github.com/Neuvernetzung/ts-ics)** - TypeScript-first, RFC 5545 compliant
- **[cal-parser](https://www.npmjs.com/package/cal-parser)** - Works in browser/React Native

**Approach:**
1. User manually exports calendar to .ics
2. Pattern reads/parses the file
3. Lower barrier but manual step required

---

## Architecture Recommendations

### For Patterns Framework

The existing Google importers use OAuth web flow. Apple data requires a different approach:

**Challenge:** Patterns run in a browser context but need access to local macOS data.

**Possible Architectures:**

#### Architecture A: Local MCP Server Bridge
```
Pattern (browser) <---> Local MCP Server <---> macOS Data
                         (runs locally)
```
- User installs and runs MCP server locally
- Pattern connects to localhost endpoint
- MCP server handles permissions, database access

**Pros:** Leverages existing MCP ecosystem, separation of concerns
**Cons:** Extra setup step, requires MCP server running

#### Architecture B: File Upload
```
Pattern (browser) <---> User uploads exported file
```
- User manually exports data (iMessage backup, .ics file)
- Pattern parses uploaded file

**Pros:** Simple, no local server needed
**Cons:** Manual export step, not real-time

#### Architecture C: Native App Bridge
```
Pattern (browser) <---> Native Helper App <---> macOS Data
                         (sandboxed)
```
- Small native helper app with Full Disk Access
- Exposes local HTTP API
- Pattern connects to helper

**Pros:** Proper sandboxing, can request permissions
**Cons:** Significant development effort, app distribution

#### Architecture D: Electron/Tauri Wrapper (Future)
If patterns ever run in an Electron/Tauri context:
- Direct access to Node.js native addons
- Can use eventkit-node directly
- Can read SQLite databases

#### Architecture E: Local CLI Sync Daemon (Recommended)
```
CLI Tool (runs locally) ---> Reads macOS Data ---> Writes to User's Space
                                                         ^
Pattern (browser) <----------------------------------------+
                         (reads from user's space)
```

**How it works:**
1. User installs a CLI tool (Deno/Node script, or compiled binary)
2. CLI runs continuously (or on schedule) with Full Disk Access
3. CLI reads iMessage/Calendar data and writes to user's pattern space
4. Pattern simply reads from its own space - no special permissions needed

**Pros:**
- Clean separation: CLI handles permissions, pattern is just a viewer
- Pattern doesn't need filesystem access or special APIs
- CLI can do incremental sync (track what's already imported)
- Works with existing pattern architecture
- User controls when sync happens
- Can filter/transform data before it reaches the pattern

**Cons:**
- User must install and run the CLI tool
- Need to distribute/maintain the CLI
- Data is duplicated (once in macOS, once in user space)

**Implementation sketch:**
```bash
# User runs this periodically or as a daemon
$ apple-sync --imessage --calendar --space "user-space-id"

# Or with launchd for automatic sync
$ apple-sync install-daemon  # Sets up launchd plist
```

**CLI responsibilities:**
- Read from `~/Library/Messages/chat.db` or Calendar DB
- Track sync state (last message ID, historyId equivalent)
- Transform to pattern-compatible format
- Write to user's space via toolshed API
- Handle incremental updates (only sync new/changed items)

**Pattern responsibilities:**
- Display the data
- Provide search/filter UI
- React to data updates in real-time

This is similar to how the Gmail importer works, but instead of OAuth + API calls,
the CLI tool handles local database access.

---

## Recommended Implementation Path (Revised)

### Phase 1: CLI Sync Tool + Simple Viewer Pattern (Recommended)

**Goal:** Create a CLI that syncs Apple data to user's space, plus patterns that view it.

#### 1a. Build the CLI Tool

**Technology choice:** Deno (TypeScript, single binary, good SQLite support)

```typescript
// apple-sync CLI structure
import { DB } from "https://deno.land/x/sqlite/mod.ts";

interface SyncConfig {
  spaceId: string;
  apiUrl: string;        // toolshed API
  identityKey: string;   // for authentication
  sources: {
    imessage?: boolean;
    calendar?: boolean;
  };
}

// Read iMessage database
function readMessages(since?: Date): Message[] {
  const db = new DB(`${Deno.env.get("HOME")}/Library/Messages/chat.db`);
  // Query messages since last sync
  // Transform to pattern format
}

// Write to user's space
async function writeToSpace(data: any, charmId: string) {
  // Use toolshed API to update charm data
  await fetch(`${apiUrl}/api/...`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${identityKey}` },
    body: JSON.stringify(data)
  });
}
```

**Key features:**
- `apple-sync init` - Configure space ID, API credentials
- `apple-sync imessage` - Sync iMessages
- `apple-sync calendar` - Sync calendar events
- `apple-sync watch` - Continuous sync mode
- `apple-sync install-daemon` - Set up launchd for auto-sync

#### 1b. Create Viewer Patterns

**iMessage Viewer Pattern:**
- Reads messages from its input cell (populated by CLI)
- Search by contact, date, content
- Conversation threading
- No special permissions needed

**Calendar Viewer Pattern:**
- Reads events from its input cell
- Calendar view (day/week/month)
- Event details, attendees
- Similar to existing google-calendar-importer but data comes from CLI

#### 1c. Charm Creation Flow

```
User runs: apple-sync init --space myspace

CLI creates:
  1. An "iMessage Store" charm in user's space (holds message data)
  2. An "iMessage Viewer" charm linked to the store
  3. A "Calendar Store" charm (holds event data)
  4. A "Calendar Viewer" charm linked to the store

User runs: apple-sync watch

CLI continuously syncs data into the store charms.
Viewer patterns reactively update as data changes.
```

### Phase 2: Polish and Distribution

1. **Compile to single binary** using `deno compile`
2. **Homebrew formula** for easy installation
3. **Setup wizard** in CLI for permissions guidance
4. **Encryption at rest** for sensitive data in transit

### Phase 3: Additional Data Sources

Once the CLI architecture is proven, expand to other Apple data:

---

## Additional Apple Data Sources

### Apple Notes

**Database Location:**
- Modern: `~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite`
- Legacy paths vary by macOS version (NotesV1-V7.storedata)

**Database Structure:**
- `ZICNOTEDATA` table contains note content
- `ZICNOTEDATA.ZDATA` blob is **gzip compressed**
- Decompressed data is in proprietary binary format (not plain text)
- Attachments stored in `~/Library/Group Containers/group.com.apple.notes/Media/<UUID>/`

**Challenges:**
- Note content is NOT plain text - requires parsing proprietary format
- Tool [apple_cloud_notes_parser](https://github.com/threeplanetssoftware/apple_cloud_notes_parser) shows how to parse
- [notes-import](https://github.com/ChrLipp/notes-import) Groovy tool can extract to files

**Read:** Possible via SQLite + custom parsing
**Write:** AppleScript can create notes via `tell application "Notes"`

**Sources:**
- [Reading Notes database on macOS - Swift Forensics](http://www.swiftforensics.com/2018/02/reading-notes-database-on-macos.html)
- [Where are Notes Stored on Mac](https://osxdaily.com/2020/01/15/where-notes-stored-locally-mac/)

---

### Apple Reminders

**Database Location:**
- `~/Library/Reminders/Container_v1/Stores/Data-<UUID>.sqlite`

**Better Approach: EventKit**
- Reminders and Calendar share the same underlying database
- EventKit framework provides official API
- `EKEventStore` class for accessing reminder data
- `fetchRemindersMatchingPredicate:completion:` to query

**Database Tables (if direct access needed):**
- `ZREMCDREMINDER` - reminder data
- `ZREMCDOBJECT` - general objects
- `ZREMCDHASHTAGLABEL` - tags

**Performance note:** If slow, run `VACUUM; ANALYZE;` on the SQLite files

**Read:** EventKit (preferred) or SQLite
**Write:**
- EventKit can create/modify reminders
- AppleScript: `tell application "Reminders"` with `make new reminder with properties {name:..., due date:..., body:...}`

**Sources:**
- [Creating events and reminders - Apple](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders)
- [Accessing Reminders with EventKit](https://kykim.github.io/blog/2012/10/09/accessing-reminders-with-eventkit-part-1/)
- [Notes on accessing Apple Reminders](https://gist.github.com/0xdevalias/ccc2b083ff58b52aa701462f2cfb3cc8)

---

### Apple Contacts

**Database Location:**
- `~/Library/Application Support/AddressBook/` (SQLite database)
- Individual contacts stored as separate files with unique IDs

**Access Methods:**
1. **Address Book Framework** (Objective-C/C) - official API
2. **AppleScript** - `tell application "Contacts"` (or legacy "Address Book")
3. **`contacts` CLI** - built-in but limited, not compatible with newer macOS
4. **Direct SQLite** - possible but not recommended

**AppleScript Example:**
```applescript
tell application "Contacts"
    make new person with properties {first name:"John", last name:"Doe"}
    -- emails, phones, addresses are elements, not properties
end tell
```

**Read:** AppleScript or Address Book framework
**Write:** AppleScript can create/modify contacts

**Sources:**
- [Introduction to Scripting Address Book - MacTech](http://preserve.mactech.com/articles/mactech/Vol.21/21.10/ScriptingAddressBook/index.html)
- [Address Book - Apple Developer](https://developer.apple.com/documentation/addressbook)

---

## Write Support Architecture

For bidirectional sync (not just import), the CLI needs write capabilities:

### AppleScript as Write Backend

AppleScript provides write access to most Apple apps:

| App | Read | Write via AppleScript |
|-----|------|----------------------|
| Messages | SQLite | ✅ Send messages (existing conversations only) |
| Calendar | SQLite/EventKit | ✅ Create/modify events |
| Reminders | EventKit | ✅ Create/modify reminders |
| Notes | SQLite (complex) | ✅ Create/modify notes |
| Contacts | SQLite | ✅ Create/modify contacts |

**Limitation for iMessage:** AppleScript cannot start NEW conversations, only send to existing buddies.

### CLI Write Flow

```
Pattern (browser) ---> API call ---> CLI (running locally)
                                         |
                                         v
                                    AppleScript
                                         |
                                         v
                                    Apple App
```

**Example: Create Reminder from Pattern**

1. Pattern sends request to local CLI endpoint
2. CLI receives `{action: "createReminder", name: "Buy milk", dueDate: "..."}`
3. CLI executes AppleScript:
   ```applescript
   tell application "Reminders"
       make new reminder with properties {name:"Buy milk", due date:date "..."}
   end tell
   ```
4. CLI confirms success back to pattern

### Two-Way Sync Considerations

1. **Conflict resolution** - What if item edited in both places?
2. **Sync frequency** - How often to check for changes?
3. **ID mapping** - Pattern IDs vs Apple IDs
4. **Deletion handling** - Soft delete vs hard delete?

### Security for Write Operations

- CLI should require explicit confirmation for writes
- Rate limiting to prevent abuse
- Audit log of all write operations
- Optional: require pattern to be "trusted" for writes

### Alternative: File Upload (Simpler but Manual)

If CLI is too much overhead, fall back to file upload:

1. **iMessage via chat.db upload**
   - User copies database file
   - Pattern parses with SQL.js (WASM)

2. **Calendar via ICS export**
   - User exports from Calendar.app
   - Pattern parses with ts-ics

---

## Permission Requirements Summary

| Data Source | Permission Needed | How to Grant |
|-------------|-------------------|--------------|
| iMessage DB | Full Disk Access | System Settings > Privacy > Full Disk Access |
| Calendar DB | Calendar permission | System Settings > Privacy > Calendar |
| Calendar via EventKit | Calendar permission | App will prompt |
| Calendar via AppleScript | Automation permission | App will prompt |

---

## Security Considerations

1. **iMessage is sensitive** - Contains personal conversations
   - Should be marked as Confidential in pattern type
   - Consider filtering/anonymization options

2. **Local-only processing** - Data should never leave device
   - No server-side processing
   - Clear privacy policy

3. **Permission handling** - Clear user guidance
   - Explain why permissions are needed
   - Show what data will be accessed

---

## Open Questions

1. **Toolshed API for external writes?**
   - Can a CLI tool write to a charm's data cells?
   - What authentication is needed? (identity key?)
   - Is there a documented API for this?

2. **Charm creation from CLI?**
   - Can the CLI create new charms programmatically?
   - Or does user need to create the "store" charm first in UI?

3. **Incremental sync mechanism?**
   - How to track what's been synced (historyId equivalent)?
   - Store sync cursor in the charm itself? Local file?

4. **Real-time updates?**
   - Can CLI push updates that pattern sees immediately?
   - Or does pattern need to poll/refresh?

5. **Privacy model for sensitive data?**
   - How does pattern framework handle Confidential data?
   - Can we prevent accidental data exposure?

6. **macOS Ventura+ message encoding?**
   - Recent macOS encodes messages in `attributedBody` as hex blob
   - Need to decode this format (NSAttributedString serialization)

---

## Next Steps

### Phase 1: Core Infrastructure
1. [ ] **Research toolshed API** for external charm data writes
2. [ ] **Prototype Deno CLI** with basic structure
3. [ ] **Test writing to a charm** from external CLI
4. [ ] **Design CLI <-> Pattern communication** (local HTTP? WebSocket?)

### Phase 2: iMessage (Read-only MVP)
5. [ ] **Implement chat.db reader** in Deno
6. [ ] **Handle Ventura+ message encoding** (attributedBody blob)
7. [ ] **Create iMessage viewer pattern** that reads from input cell
8. [ ] **Handle incremental sync** (track last message ROWID)

### Phase 3: Calendar & Reminders
9. [ ] **Implement Calendar SQLite reader** or use EventKit via native binding
10. [ ] **Implement Reminders reader** (EventKit preferred)
11. [ ] **Create Calendar/Reminders viewer patterns**

### Phase 4: Write Support
12. [ ] **Implement AppleScript execution** from Deno CLI
13. [ ] **Add write endpoints** to CLI (create reminder, send message, etc.)
14. [ ] **Design pattern -> CLI write flow** (confirmation UX)
15. [ ] **Handle write conflicts** and error cases

### Phase 5: Notes & Contacts
16. [ ] **Parse Notes proprietary format** (gzip + binary)
17. [ ] **Implement Contacts reader** via AppleScript
18. [ ] **Create Notes/Contacts viewer patterns**

### Documentation & Distribution
19. [ ] **Document setup flow** for users (permissions, CLI install)
20. [ ] **Create Homebrew formula** for CLI distribution
21. [ ] **Write user guide** with troubleshooting

---

## Resources

### iMessage Database
- [Simon Willison's iMessage SQL exploration](https://simonwillison.net/2020/May/22/using-sql-look-through-all-your-imessage-text-messages/)
- [David Bieber's iMessage SQL snippets](https://davidbieber.com/snippets/2020-05-20-imessage-sql-db/)
- [imessage_reader Python library](https://github.com/niftycode/imessage_reader)

### Calendar Database
- [icalPal CLI tool](https://github.com/ajrosen/icalPal)
- [eventkit-node](https://github.com/dacay/eventkit-node)

### MCP Servers (reference implementations)
- [imessage-query-fastmcp](https://github.com/hannesrudolph/imessage-query-fastmcp-mcp-server)
- [apple-mcp](https://github.com/supermemoryai/apple-mcp)
- [mcp-ical](https://github.com/Omar-V2/mcp-ical)

### ICS Parsing
- [ts-ics](https://github.com/Neuvernetzung/ts-ics)
- [node-ical](https://github.com/jens-maus/node-ical)

### Deno SQLite
- [deno.land/x/sqlite](https://deno.land/x/sqlite)
