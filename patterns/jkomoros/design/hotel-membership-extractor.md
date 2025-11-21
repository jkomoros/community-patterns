# Hotel Membership Extractor - Design Document

## Overview

A pattern that searches through Gmail and extracts hotel loyalty program membership numbers using an LLM. Similar to substack-summarizer, it embeds gmail-auth and gmail-importer to access emails.

## Core Functionality

### Email Search & Import
- Uses GmailAuth for authentication
- Uses GmailImporter to fetch emails
- Default Gmail filter query: `from:(marriott.com OR hilton.com OR hyatt.com OR ihg.com OR accor.com)`
- Searches through email body content (markdownContent field) for membership numbers

### LLM Extraction
- Uses LLM to parse email content and extract:
  - Hotel brand/chain name
  - Membership program name (e.g., "Marriott Bonvoy", "Hilton Honors")
  - Membership number
  - Member tier/status (if mentioned)
  - Email date/source for verification

### Data Storage & Display
- Stores extracted memberships in a structured array
- Groups by hotel brand
- Shows:
  - Brand icon/name
  - Program name
  - Membership number (with copy button)
  - Tier/status
  - Source email (date + subject)

## Questions for Review

### 1. Hotel Brands (DECIDED)

✅ **Decision:** Start with ONE hotel chain (Marriott), expand to others in future iterations.

**Future expansion list:**
- Marriott (Bonvoy) ← Start here
- Hilton (Honors)
- Hyatt (World of Hyatt)
- IHG (IHG One Rewards)
- Accor (ALL - Accor Live Limitless)
- Wyndham (Wyndham Rewards)
- Choice Hotels (Choice Privileges)
- Best Western (Best Western Rewards)

### 2. Gmail Query Default

**Options:**
- a) `from:(marriott.com OR hilton.com OR hyatt.com OR ihg.com)` - explicit domains
- b) `subject:(membership OR rewards OR loyalty OR "account number")` - keyword-based
- c) Combination of both
- d) Let user configure completely (empty default)

**My recommendation:** Option (a) with ability for user to customize

### 3. Extraction Confidence & Review

When LLM extracts a membership number, should we:
- a) **Auto-add to list** - Fast, but might include false positives
- b) **Show pending review** - User confirms each extraction before adding
- c) **Confidence score** - LLM rates confidence, only auto-add high-confidence (>80%)

**My recommendation:** Option (c) - auto-add high confidence, flag low confidence for review

### 4. Data Structure (UPDATED)

```typescript
interface MembershipRecord {
  id: string;                    // Unique ID
  hotelBrand: string;           // "Marriott", "Hilton", etc.
  programName: string;          // "Marriott Bonvoy", "Hilton Honors"
  membershipNumber: string;     // The actual number
  tier?: string;                // "Gold", "Platinum", etc.
  sourceEmailId: string;        // Gmail message ID (for tracking)
  sourceEmailDate: string;      // Email date
  sourceEmailSubject: string;   // Email subject
  extractedAt: number;          // Timestamp when extracted
  confidence?: number;          // LLM confidence 0-100
}

// Pattern state tracking:
interface PatternState {
  memberships: MembershipRecord[];
  scannedEmailIds: string[];        // Track which emails we've processed
  lastScanAt: number;                // Timestamp of last scan

  // Smart search tracking:
  searchedBrands: string[];          // Brands we've searched for (found memberships)
  searchedNotFound: BrandSearchRecord[];  // Brands we searched but found NOTHING (with timestamp)
  unsearchedBrands: string[];        // Brands NOT yet searched
}

interface BrandSearchRecord {
  brand: string;                     // Brand name (e.g., "Marriott")
  searchedAt: number;                // Timestamp when we last searched
}
```

✅ **Key improvement:** Track three categories of brands to prevent redundant searches:
1. **searchedBrands** - We found memberships (in `memberships` array)
2. **searchedNotFound** - We looked, found nothing (track timestamp for potential re-search)
3. **unsearchedBrands** - Haven't searched yet (LLM picks from this list)

**Why timestamp matters:** If we searched 6 months ago and found nothing, user might have new emails since then. The timestamp lets us:
- Show user "Last searched: 6 months ago"
- Allow manual re-search
- Future: auto-suggest re-search if >90 days old

**Initial state:**
```typescript
{
  memberships: [],
  scannedEmailIds: [],
  searchedBrands: [],
  searchedNotFound: [],              // Empty array of BrandSearchRecord
  unsearchedBrands: ["Marriott"]     // Start with just Marriott
}
```

### 5. UI Layout (DECIDED)

