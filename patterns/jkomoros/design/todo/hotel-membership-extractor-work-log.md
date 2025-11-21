# Hotel Membership Extractor - Work Log

## Current Status

**Completed:**
- ✅ Issue 1: Gmail Auth Prominence (prominent warning box)
- ✅ Gmail content extraction works correctly
- ✅ Email fetching and display working

**Remaining - CRITICAL:**
- ❌ Issue 3: Smarter Query Iteration (LLM needs query history and refinement)

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

## Session Summary (Current - Debugging & Discovery)

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
