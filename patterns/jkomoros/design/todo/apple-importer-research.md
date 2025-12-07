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

---

## Recommended Implementation Path

### Phase 1: iMessage Import via File Upload (Simplest)

1. **Create a pattern that accepts a chat.db copy**
   - User copies `~/Library/Messages/chat.db` to Downloads
   - Pattern uses file input to read it
   - Parse using SQL.js (SQLite compiled to WASM)

2. **Provide clear instructions:**
   - How to copy the database
   - What permissions to grant
   - Privacy considerations

### Phase 2: iCal Import via ICS Upload

1. **Create a pattern that accepts .ics files**
   - User exports calendars from Calendar.app
   - Pattern parses using ts-ics or similar

2. **Multiple calendar support:**
   - Accept multiple .ics files
   - Merge into unified view

### Phase 3: MCP Integration (If framework supports)

If patterns can integrate with MCP servers:

1. **Detect local MCP servers**
   - Check for known MCP server endpoints
   - Provide setup instructions if not found

2. **Use MCP tools for real-time access**
   - Call MCP tools to fetch data
   - Support incremental sync

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

1. **Can patterns access local filesystem?**
   - File upload works, but direct filesystem access?

2. **MCP integration in patterns?**
   - Can patterns call MCP tools directly?
   - Would need MCP client implementation

3. **SQL.js for SQLite parsing?**
   - Can we bundle SQL.js for in-browser SQLite parsing?
   - Would enable direct chat.db parsing without backend

4. **Privacy model for sensitive data?**
   - How does pattern framework handle Confidential data?
   - Can we prevent accidental data exposure?

---

## Next Steps

1. [ ] Prototype ICS file upload and parsing
2. [ ] Prototype chat.db parsing with SQL.js
3. [ ] Evaluate MCP integration possibilities
4. [ ] Design permission/setup UX flow
5. [ ] Create user documentation for data export
