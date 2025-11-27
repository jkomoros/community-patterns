# Hotel Membership Extractor - Work Log

## Current Status

**Completed:**
- ✅ Issue 1: Gmail Auth Prominence (prominent warning box)
- ✅ Gmail content extraction works correctly
- ✅ Email fetching and display working
- ✅ Issue 3: Smarter Query Iteration - SOLVED with agent architecture!
  - Agent does 14+ different queries per scan
  - Tries broad searches, subject filters, program-specific queries
  - Even validates found numbers by searching for them
  - Found 3 memberships in acceptance testing

**Remaining - NEW ISSUE:**
- ❌ Save handler data extraction - agent returns correct data (visible in summary)
  but extracted membership objects have empty brand/program names
  - Hypothesis: generateObject returns cells/links that need special handling
  - Added getValue() helper and debug logging to diagnose

**Blocked (Framework Limitation):**
- Issue 2: Auto-Fetch Emails - Framework doesn't support reactive side effects

---

Development notes and work tracking for the Hotel Membership Extractor pattern.

## 🚀 RADICAL ARCHITECTURE CHANGE: Agent-Based Design

### Framework Author Recommendation

**OLD DESIGN (Abandoned):** 2-stage LLM approach
- Stage 1: Query generator picks brand, generates Gmail query
- Stage 2: Fetch ALL emails from query
- Stage 3: Extractor processes all email content

**Problems with Old Design:**
- ❌ Fetches ALL emails from broad queries (wastes context)
- ❌ LLM sees promotional emails it doesn't care about
- ❌ Can't iteratively refine queries based on results
- ❌ High context usage, high API costs
- ❌ Two separate LLM calls (query gen + extraction)

**NEW DESIGN (Agent with Tools):** Single agent with `generateObject` + tool calls
- Agent uses tools to search and read emails iteratively
- Only reads promising emails based on subject analysis
- Refines queries organically based on what it finds
- Context-efficient, cost-efficient, naturally iterative

### Agent Tools

#### Tool 1: `searchGmail(query: string)` → EmailPreview[]
- **Purpose:** Search Gmail, return metadata ONLY (no content)
- **Returns:** Up to 20 email previews `{ id, subject, from, date }`
- **Implementation:** Pattern tool (via `patternTool()`)
- **Caching:** Results cached in FIFO cache (200 emails max)
- **Gmail API:** Only called if query not in recent cache

#### Tool 2: `readEmail(emailId: string)` → EmailFull
- **Purpose:** Read full content of specific email
- **Returns:** `{ id, subject, from, date, content }` (markdown)
- **Implementation:** Pattern tool reading from FIFO cache
- **Key:** Does NOT hit Gmail API - reads from cache only
- **Error:** If email not in cache, returns error prompting agent to search first

#### Tool 3: `finalResult(memberships: MembershipRecord[])` → void
- **Purpose:** Agent calls when done to return results
- **Implementation:** Automatically provided by `generateObject` schema
- Agent must call this to complete

### FIFO Email Cache

**Purpose:** Prevent re-fetching same emails from Gmail API

**Structure:**
```typescript
interface EmailCache {
  entries: Map<string, EmailFull>;  // emailId → full email data
  searchHistory: SearchEntry[];      // Recent searches
  maxEntries: 200;                   // Keep last 200 emails (FIFO eviction)
}

interface SearchEntry {
  query: string;
  timestamp: number;
  emailIds: string[];   // IDs returned by this search
}
```

**Workflow:**
1. Agent calls `searchGmail("from:marriott.com")`
2. Tool checks cache: if query recent, return cached previews
3. If not cached: fetch from Gmail, add to cache, return previews
4. Agent analyzes subjects, decides which to read
5. Agent calls `readEmail("abc123")`
6. Tool reads from cache (instant, no API call)
7. If cache miss: error "Email not in cache, search first"

**Why FIFO?**
- Agent may search same brand multiple times
- Don't want to re-fetch emails we already have
- 200 emails is enough for ~5 brands × 40 emails each
- Oldest emails evicted automatically

### Agent State: brandHistory