✅ **Phase 1: Grouped List** - Simple, functional
```
▼ Marriott (2 memberships)
  • Marriott Bonvoy
    Number: 1234567890 [Copy]
    Tier: Platinum Elite
    Source: Welcome email (Jan 2024)
```

✅ **Phase 2: Big Visual Cards** - More polished
```
┌─────────────────────────────────────────────┐
│  🏨                                         │
│  Marriott Bonvoy                            │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ 1234567890                  [Copy]    │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ⭐ Platinum Elite                          │
│  📧 Welcome email • Jan 15, 2024            │
└─────────────────────────────────────────────┘
```

**Key feature:** Copy button prominently displayed with membership number

### 6. Scan Trigger (DECIDED)

**Manual trigger** - User clicks "Scan Emails" button to avoid surprise LLM costs.

✅ **Decision:** Manual scan only

### 7. Duplicate Handling (DECIDED)

✅ **Decision:** LLM should check existing memberships before adding. Don't re-add memberships we already have.

### 8. Additional Features

**Nice-to-haves (Phase 2?):**
- Export to CSV
- Add memberships manually (not from email)
- Edit/update membership records
- Mark memberships as "primary" vs "secondary"
- Quick links to hotel loyalty program websites
- Expiration date tracking (if mentioned in emails)

**Should I include any of these in v1, or keep it simple?**

## Technical Approach - Agent-Based Architecture

### 🚀 NEW DESIGN: Single Agent with Tool Calling

**Radical Architecture Change:** Instead of 2-stage LLM (query generator → fetch all → extractor), use a single agentic LLM with tool calls that iteratively searches and reads emails.

**Why This is Better:**
- **Context-efficient**: Only reads promising emails, not ALL emails from broad queries
- **Naturally iterative**: Agent refines queries based on what it finds
- **Self-correcting**: If query returns promotional emails, agent tries more specific queries
- **Transparent**: Agent's strategy visible in tool call history
- **Flexible**: Agent can adapt strategy organically without rigid 2-stage workflow

### Agent Tools

The agent has access to three tools:

#### 1. `searchGmail(query: string)` → EmailPreview[]

**Purpose:** Search Gmail and return email metadata only (NO content)

**Returns:** Array of up to 20 email previews:
```typescript
interface EmailPreview {
  id: string;           // Gmail message ID
  subject: string;      // Email subject line
  from: string;         // Sender address
  date: string;         // Email date
}
```

**Implementation:** Pattern tool using GmailImporter internally

**Key Detail:** Returns FIFO cached results - does NOT re-fetch from Gmail on subsequent calls with same query

#### 2. `readEmail(emailId: string)` → EmailFull

**Purpose:** Read full content of a specific email

**Returns:** Complete email data:
```typescript
interface EmailFull {
  id: string;
  subject: string;
  from: string;
  date: string;
  content: string;      // Full markdown content
}
```

**Implementation:** Pattern tool that reads from FIFO cache populated by `searchGmail`

**Key Detail:** Does NOT hit Gmail API - reads from local cache only. If email not in cache, returns error prompting agent to search first.

#### 3. `finalResult(memberships: MembershipRecord[])` → void

**Purpose:** Agent calls this when done to return discovered memberships

**Implementation:** Automatically provided by `generateObject` schema

### FIFO Email Cache Design

**Problem:** Agent may search multiple times, read same emails - don't want to hit Gmail API repeatedly

**Solution:** FIFO cache of recently searched emails

```typescript
interface EmailCache {
  entries: Map<string, EmailFull>;  // emailId → full email data
  searchHistory: SearchEntry[];      // Recent searches
  maxEntries: 200;                   // Keep last 200 emails
}

interface SearchEntry {
  query: string;
  timestamp: number;
  emailIds: string[];   // IDs returned by this search
}
```

**Workflow:**
1. `searchGmail(query)` → Fetch from Gmail, add to cache, return previews
2. Cache keeps 200 most recent emails (FIFO eviction)
3. `readEmail(id)` → Read from cache (instant, no API call)
4. If cache miss → Error: "Email not in cache, search first"

### Agent State: brandHistory

**Purpose:** Agent's working memory - NOT just the chat log

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
  emailsFound: number;        // How many emails returned
  emailsRead: number;         // How many agent read full content
  membershipsFound: number;   // How many memberships extracted
  emailIds: string[];         // Which emails (for deduplication)
}
```

**Why This Matters:**
- Other patterns can inspect agent progress
- UI can show "Tried 3 queries for Marriott, found 1 membership"
- Agent can see its own history to avoid repeating failed queries
- Persistent across sessions (survives page refresh)

### Agent Workflow Example

**Scenario:** User clicks "Login and Run" → Agent searches for Marriott membership

```
Agent starts with context:
- brandHistory: []
- Current brand to search: "Marriott"

