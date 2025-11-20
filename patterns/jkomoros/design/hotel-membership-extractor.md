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

### 4. Data Structure

```typescript
interface MembershipRecord {
  id: string;                    // Unique ID
  hotelBrand: string;           // "Marriott", "Hilton", etc.
  programName: string;          // "Marriott Bonvoy", "Hilton Honors"
  membershipNumber: string;     // The actual number
  tier?: string;                // "Gold", "Platinum", etc.
  sourceEmailId: string;        // Gmail message ID
  sourceEmailDate: string;      // Email date
  sourceEmailSubject: string;   // Email subject
  extractedAt: number;          // Timestamp
  confidence?: number;          // LLM confidence 0-100
  verified: boolean;            // User manually verified?
}
```

**Does this structure work? Any fields missing or unnecessary?**

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

### 6. Background vs Manual Scan

**Should the pattern:**
- a) **Auto-scan on load** - Immediately process all matching emails with LLM
- b) **Manual trigger** - User clicks "Scan Emails" button
- c) **Background incremental** - Processes a few at a time, shows progress

**My recommendation:** Option (b) - manual trigger with clear "Scan X emails" button

### 7. Duplicate Handling

What if the same membership number appears in multiple emails?
- a) Keep all occurrences (for audit trail)
- b) Keep only the most recent
- c) Keep one but show "Found in 3 emails"

**My recommendation:** Option (c) - deduplicate but track sources

### 8. Additional Features

**Nice-to-haves (Phase 2?):**
- Export to CSV
- Add memberships manually (not from email)
- Edit/update membership records
- Mark memberships as "primary" vs "secondary"
- Quick links to hotel loyalty program websites
- Expiration date tracking (if mentioned in emails)

**Should I include any of these in v1, or keep it simple?**

## Technical Approach

### Pattern Structure
```typescript
interface HotelMembershipInput {
  gmailFilterQuery: Default<string, "from:(marriott.com OR hilton.com)">;
  limit: Default<number, 100>;
  memberships: Default<MembershipRecord[], []>;
}

// Components:
// 1. GmailAuth - authentication
// 2. GmailImporter - fetch emails
// 3. LLM extraction handler - process email content
// 4. Display component - show extracted memberships
```

### LLM Prompt Strategy

**System prompt:**
```
You are extracting hotel loyalty program membership information from emails.

Look for:
- Hotel brand name (Marriott, Hilton, Hyatt, IHG, etc.)
- Program name (Marriott Bonvoy, Hilton Honors, etc.)
- Membership/account numbers (typically 9-12 digits)
- Tier/status levels (Gold, Platinum, Diamond, etc.)

Return structured JSON with fields: hotelBrand, programName, membershipNumber, tier, confidence (0-100)

If no membership info found, return null.
```

**Should this be configurable or hard-coded?**

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

## Next Steps

Please review and answer:
1. Which hotel brands to include (Q1)
2. Gmail query preference (Q2)
3. Auto-add vs review flow (Q3)
4. Data structure approval (Q4)
5. UI layout preference (Q5)
6. Scan trigger approach (Q6)
7. Duplicate handling (Q7)
8. Phase 1 scope (Q8)

Once approved, I'll implement the pattern following the substack-summarizer architecture.