**Purpose:** Agent's working memory - persistent across sessions

**Structure:**
```typescript
interface BrandHistory {
  brand: string;
  attempts: QueryAttempt[];
  status: "searching" | "found" | "exhausted";
}

interface QueryAttempt {
  query: string;
  attemptedAt: number;
  emailsFound: number;        // How many emails searchGmail returned
  emailsRead: number;         // How many agent called readEmail on
  membershipsFound: number;   // How many memberships extracted
  emailIds: string[];         // Which emails (for deduplication)
}
```

**Why This Matters:**
- Other patterns can inspect agent progress
- UI can show "Tried 3 queries for Marriott, found 1 membership"
- Agent sees its own history to avoid repeating failed queries
- Survives page refresh (persisted state)

**Example brandHistory After Agent Run:**
```typescript
[
  {
    brand: "Marriott",
    attempts: [
      {
        query: "from:marriott.com",
        attemptedAt: 1234567890,
        emailsFound: 40,
        emailsRead: 1,
        membershipsFound: 1,
        emailIds: ["abc123", ...]
      },
      {
        query: "from:marriott.com subject:(account OR membership)",
        attemptedAt: 1234567900,
        emailsFound: 5,
        emailsRead: 2,
        membershipsFound: 0,  // Duplicate of first
        emailIds: ["def456", "ghi789"]
      }
    ],
    status: "found"  // Found membership, done with this brand
  },
  {
    brand: "Hilton",
    attempts: [
      {
        query: "from:hilton.com subject:(honors OR membership)",
        emailsFound: 3,
        emailsRead: 2,
        membershipsFound: 1,
        emailIds: ["jkl012"]
      }
    ],
    status: "found"
  }
]
```

## Current Issues to Fix - NEW PRIORITIES

### ✅ COMPLETED IN PREVIOUS BRANCH

1. **Gmail Auth Prominence** ✅ DONE
   - Large prominent warning box when not authenticated
   - Auth UI embedded directly (no hidden Settings section)

2. **ReadOnlyAddressError on Reset Button** ✅ DONE
   - Pre-bind handler outside derive() blocks
   - Button works correctly now

3. **Work Log Organization** ✅ DONE
   - Moved to `design/todo/hotel-membership-extractor-work-log.md`
   - Created proper folder structure

### NEW PRIORITIES FOR AGENT ARCHITECTURE

### 1. Implement FIFO Email Cache (HIGH PRIORITY)
**Status:** TODO - Required foundation for tools

**Task:** Create email cache structure and management

**Implementation:**
- Create `emailCache` cell with `Map<string, EmailFull>` entries
- Track recent searches with timestamps
- Implement FIFO eviction (keep 200 most recent)
- Cache hit/miss tracking for debugging

**Files to Create/Modify:**
- New cache logic in hotel-membership-extractor.tsx OR
- Separate cache pattern (if reusable)

### 2. Build searchGmail Pattern Tool (HIGH PRIORITY)
**Status:** TODO - Agent's primary search tool

**Task:** Create pattern that wraps GmailImporter and caches results

**Pattern Signature:**
```typescript
const SearchGmail = pattern((
  { auth, query, cache }: {
    auth: Cell<any>;
    query: string;
    cache: Cell<EmailCache>;
  }
) => {
  // 1. Check cache for recent query
  // 2. If cached: return previews from cache
  // 3. If not cached:
  //    - Use GmailImporter to fetch emails
  //    - Add to cache
  //    - Return previews (id, subject, from, date only)

  return {
    previews: EmailPreview[];  // Max 20
    cached: boolean;           // Was this cached?
  };
});
```

**Usage in Agent:**
```typescript
tools: {
  searchGmail: patternTool(SearchGmail, { auth, cache }),
}
```

**Key Decision:** How to pass auth to patternTool?
- Research how it's done in labs/ patterns
- Look at suggestion.tsx and other patterns with auth

### 3. Build readEmail Pattern Tool (HIGH PRIORITY)
**Status:** TODO - Agent's email reading tool

**Task:** Create pattern that reads from cache