Agent thinks: "I should start with a broad search"

TOOL CALL: searchGmail("from:marriott.com")
RESULT: 40 emails returned (all previews with subjects)

Agent analyzes subjects:
- "Flash Sale: Caribbean Cruises 50% Off!"
- "Triple Points This Weekend"
- "Your Marriott Bonvoy Statement"  ← Promising!
- ... 37 more promotional emails

Agent thinks: "Most are promotional, but one looks like account email"

TOOL CALL: readEmail("abc123")  # The statement email
RESULT: Full content of statement email

Agent extracts: Membership #1234567890 ✅

Agent thinks: "Found one! But most emails were promotional.
Let me try more specific query for account emails"

TOOL CALL: searchGmail("from:marriott.com subject:(membership OR account OR number)")
RESULT: 5 emails returned

Agent reads 2-3 promising ones, finds same membership again (duplicate)

Agent thinks: "No new memberships. I'll try one more specific query"

TOOL CALL: searchGmail("from:marriott.com subject:(welcome OR confirmation)")
RESULT: 2 emails returned

Agent reads them, finds same membership again

Agent thinks: "I've thoroughly searched Marriott. Moving to next brand."

TOOL CALL: finalResult([
  {
    hotelBrand: "Marriott",
    programName: "Marriott Bonvoy",
    membershipNumber: "1234567890",
    ...
  }
])

Final brandHistory state:
[
  {
    brand: "Marriott",
    attempts: [
      { query: "from:marriott.com", emailsFound: 40, emailsRead: 1, membershipsFound: 1 },
      { query: "from:marriott.com subject:(...)", emailsFound: 5, emailsRead: 2, membershipsFound: 0 },
      { query: "from:marriott.com subject:(welcome...)", emailsFound: 2, emailsRead: 2, membershipsFound: 0 }
    ],
    status: "found"
  }
]
```

### Pattern Structure

```typescript
interface HotelMembershipInput {
  memberships: Default<MembershipRecord[], []>;
  brandHistory: Default<BrandHistory[], []>;
  emailCache: Default<EmailCache, { entries: {}, searchHistory: [], maxEntries: 200 }>;
}

// Components:
// 1. GmailAuth - authentication
// 2. EmailCache - FIFO cache of searched emails
// 3. searchGmail tool - pattern that uses GmailImporter + caches results
// 4. readEmail tool - pattern that reads from cache
// 5. Agent - generateObject with tools, iteratively searches/reads/extracts
// 6. Display component - show extracted memberships + agent progress
```

### Agent System Prompt

```
You are a hotel membership number extractor. Your goal is to find loyalty program
membership numbers from the user's Gmail account.

You have access to these tools:
- searchGmail(query): Search Gmail, returns up to 20 email previews (subject, from, date)
- readEmail(emailId): Read full content of a specific email from cache

Strategy:
1. Start with broad searches like "from:marriott.com"
2. Analyze email subjects to identify promising emails (account/membership emails vs promotions)
3. Read promising emails to extract membership numbers
4. If most results are promotional, refine query with subject filters
5. Track what you've found to avoid duplicates
6. Try 3-5 different queries per brand before moving to next brand
7. When done with all brands, call finalResult with all memberships found

Brands to search: Marriott, Hilton, Hyatt, IHG, Accor

Current state:
- Already found: [existing memberships]
- Search history: [brandHistory]
```

### Auto-Run on Authentication

**UI Flow:**
```
[User lands on pattern]
       ↓
[Shows: "🔒 Login and Run" button]
       ↓
[User clicks → Triggers Gmail auth]
       ↓
[After successful auth → Auto-start agent]
       ↓
[Agent runs with tool calls, updates brandHistory in real-time]
       ↓
