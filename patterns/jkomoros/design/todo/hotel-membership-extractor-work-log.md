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

## Current Issues to Fix

### 1. Gmail Auth Prominence (HIGH PRIORITY) ✅ DONE
**Problem:** Gmail auth was hidden in a collapsed "Settings" section, but nothing works without it!
**Solution Implemented:**
- Large, prominent red warning box (24px padding, 3px border)
- Clear heading: "🔒 Gmail Authentication Required"
- Explanation text about why auth is needed
- **Auth UI embedded directly in the warning box** - no need to dig into Settings
- Only shows when user is NOT authenticated
**Status:** ✅ COMPLETE - Tested and compiles successfully

### 2. Auto-Fetch Emails (HIGH PRIORITY) - NEEDS SOLUTION
**User Requirement:** "I still want a solution to the 'user doesn't have to hit fetch emails button'"

**Problem:** After LLM generates query, user must manually click "Fetch Emails" in GmailImporter

**Current Architecture:**
- GmailImporter is a monolithic pattern that:
  - Manages auth state (from authCharm input)
  - Manages settings (gmailFilterQuery, limit, historyId)
  - Has a `googleUpdater` handler that fetches emails
  - Exports `bgUpdater` handler (bound version of googleUpdater)
  - Button click triggers bgUpdater handler
- Problem: Handlers can't be called from reactive computed() blocks
- Problem: No way to trigger fetch when query changes reactively

**SOLUTION: Refactor GmailImporter into Composable Pieces**

**Approach: Split into 3 patterns**
1. **GmailFetcher** (new) - Core fetch logic, reactively triggered
   - Inputs: auth, settings (gmailFilterQuery, limit, historyId)
   - Has a `triggerFetch` cell (string) - when changed, triggers fetch
   - Uses computed() to watch triggerFetch cell
   - When triggerFetch changes AND authenticated, calls internal fetch logic
   - Outputs: emails array, updated settings (with new historyId)
   - Key insight: Uses computed() to watch a trigger cell, not a handler

2. **GmailFetchButton** (new) - Manual trigger UI component
   - Inputs: auth, settings
   - Returns: Handler that can be called to trigger fetch
   - Simple wrapper around a button that updates a trigger cell
   - This is what other patterns can use if they want manual control

3. **GmailImporter** (refactored) - Backward-compatible composition
   - Composes GmailFetcher + GmailFetchButton
   - Maintains exact same API as current GmailImporter
   - No breaking changes for existing users
   - Just internally uses the new composable pieces

**How Hotel Membership Extractor Would Use This:**
```typescript
// Use GmailFetcher directly (not GmailImporter)
const fetcher = GmailFetcher({
  auth,
  settings: {
    gmailFilterQuery: autoQuery,  // Derived cell
    limit,
    historyId: "",
  },
  triggerFetch: derive([autoQuery, isScanning], ([query, scanning]) => {
    // Generate unique trigger whenever query changes during scanning
    return scanning && query ? `fetch-${query}-${Date.now()}` : "";
  }),
});

const emails = fetcher.emails;
```

**Trigger Cell Pattern:**
- GmailFetcher watches `triggerFetch` cell with computed()
- Whenever triggerFetch changes to a non-empty string, fetch executes
- Parent patterns can derive() a trigger value based on any reactive state
- This is the reactive equivalent of calling a handler

**Implementation Plan:**
1. Create `gmail-fetcher.tsx` - Core reactive fetch logic
2. Create `gmail-fetch-button.tsx` - Manual trigger UI wrapper (optional)
3. Refactor `gmail-importer.tsx` to compose the above two
4. Update hotel-membership-extractor to use GmailFetcher directly
5. Test that existing GmailImporter users are unaffected

**Status:** BLOCKED - Framework limitation discovered
**Priority:** HIGH - User explicitly wants this solved, not deferred

**INVESTIGATION RESULT:** After extensive testing, automatic save using `computed()` is NOT possible in the current CommonTools framework:

1. **computed()** is designed for creating reactive computed VALUES, not performing side effects
2. Inside `computed()`, you cannot call `.set()` on cells - this causes runtime errors
3. The framework architecture is:
   - `derive()` / `computed()`: Pure value computations only (no side effects)
   - `handler()`: Side effects must be triggered by explicit user actions

