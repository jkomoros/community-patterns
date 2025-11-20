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

### 1. Hotel Brands - Which to include?

**Major chains I'm thinking:**
- Marriott (Bonvoy)
- Hilton (Honors)
- Hyatt (World of Hyatt)
- IHG (IHG One Rewards)
- Accor (ALL - Accor Live Limitless)
- Wyndham (Wyndham Rewards)
- Choice Hotels (Choice Privileges)
- Best Western (Best Western Rewards)

**Should I:**
- a) Start with top 5 and expand later?
- b) Include all major chains from the start?
- c) Make it configurable with a list user can edit?

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
  scannedEmailIds: string[];    // Track which emails we've processed
  lastScanAt: number;            // Timestamp of last scan
  suggestedQuery: string;        // LLM's next suggested Gmail query
}
```

✅ **Updated with email tracking for incremental scanning**

### 5. UI Layout

**Option A - Cards:**
```
┌─────────────────────────────────────┐
│ 🏨 Marriott Bonvoy                 │
│ Number: 1234567890     [Copy]       │
│ Tier: Platinum Elite                │
│ Source: Welcome email (Jan 2024)    │
└─────────────────────────────────────┘
```

**Option B - Table:**
```
Brand          | Number      | Tier     | Source
──────────────────────────────────────────────
Marriott       | 1234567890  | Platinum | Jan 2024
Hilton         | 9876543210  | Gold     | Feb 2024
```

**Option C - Grouped List:**
```
▼ Marriott (2 memberships)
  • Marriott Bonvoy: 1234567890 (Platinum)
  • Ritz-Carlton Rewards: 0987654321

▼ Hilton (1 membership)
  • Hilton Honors: 9876543210 (Gold)
```

**My recommendation:** Option C for better organization

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
2. System asks LLM: "Given these existing memberships [list], what Gmail query should we try next to find more hotel memberships?"
3. LLM suggests query (e.g., "from:hyatt.com" if we don't have Hyatt yet)
4. System fetches emails matching that query
5. Filter out emails we've already scanned (track by email ID)
6. LLM processes only NEW emails
7. LLM extracts memberships, checking against existing list to avoid duplicates
8. Add new memberships to collection

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

#### Stage 1: Query Generator
```
Given the user's existing hotel memberships, suggest the next Gmail search query
to find more hotel loyalty program memberships.

Current memberships: [list of brands we have]

Suggest a Gmail query that:
- Searches for emails from major hotel chains not yet found
- Uses from: or subject: filters
- Focuses on one brand at a time for efficiency

Return just the query string (e.g., "from:hyatt.com" or "from:ihg.com")

If we have all major brands, suggest: "done"
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

## Approved Design Summary

### ✅ Key Decisions Made

1. **Manual Trigger** - User clicks "Scan" button to start
2. **Smart Incremental Scanning** - LLM suggests next search query based on existing memberships
3. **Email Tracking** - Track scanned email IDs to avoid re-processing
4. **No Duplicates** - LLM checks existing memberships before adding
5. **Two-Stage LLM**:
   - Stage 1: Generate next Gmail search query
   - Stage 2: Extract memberships from emails

### Workflow

```
[User clicks "Scan"]
       ↓
[LLM: What query should we try next?]
       ↓
[Fetch emails matching query]
       ↓
[Filter out already-scanned email IDs]
       ↓
[LLM: Extract NEW memberships only]
       ↓
[Display updated membership list]
```

### Remaining Questions

1. **Hotel brands** - Include all major chains (Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, Choice, Best Western)?
2. **UI layout** - Grouped list (recommended) or table or cards?
3. **Phase 1 scope** - Just extraction/display, or also include export/edit features?

## Next Steps

Once you answer the remaining questions, I'll implement the pattern with:
- Smart incremental scanning architecture
- Email tracking system
- Two-stage LLM approach
- Following substack-summarizer pattern structure
