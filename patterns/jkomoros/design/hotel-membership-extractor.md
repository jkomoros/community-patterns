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

## Technical Approach (UPDATED)

### Smart Incremental Scanning

**Key Innovation:** LLM-driven search strategy based on what we already have.

**Flow:**
1. User clicks "Scan for Memberships"
2. System asks LLM: "Pick a brand from unsearchedBrands and generate Gmail query"
3. LLM suggests query (e.g., "from:marriott.com")
4. System fetches emails matching that query
5. Filter out emails we've already scanned (by email ID)
6. LLM processes only NEW emails
7. LLM extracts memberships, checking against existing list to avoid duplicates
8. **Update tracking:**
   - Add new memberships to `memberships`
   - Move brand from `unsearchedBrands` to:
     - `searchedBrands` (if found memberships) OR
     - `searchedNotFound` with timestamp (if found nothing)
   - Add email IDs to `scannedEmailIds`

**Benefits:**
- Incremental discovery (find one hotel at a time)
- No duplicate work (track scanned emails)
- Smart search (LLM knows what to look for next)
- Cost-efficient (only scan new emails)

### Pattern Structure
```typescript
interface HotelMembershipInput {
  memberships: Default<MembershipRecord[], []>;
  scannedEmailIds: Default<string[], []>;  // Track processed emails
  lastScanAt: Default<number, 0>;          // Timestamp of last scan
  suggestedQuery: Default<string, "">;     // LLM's next suggested search
}

// Components:
// 1. GmailAuth - authentication
// 2. GmailImporter - fetch emails (dynamic query)
// 3. LLM query generator - suggest next search based on existing memberships
// 4. LLM extractor - process NEW emails, avoid duplicates
// 5. Display component - show extracted memberships
```

### LLM Prompt Strategy (UPDATED)

**Two-stage LLM approach:**

#### Stage 1: Query Generator (UPDATED)
```
Given the user's hotel membership search state, suggest the next Gmail search query.

Current state:
- Brands with memberships found: [searchedBrands]
- Brands searched but nothing found: [searchedNotFound with timestamps]
- Brands not yet searched: [unsearchedBrands]

Task: Pick ONE brand from unsearchedBrands and generate a Gmail query for it.

Note: searchedNotFound includes timestamps showing when we last searched.
These brands had no results before, but might have new emails since then.
Focus on unsearchedBrands first.

Suggest a Gmail query that:
- Searches emails from that specific hotel chain
- Uses from: filter with the hotel's domain (e.g., "from:marriott.com")
- Is focused and specific

Return ONLY the query string (e.g., "from:marriott.com")

If unsearchedBrands is empty, return: "done"
```

#### Stage 2: Membership Extractor
```
Extract hotel loyalty program membership information from emails.

IMPORTANT: Only extract NEW memberships. Do not return memberships already in this list:
[existing membership numbers]

Look for:
- Hotel brand name (Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, etc.)
- Program name (Marriott Bonvoy, Hilton Honors, etc.)
- Membership/account numbers (typically 9-12 digits)
- Tier/status levels (Gold, Platinum, Diamond, etc.)

Return array of JSON objects with fields:
{
  hotelBrand: string,
  programName: string,
  membershipNumber: string,
  tier?: string,
  confidence: number (0-100)
}

Return empty array if no NEW memberships found.
```

### Performance Considerations

- Process emails in batches (10 at a time?)
- Show progress indicator
- Allow cancellation
- Cache results to avoid re-processing

## Open Questions

1. Should there be a "refresh" that re-scans all emails?
2. How to handle membership numbers that change (like after a program merger)?
3. Should we validate membership number formats per brand?
4. Integration with other patterns (e.g., store in Person charm)?

## Final Approved Design

### ✅ All Decisions Finalized

1. **Manual Trigger** - User clicks "Scan" button to start
2. **Smart Brand Tracking** - Three categories:
   - `unsearchedBrands` - Brands not yet searched (LLM picks from here)
   - `searchedBrands` - Brands where we found memberships
   - `searchedNotFound` - Brands searched but found nothing (with timestamp for potential re-search)
3. **Start Small** - Launch with ONE brand (Marriott), expand later
4. **Email Tracking** - Track scanned email IDs to avoid re-processing
5. **No Duplicates** - LLM checks existing memberships before adding
6. **Two-Stage LLM**:
   - Stage 1: Generate next Gmail search query (from unsearchedBrands)
   - Stage 2: Extract memberships from emails
7. **UI Evolution**:
   - Phase 1: Grouped list (simple, functional)
   - Phase 2: Big visual cards (polished)
   - Copy button for membership numbers

### Complete Workflow

```
[User clicks "Scan"]
       ↓
[LLM: Pick brand from unsearchedBrands] → "from:marriott.com"
       ↓
[Fetch emails matching query]
       ↓
[Filter out scannedEmailIds]
       ↓
[LLM: Extract NEW memberships]
       ↓
[Update state:
 - Add memberships
 - Move brand: unsearched → searched/searchedNotFound
 - Add email IDs to scannedEmailIds]
       ↓
[Display in grouped list with [Copy] buttons]
```

### Implementation Scope (Phase 1)

**Core features:**
- ✅ Gmail integration (GmailAuth + GmailImporter)
- ✅ Smart brand tracking (unsearched/searched/notfound)
- ✅ Two-stage LLM extraction
- ✅ Email deduplication
- ✅ Grouped list UI with copy buttons
- ✅ Marriott support only

**Future enhancements (Phase 2+):**
- Big visual card UI
- Additional hotel brands (Hilton, Hyatt, IHG, etc.)
- Export to CSV
- Manual add/edit
- Direct links to hotel websites

## Next Steps

✅ **Design approved - ready to implement!**

Pattern will follow substack-summarizer architecture with smart brand tracking system.