**Pattern Signature:**
```typescript
const ReadEmail = pattern((
  { emailId, cache }: {
    emailId: string;
    cache: Cell<EmailCache>;
  }
) => {
  // 1. Look up emailId in cache.entries
  // 2. If found: return full email data
  // 3. If not found: return error "Email not in cache, search first"

  return {
    email?: EmailFull;
    error?: string;
  };
});
```

**Usage in Agent:**
```typescript
tools: {
  readEmail: patternTool(ReadEmail, { cache }),
}
```

### 4. Implement Agent with generateObject (HIGH PRIORITY)
**Status:** TODO - Core agent logic

**Task:** Create agent using `generateObject` with tools

**Implementation:**
```typescript
const agent = generateObject({
  system: `You are a hotel membership number extractor...

  Strategy:
  1. Start with broad searches (from:marriott.com)
  2. Analyze subjects to identify promising emails
  3. Read promising emails to extract memberships
  4. Refine queries if needed (add subject filters)
  5. Try 3-5 queries per brand
  6. Move to next brand when done

  Brands to search: Marriott, Hilton, Hyatt, IHG, Accor`,

  prompt: derive([brandHistory, memberships], ([history, found]) => {
    return `Current progress:
    - Brands searched: ${history.map(b => b.brand).join(", ")}
    - Memberships found: ${found.length}

    Continue searching for hotel memberships.`;
  }),

  tools: {
    searchGmail: patternTool(SearchGmail, { auth, cache }),
    readEmail: patternTool(ReadEmail, { cache }),
  },

  model: "anthropic:claude-sonnet-4-5",
  schema: toSchema<{ memberships: MembershipRecord[] }>(),
});
```

### 5. Auto-Run on Authentication (HIGH PRIORITY)
**Status:** TODO - User wants "Login and Run" button

**Task:** Trigger agent automatically when user authenticates

**Implementation:**
```typescript
// Watch auth state
const shouldRunAgent = derive(auth, (a) => a && a.authenticated);

// Trigger agent when authenticated
const agentTrigger = derive(shouldRunAgent, (should) => {
  return should ? `run-${Date.now()}` : "";
});

// Agent watches trigger
const agent = generateObject({
  ...,
  // Only run when trigger changes to non-empty
  prompt: derive([agentTrigger, ...], ([trigger, ...]) => {
    if (!trigger) return ""; // Don't run
    return "Start searching for memberships...";
  }),
});
```

**UI:**
- Button: "🔒 Login and Run"
- On click → Gmail OAuth
- After auth → Agent starts automatically
- Show progress in real-time

### 6. UI for Agent Progress (MEDIUM PRIORITY)
**Status:** TODO - Show agent's tool calls and progress

**Task:** Display agent progress from brandHistory

**UI Elements:**
- Current brand being searched
- Query attempts for each brand
- Emails found/read/memberships extracted
- Real-time tool call log
- Final membership results

**Example UI:**
```
🤖 Agent Progress

✅ Marriott (3 queries, 1 membership found)
  1. "from:marriott.com" → 40 emails, read 1, found 1 membership
  2. "from:marriott.com subject:(account)" → 5 emails, read 2, duplicates
  3. "from:marriott.com subject:(welcome)" → 2 emails, read 2, duplicates

🔄 Hilton (searching...)
  1. "from:hilton.com subject:(honors)" → 3 emails, reading...

⏳ Pending: Hyatt, IHG, Accor

📋 Memberships Found: 1
```

---

## Session Summary (Agent Architecture Implementation - In Progress)

**Session Goal:** Implement agent-based architecture with tool calling to replace 2-stage LLM

**Progress Made:**

###  ✅ 1. FIFO Email Cache Data Structures
- Added EmailPreview, EmailFull, SearchEntry, EmailCache interfaces
- Integrated emailCache into HotelMembershipInput with default state
- Cache structure: entries map, searchHistory array, maxEntries (200)
- Pattern compiles successfully with cache infrastructure
- **Commit:** "Add FIFO email cache data structures"