4. **Attempted Solutions:**
   - ✗ Using `computed()` with `.get()` on cells → Runtime error: "extractorResult.get is not a function"
   - ✗ Using `computed()` without `.get()` → Runtime error: "isScanning.get is not a function"
   - ✗ Using `computed()` to call `.set()` on cells → This is fundamentally not supported

**CONCLUSION:** The CommonTools framework does not support automatic side effects triggered by reactive changes. The manual save button approach is the correct pattern.

**RECOMMENDATION:** Keep the manual save button, OR request framework enhancement to support reactive side effects.

### 3. Smarter Query Iteration (HIGH PRIORITY) - NEEDS IMPLEMENTATION
**User Requirement:** "The LLM should see that that query was tried, and returned email but didn't get membership numbers, and see 'OK the user clearly gets marriott emails but I need to be better at finding the membership number with a more specific query'"

**ROOT CAUSE DISCOVERED:** ✅ Emails DO have content! Debug logging confirmed Gmail API works perfectly.

**ACTUAL PROBLEM:** The LLM query generator is too simplistic:
- Query: `from:marriott.com` → Found 40 emails → ❌ 0 memberships
- Why? Emails are promotional (cruises, sales, points bonuses) - NOT account/membership emails
- Current system marks Marriott as "searched" and moves on
- **Should instead:** Try more specific queries until finding membership emails

**Current Data Model (Too Simplistic):**
```typescript
searchedBrands: string[]          // Found memberships
searchedNotFound: BrandSearchRecord[]  // No emails found
unsearchedBrands: string[]        // Not yet tried
```

**Problem:** Tracks only "searched yes/no" per brand, not query history with results

**REQUIRED: Enhanced Data Model with Query History:**
```typescript
interface QueryAttempt {
  query: string;              // The Gmail query tried
  attemptedAt: number;        // Timestamp
  emailsFound: number;        // How many emails returned
  membershipsFound: number;   // How many memberships extracted
  emailIds: string[];         // Which emails (for deduplication)
}

interface BrandSearchHistory {
  brand: string;
  attempts: QueryAttempt[];   // All query attempts for this brand
  status: "searching" | "found" | "exhausted";  // Current status
}

// Replace current tracking with:
brandHistory: BrandSearchHistory[]
```

**REQUIRED: Smarter LLM Query Generator Prompt:**

The query generator LLM needs to see:
1. **All previous queries tried** for each brand
2. **Results of each query**: emails found, memberships found
3. **What worked for other brands** (learning from success patterns)
4. **Current brand's status**: first attempt vs. refining query

**Example Query Progression:**
```
Marriott - Attempt 1:
  Query: "from:marriott.com"
  Result: 40 emails, 0 memberships (promotional content)

Marriott - Attempt 2 (LLM refines based on failure):
  Query: "from:marriott.com subject:(membership OR account OR number OR confirmation OR welcome)"
  Result: 5 emails, 1 membership found! ✅

Marriott - Status: FOUND

Hilton - Attempt 1 (LLM learns from Marriott success):
  Query: "from:hilton.com subject:(membership OR account OR honors)"
  Result: 3 emails, 1 membership found! ✅
```

**Implementation Plan:**

1. **Update Data Model (hotel-membership-extractor.tsx):**
   - Replace `searchedBrands`, `searchedNotFound`, `unsearchedBrands`
   - Add `brandHistory: BrandSearchHistory[]`
   - Track query attempts with detailed results

2. **Enhance Query Generator LLM:**
   - Provide full `brandHistory` in prompt
   - Instruct to analyze failed queries and refine
   - Maximum 3-5 attempts per brand before marking "exhausted"
   - Learn from successful queries for other brands

3. **Update Extractor Auto-Save Handler:**
   - Record query attempt with results in `brandHistory`
   - Don't mark brand as "done" until memberships found OR max attempts reached
   - If memberships found, mark status as "found"
   - If max attempts with no success, mark as "exhausted"

4. **Update Query Generator to Continue Same Brand:**
   - Current behavior: Pick from `unsearchedBrands`
   - New behavior:
     - Check if any brand has status "searching" (incomplete attempts)
     - Continue refining queries for that brand
     - Only pick new brand when current brand status is "found" or "exhausted"

**Why This Matters:**
- Handles promotional vs. account emails correctly
- Learns from successes across brands
- Doesn't give up after one query
- Maximizes membership discovery

**Status:** TODO - Requires data model changes and LLM prompt enhancements
**Priority:** CRITICAL - Current system can't find memberships in practice
**Next Step:** Update data model to track query history

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