[Display: Live progress + extracted memberships]
```

**Implementation:**
- Use `derive()` to watch auth state
- When auth succeeds, trigger `generateObject` with agent
- Agent runs asynchronously, updates state cells as it progresses
- UI reactively shows agent progress via brandHistory

### Performance & UX

**Progress Visibility:**
- Show agent's tool calls in real-time
- Display current brand being searched
- Show query attempts and results
- "Searching Marriott... (attempt 2/5)"

**Error Handling:**
- If Gmail API fails → Show error, allow retry
- If agent gets stuck → Timeout after 5 minutes, show partial results
- If cache miss on readEmail → Agent sees error, knows to search first

**Cost Efficiency:**
- Agent reads ~5-10 emails per brand (not 40+ emails)
- Only pays for content of promising emails
- Avoids re-reading same emails (cache)

## Open Questions

1. Should there be a "refresh" that re-scans all emails?
2. How to handle membership numbers that change (like after a program merger)?
3. Should we validate membership number formats per brand?
4. Integration with other patterns (e.g., store in Person charm)?

## Final Approved Design - Agent Architecture

### ✅ Agent-Based Design Finalized

1. **Auto-Run on Login** - "Login and Run" button authenticates and immediately starts agent
2. **Agent with Tool Calls** - Single `generateObject` with `searchGmail`, `readEmail` tools
3. **Context-Efficient** - Agent only reads promising emails (5-10 per brand), not all emails
4. **FIFO Email Cache** - Prevents re-fetching from Gmail API
5. **Smart Brand Tracking via brandHistory** - Agent records all query attempts with results
6. **Iterative Query Refinement** - Agent tries 3-5 queries per brand, refines based on results
7. **Transparent Progress** - UI shows agent's tool calls and progress in real-time
8. **Start with Multiple Brands** - Marriott, Hilton, Hyatt, IHG, Accor (agent decides order)
9. **No Duplicates** - Agent tracks memberships found to avoid re-adding

### Complete Agent Workflow

```
[User clicks "🔒 Login and Run"]
       ↓
[Gmail OAuth flow]
       ↓
[After auth success → Auto-start agent]
       ↓
[Agent: generateObject with tools]
       ↓
┌─────────────────────────────────────────────┐
│ Agent iteratively:                          │
│                                             │
│ TOOL: searchGmail("from:marriott.com")      │
│   → 40 email previews (subjects only)       │
│                                             │
│ Agent analyzes subjects                     │
│   → Identifies promotional vs account emails│
│                                             │
│ TOOL: readEmail("abc123")                   │
│   → Full content from cache                 │
│                                             │
│ Agent extracts membership #1234567890       │
│                                             │
│ TOOL: searchGmail("from:marriott.com subject:(account)")│
│   → 5 email previews                        │
│                                             │
│ Agent reads 2 promising ones                │
│   → Same membership (duplicate, skip)       │
│                                             │
│ Agent decides: "Done with Marriott"         │
│                                             │
│ Repeat for: Hilton, Hyatt, IHG, Accor...    │
│                                             │
│ TOOL: finalResult([...memberships])         │
└─────────────────────────────────────────────┘
       ↓
[Update state:
 - Add memberships to memberships[]
 - Record attempts in brandHistory[]
 - Keep email cache for potential re-runs]
       ↓
[Display memberships + agent progress history]
```

### Implementation Scope (Phase 1 - Agent Version)

**Core features:**
- ✅ Gmail integration (GmailAuth)
- ✅ FIFO email cache (200 most recent emails)
- ✅ searchGmail tool (pattern returning email previews)
- ✅ readEmail tool (pattern reading from cache)
- ✅ Agent with generateObject + tools
- ✅ brandHistory tracking (all attempts + results)
- ✅ Auto-run on authentication
- ✅ Real-time progress display
- ✅ Multiple brands: Marriott, Hilton, Hyatt, IHG, Accor
- ✅ Grouped list UI with copy buttons

**Future enhancements (Phase 2+):**
- Big visual card UI
- Export to CSV
- Manual add/edit memberships
- Direct links to hotel websites
- "Re-scan" button to search again with fresh queries

### Key Differences from Old Design

| Aspect | Old Design (2-Stage LLM) | New Design (Agent) |
|--------|--------------------------|-------------------|
| Architecture | Query generator → Fetch all → Extractor | Single agent with tool calls |
| Email fetching | Fetch ALL emails from query | Fetch previews, read selectively |
| Query strategy | One query per brand | 3-5 refined queries per brand |
| Context usage | High (all email content) | Low (only promising emails) |
| Iteration | Manual (user clicks "Next") | Automatic (agent decides) |
| Transparency | Hidden LLM steps | Visible tool calls |
| Trigger | Manual "Scan" button | Auto-run on login |

## Next Steps

✅ **Agent-based design approved - ready to implement!**

**Implementation order:**
1. Create FIFO email cache structure
2. Build searchGmail pattern tool (wraps GmailImporter + caches)
3. Build readEmail pattern tool (reads from cache)
4. Implement agent with generateObject + tools
5. Wire up "Login and Run" auto-trigger
6. Build UI showing agent progress + memberships