### ✅ 2. SearchGmailTool Pattern Function
- Created SearchGmailTool pattern that wraps GmailImporter
- Input: query string, authCharm
- Returns: EmailPreview[] (id, subject, from, date only - NO content)
- Fetches up to 20 emails via GmailImporter
- Stores _fullContent internally for ReadEmailTool access
- MVP: No persistent caching yet - optimization deferred
- **Status:** Compiled and exported

### ✅ 3. ReadEmailTool Pattern Function
- Created ReadEmailTool pattern for reading email content
- Input: emailId, recentSearches cell
- Returns: EmailFull (with content) OR error
- MVP: Reads from in-memory search results, not persistent cache
- Error handling: Returns clear message if email not found
- **Status:** Compiled and exported

**Both Tools:** Ready to be used with `patternTool()` in generateObject

### 🚧 4. Agent with generateObject - NOT YET IMPLEMENTED

**Current State:**
- Pattern still uses OLD 2-stage LLM architecture (query generator + extractor)
- Tool patterns are defined but NOT integrated into agent workflow
- Need to add generateObject call with tools

**Next Steps:**
1. Add generateObject call after authCharm setup
2. Define agent system prompt (search strategy, brands to search)
3. Wire tools using patternTool(SearchGmailTool, { ... }) and patternTool(ReadEmailTool, { ... })
4. Figure out how to pass authCharm to SearchGmailTool via patternTool
5. Define schema for final result (memberships array)
6. Test agent workflow

**Key Decision Needed:** How to integrate agent with existing pattern?
- Option A: Replace entire 2-stage LLM with agent (big refactor)
- Option B: Add agent alongside old workflow, with switch (testing)
- Option C: Fresh start - remove old code, agent-only

**Files Modified:**
- `patterns/jkomoros/hotel-membership-extractor.tsx` - Added cache + tools
- Work log - Updated with agent architecture specs

**Commits Made:**
1. "Hotel Membership Extractor: Radical redesign to agent architecture" (design docs)
2. "Add FIFO email cache data structures"
3. "Add SearchGmailTool and ReadEmailTool pattern functions"

**Branch:** `jkomoros/hotel-membership-agent` (pushed to remote)

**Blockers/Questions:**
- How to pass authCharm to patternTool (research needed)
- Should we keep old 2-stage LLM during transition?
- How will agent update brandHistory state?
- Need to understand patternTool parameter passing better

---

## 🔄 MAJOR ARCHITECTURE REVISION - Framework Developer Feedback

**Date:** Current session (continued)

**Framework Developer Feedback Received:**

> "it shouldn't do the caching thing and it can use the cell reading tools instead of the readEmail tool:
> the tool should just be a thin wrapper around the gmail importer
> specify the return type as second type parameter for the pattern and make emails any. this makes it so that they are outputtet as links to the llm and it can then use the read tool to read the emails"

**What This Means:**

### ❌ Original Approach (WRONG):
- SearchGmailTool fetches emails, stores in cache, returns previews
- ReadEmailTool reads from cache
- Tools coordinate via shared emailCache cell
- Complex state management

### ✅ Correct Approach (Framework Idiomatic):
- SearchGmailTool is **thin wrapper** around GmailImporter
- Return emails as `any` type → framework converts to `@link` references
- LLM sees email links: `[{"@link": "/of:abc/email/0"}, ...]`
- LLM uses **built-in cell reading tools** to read specific emails
- No custom ReadEmailTool needed
- No custom caching needed

### How @link System Works:

1. SearchGmailTool returns emails typed as `any`
2. Framework sees `any` type, converts cells to `@link` format
3. LLM receives links (not full content) - context-efficient!
4. LLM analyzes subjects/metadata from links
5. LLM uses built-in `read` tool to read promising emails
6. LLM extracts memberships, calls finalResult

**Example Agent Flow:**
```
Agent: searchGmail("from:marriott.com")
→ Returns: [{"@link": "/of:abc/email/0"}, {"@link": "/of:abc/email/1"}, ...]

Agent: (analyzes subjects) Email 0 looks promising: "Your Marriott Bonvoy Account"

Agent: read({"@link": "/of:abc/email/0"})  // Built-in tool!
→ Returns: { subject: "...", content: "... membership number 123456789 ..." }

Agent: Found membership! finalResult({ memberships: [...] })
```

### Major Simplifications:

| Component | Old Approach | New Approach |
|-----------|-------------|--------------|
| SearchGmailTool | Complex: fetch + cache + previews | Simple: thin wrapper, return `any` |
| ReadEmailTool | Custom pattern | ❌ DELETE - use built-in |
| EmailCache | Custom FIFO cache cell | ❌ DELETE - not needed |
| Agent tools | `{ searchGmail, readEmail }` | `{ searchGmail }` only |
| Code complexity | High (cache coordination) | Low (leverage framework) |

### Implementation Changes Required:

**DELETED:**
- ❌ EmailCache interface and cell
- ❌ EmailPreview, EmailFull interfaces (still need MembershipRecord)
- ❌ SearchEntry interface
- ❌ ReadEmailTool pattern
- ❌ All cache management logic

**REWRITTEN:**
- 🔄 SearchGmailTool → Thin wrapper, return type `any`

**SIMPLIFIED:**
- ✅ Agent setup → Only register `searchGmail` tool
- ✅ No cache coordination needed

**NEW TODO List:**
1. Remove emailCache infrastructure
2. Rewrite SearchGmailTool as thin wrapper (return `any`)
3. Delete ReadEmailTool
4. Implement agent with generateObject (only searchGmail tool)
5. Update save handler for agent.result
6. Wire up auto-run on auth
7. Build UI for agent progress
8. Test end-to-end

**Why This is Better:**
- **Simpler:** ~200 lines of cache code deleted
- **Idiomatic:** Uses framework's @link system as designed
- **Maintainable:** Leverage built-in tools vs custom logic
- **Correct:** Framework dev guidance = best practices

**Status:** Ready to implement revised design

---

## Session Summary (Previous - Debugging & Discovery)

**Session Goal:** Investigate why emails have no content and fix extraction

**Key Discovery:** ✅ **Emails DO have content!** Gmail API works perfectly.

**Investigation Results:**
1. **Added comprehensive debug logging to gmail-importer.tsx messageToEmail()**
   - Logs payload structure, parts, body.data, content lengths
   - Confirmed Gmail API returns full email content
   - Confirmed base64 decoding works correctly
   - Confirmed markdown conversion works correctly

2. **Tested in Playwright:**
   - Deployed pattern, authenticated, fetched 40 Marriott emails
   - Gmail Importer table showed FULL email content (confirmed by expanding "Show Markdown")
   - First email: "Journey Into the Heart of the Caribbean..." with thousands of characters
   - Extraction Debug UI showed "NO CONTENT" - but this was STALE data from before fetch!

3. **Root Cause Identified:**
   - ✅ Gmail API works perfectly
   - ✅ Content extraction works perfectly
   - ❌ **Problem:** Query `from:marriott.com` finds promotional emails, NOT membership emails
   - ❌ **Problem:** LLM query generator gives up after one attempt per brand
   - ❌ **Problem:** No learning from failed queries or successful patterns

**User Feedback:** "The LLM should see that query was tried, returned emails but no memberships, and try a more specific query"

**Next Priority:** Issue #3 (Smarter Query Iteration) - LLM needs query history and iterative refinement

**Files Modified:**
- `gmail-importer.tsx` - Added comprehensive debug logging to messageToEmail()
- Work log - Updated with findings and new implementation plan

**Files Ready to Commit:**
- `gmail-importer.tsx` - Debug logging is valuable for future troubleshooting

---

## Work Completed

### ✅ Auto-Query with derive() Solution
- **Problem:** Using computed() for side effects caused reactivity catch-22
- **Solution:** Use derive() to create autoQuery cell that conditionally returns LLM query or manual query
- **Result:** Works perfectly! LLM query automatically propagates to GmailImporter
- **Commit:** Multiple commits documenting the solution

### ✅ Two-Stage LLM Workflow
- Stage 1: Query generator picks brand and creates Gmail query
- Stage 2: Extractor processes emails and extracts memberships
- Both working independently

### ✅ Smart Brand Tracking
- Tracks unsearched/searched/notfound brands
- Prevents redundant searches

---

## Future Enhancements (Lower Priority)

- [ ] Add more hotel brands (Hilton, Hyatt, IHG, Accor, etc.)
- [ ] Copy button for membership numbers
- [ ] Export to CSV/JSON
- [ ] Manual add/edit/delete memberships
- [ ] Better UI with hotel icons
- [ ] Auto-save (remove manual "Save Extracted Memberships" button)
- [ ] Search/filter memberships

---

## Investigation Notes

### Gmail Importer Architecture
- Location: `patterns/jkomoros/gmail-importer.tsx`
- TODO: Read this file to understand fetch trigger mechanism
- Question: Does it auto-fetch on query change, or require manual button click?

### Extraction Debugging
- Need to inspect what email content looks like
- Need to test LLM extraction prompt in isolation
- Consider adding "show raw email content" debug view

---

## Session: Acceptance Testing (2025-11-27)

### Goal
Run acceptance testing on hotel-membership-extractor and identify next steps.

### Test Results

**Agent Performance: EXCELLENT** ✅
- Agent successfully authenticated via wish system (Gmail Auth charm)
- Searched ALL 5 hotel brands (Marriott, Hilton, Hyatt, IHG, Accor)
- Performed 14+ different search queries:
  - Broad: `from:marriott.com`
  - Subject filters: `from:hilton.com subject:(welcome OR member)`
  - Program-specific: `"World of Hyatt" "member number"`
  - Validation: searched for found membership numbers directly
- Found **3 memberships**:
  - Hilton Honors (650697007, Silver)
  - IHG One Rewards (499515687, Silver Elite)
  - World of Hyatt (515838782J, Member)
- Intelligent summary explaining why Marriott/Accor numbers not found

**Issues Found:**

1. **Save Handler Serialization Error** - FIXED ✅
   - Error: "Cannot convert value to URI: {"link@1":..."
   - Cause: Spreading agent result objects included @link references
   - Fix: Extract only primitive fields explicitly

2. **Data Extraction Issue** - IN PROGRESS 🔄
   - Agent returns correct data (visible in summary)
   - But saved memberships have empty brand/program names
   - Showing "Unknown Brand (3)" and "Invalid Date" in UI
   - Added getValue() helper to handle cell references
   - Added debug logging to diagnose

### Changes Made
- Fixed save handler to not spread objects
- Added getValue() helper for cell/link dereferencing
- Added comprehensive debug logging
- Improved UI fallbacks for empty values

### Branch
`hotel-membership-extractor-testing`

### Next Steps
1. Deploy with debug logging to see raw agent result structure
2. Fix data extraction based on actual result format
3. Test save → display flow works correctly
4. Consider if agent schema needs adjustment

---

## 🆕 Feature Design: Auto-Save & Ongoing Scan Mode (2025-11-27)

### Overview

The current extraction model requires a manual "Save Results" button click after extraction completes. This is suboptimal UX. The ideal flow:

1. **First Scan:** Comprehensive search across all hotel brands to find ALL membership numbers
2. **Ongoing Scan:** Periodic/triggered scan of RECENT emails only, looking for NEW memberships

In both modes, results should auto-save with NO user confirmation required.

### Key Insight: Append-Only is Safe

**Why no save button is needed:**
- Memberships are NEVER overwritten, only appended
- Each discovered membership has a unique (brand + number) key
- If we find a duplicate, we simply skip it
- User can never lose data through automatic saving
- Worst case: we discover the same membership twice → only stored once

### Data Model Changes

**Current:** Simple array of memberships
```typescript
memberships: MembershipRecord[]
```

**Proposed:** Map keyed by (brand + number) for deduplication
```typescript
memberships: Map<string, MembershipRecord>  // key: `${brand}:${number}`
// OR use array but with deduplication logic
```

**MembershipRecord additions:**
```typescript
interface MembershipRecord {
  hotelBrand: string;
  membershipNumber: string;
  programName: string;
  tierStatus: string;
  // NEW fields:
  firstDiscoveredAt: number;    // When we first found this
  lastSeenInEmailAt: number;    // Most recent email mentioning it
  sourceEmails: string[];       // Email IDs where this was found (for debugging)
  confidence: "high" | "medium" | "low";  // How confident we are
}
```

### Auto-Save Implementation

**Simple approach:** Save after every agent tool call that finds memberships

```typescript
// In agent onToolResult callback or similar:
const handleNewMemberships = (found: MembershipRecord[]) => {
  for (const m of found) {
    const key = `${m.hotelBrand}:${m.membershipNumber}`;
    const existing = memberships.get().find(e =>
      e.hotelBrand === m.hotelBrand && e.membershipNumber === m.membershipNumber
    );

    if (!existing) {
      // NEW membership - append immediately
      memberships.push({
        ...m,
        firstDiscoveredAt: Date.now(),
        lastSeenInEmailAt: Date.now(),
      });
    } else {
      // DUPLICATE - just update lastSeenInEmailAt
      existing.lastSeenInEmailAt = Date.now();
    }
  }
};
```

### First Scan vs Ongoing Scan

**First Scan (Comprehensive):**
- Triggered on first run OR manually by user
- Searches ALL emails for ALL brands
- Uses broad queries: `from:marriott.com`, etc.
- Goal: Find every membership ever mentioned

**Ongoing Scan (Incremental):**
- Triggered periodically OR on new email arrival
- Searches only RECENT emails (e.g., last 7 days)
- Only looks for brands we DON'T have memberships for yet
- Uses `after:YYYY/MM/DD` Gmail filter
- Goal: Catch new memberships without re-processing old emails

### Ongoing Scan Query Strategy

```typescript
const buildOngoingScanQuery = (existingMemberships: MembershipRecord[]) => {
  // Get brands we already have memberships for
  const knownBrands = new Set(existingMemberships.map(m => m.hotelBrand.toLowerCase()));

  // Only search brands we DON'T have yet
  const brandsToSearch = ALL_HOTEL_BRANDS.filter(b => !knownBrands.has(b.toLowerCase()));

  // Date filter: last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const dateFilter = `after:${weekAgo.toISOString().split('T')[0].replace(/-/g, '/')}`;

  // Build query for unknown brands only
  const fromFilters = brandsToSearch.map(b => `from:${b.toLowerCase()}.com`).join(' OR ');

  return `(${fromFilters}) ${dateFilter}`;
};
```

**Example:**
- We have: Hilton, IHG, Hyatt memberships
- ALL_BRANDS: Marriott, Hilton, Hyatt, IHG, Accor
- Unknown brands: Marriott, Accor
- Query: `(from:marriott.com OR from:accor.com) after:2025/11/20`

### Trigger Modes

**Option A: Timer-Based**
- Run ongoing scan every N hours
- Con: Wastes resources if no new emails

**Option B: Event-Based (Ideal)**
- Trigger on Gmail notification of new hotel-related email
- Requires webhook/push notification setup
- More complex but more efficient

**Option C: Manual + Auto (MVP)**
- First scan: Manual "Start Scan" button
- Auto-save results as discovered
- Ongoing scan: Manual "Check Recent" button
- User controls when scans run, but no save confirmation needed

### UI Changes

**Remove:**
- ❌ "Save Results" button

**Add:**
- ✅ "Start Full Scan" button (first scan)
- ✅ "Check Recent Emails" button (ongoing scan)
- ✅ Real-time membership list that updates as discoveries are made
- ✅ "Last scanned: X minutes ago" timestamp
- ✅ "X new memberships found this session" counter

### Edge Cases

**Multiple Membership Numbers for Same Brand:**
User mentioned: "if multiple loyalty numbers found for a given brand, try to help figure out what happened"

Scenarios:
1. **Old account + new account** - User created new account, forgot old
2. **Spouse/family account** - Joint emails, different members
3. **Work vs personal** - Separate loyalty programs
4. **Merged programs** - Hotel acquisition (e.g., Starwood → Marriott)

**Detection heuristics:**
- Same brand, different numbers, different dates → likely account change
- Same brand, different numbers, same email thread → likely family accounts
- Same brand, different tier levels → might indicate primary vs secondary

**UI for duplicates:**
```
⚠️ Multiple Marriott accounts detected:
  - #123456789 (Gold, last seen 2023-01)  [likely old account]
  - #987654321 (Silver, last seen 2025-11) [likely current]

Which is your primary account? [#123456789] [#987654321] [Keep Both]
```

### Implementation Priority

1. **Phase 1: Auto-Save (MVP)**
   - Remove save button
   - Implement deduplication logic
   - Save memberships immediately as discovered
   - Show real-time updates in UI

2. **Phase 2: Ongoing Scan**
   - Add "Check Recent" button
   - Implement date-filtered queries
   - Skip already-known brands

3. **Phase 3: Multi-Account Detection**
   - Detect multiple numbers per brand
   - Show disambiguation UI
   - Let user mark primary account

### Open Questions

1. **How to handle membership number changes?**
   - Some programs let you choose your number
   - Same person might have different numbers over time
   - Should we track "previous numbers"?

2. **How to detect spouse accounts?**
   - Name in email different from user's name?
   - Separate email threads?
   - Let user manually tag?

3. **What about deleted/cancelled accounts?**
   - Old membership no longer valid
   - Should user be able to archive/hide?

4. **Privacy considerations?**
   - Storing email IDs as sourceEmails - is this needed?
   - Should we store email content snippets?

---

## 🆕 Feature Design: Export & Wish Import (2025-11-27)

### Overview

The hotel-membership-extractor should be able to:
1. **Export** membership numbers so other patterns can use them
2. **Import via wish** to avoid re-discovering known memberships

### Export Memberships

**Goal:** Other patterns can wish for hotel memberships without re-scanning Gmail.

**Implementation:**
- Add output cell that exports memberships
- Tag output with `#hotelMemberships` for wish discovery
- Other patterns use `wish("#hotelMemberships")` to get the list

**Output Schema:**
```typescript
interface Output {
  memberships: MembershipRecord[];
  // Add tag for wish discovery
}
```

**Pattern Output Comment:**
```typescript
/** Hotel membership records. #hotelMemberships */
interface Output {
  memberships: MembershipRecord[];
}
```

### Import Known Memberships via Wish

**Goal:** If user already has memberships stored elsewhere, import them to avoid duplicating scan work.

**Use Cases:**
1. User has another hotel-membership charm with existing data
2. User wants to merge memberships from multiple scans
3. User manually entered memberships somewhere

**Implementation:**
```typescript
// In pattern input:
interface Input {
  // ... existing fields ...
  knownMemberships: Default<MembershipRecord[], []>;  // Direct input
}

// Try to wish for existing memberships
const wishedMemberships = wish<{ memberships: MembershipRecord[] }>("#hotelMemberships");

// Merge known memberships into agent context
const agentPrompt = derive([isScanning, memberships, wishedMemberships], ([scanning, found, wished]) => {
  const knownNumbers = new Set([
    ...found.map(m => m.membershipNumber),
    ...(wished?.memberships || []).map(m => m.membershipNumber),
  ]);

  return `...
Already known membership numbers (don't search for these):
${[...knownNumbers].join(", ")}
...`;
});
```

**Agent Instructions Update:**
- Tell agent about known memberships
- Instruct agent to skip searching for brands we already have
- Focus scan on unknown brands only

### Benefits

1. **Avoid duplicate work** - Don't re-scan Gmail for memberships we already know
2. **Cross-pattern sharing** - Other patterns can use membership data
3. **Merge multiple sources** - Combine manual entries with scanned data
4. **Incremental scans** - Ongoing scans skip known memberships

### Implementation Priority

1. **Phase 1: Export** - Add `#hotelMemberships` tag to output
2. **Phase 2: Import wish** - Accept wished memberships and merge
3. **Phase 3: Agent awareness** - Update agent to skip known brands
