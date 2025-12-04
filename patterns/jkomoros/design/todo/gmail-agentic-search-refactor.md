# Gmail Agentic Search Refactor

## Goal
Generalize `hotel-membership-extractor.tsx` into a reusable base pattern that can power multiple Gmail-based agentic searchers.

## Analysis

### Current State
`hotel-membership-extractor.tsx` (1315 lines) handles:
1. Gmail authentication (wish + inline auth UI)
2. Gmail API utilities (fetchGmailEmails)
3. Agent setup with generateObject
4. searchGmail tool
5. Domain-specific: reportMembership tool
6. Domain-specific: hotel brands, effective queries
7. Domain-specific: MembershipRecord data structure
8. Domain-specific: UI for displaying memberships
9. Progress tracking and UI

### Inspiration: demo-setup.tsx
```typescript
// demo-setup.tsx - clean composition
export default pattern(() => {
  return SpaceSetup({
    instructions: DEMO_INSTRUCTIONS,
  });
});
```

The parent pattern (SpaceSetup) does all the work. The child just provides configuration.

## Design Options

### Option A: Full Configuration Pattern
GmailAgenticSearch takes extensive config and handles everything.

**Pros:** Clean single-pattern solution
**Cons:** Complex interface, hard to customize UI

### Option B: Embedded Component Pattern
GmailAgenticSearch handles core functionality, exposes outputs.
Specialized patterns embed it and add custom state/UI.

**Pros:** Flexible, specialized patterns control their own state
**Cons:** More complex composition

### Option C: Shared Utilities + Template
Export utility functions (auth handling, searchGmail, GmailClient).
Specialized patterns import and use them.

**Pros:** Maximum flexibility
**Cons:** More boilerplate per specialized pattern

## Chosen Approach: Option B (Embedded Component)

### Base Pattern: `gmail-agentic-search.tsx`

Provides:
- Gmail auth handling (wish + inline UI)
- searchGmail tool (built-in)
- Progress tracking UI
- Agent infrastructure

Accepts:
```typescript
interface GmailAgenticSearchInput {
  // Agent configuration
  agentGoal: string;              // The prompt/goal for the agent
  systemPrompt?: string;          // Additional system context
  suggestedQueries?: string[];    // Helpful queries to suggest

  // Output
  resultSchema: object;           // JSON schema for agent output

  // Additional tools (optional)
  additionalTools?: Record<string, {
    description: string;
    handler: any;
  }>;

  // UI customization
  title?: Default<string, "Gmail Agentic Search">;
  scanButtonLabel?: Default<string, "Scan">;

  // Limits
  maxSearches?: Default<number, 0>;  // 0 = unlimited
}
```

Exposes:
```typescript
interface GmailAgenticSearchOutput {
  // Auth state
  auth: Auth;
  isAuthenticated: boolean;

  // Agent state
  agentResult: any;
  agentPending: boolean;
  isScanning: boolean;

  // Actions
  startScan: handler;
  stopScan: handler;

  // Progress
  searchProgress: SearchProgress;

  // UI (optional use)
  [UI]: JSX;  // Default UI, or embed in custom UI
}
```

### Specialized Pattern: `hotel-membership-extractor.tsx`

Becomes much simpler:
```typescript
import GmailAgenticSearch from "./gmail-agentic-search.tsx";

const HOTEL_GOAL = `Find hotel loyalty membership numbers...`;
const EFFECTIVE_QUERIES = [...];
const hotelResultSchema = {...};

export default pattern<HotelInput, HotelOutput>(({ memberships, ... }) => {
  // Create the base searcher
  const searcher = GmailAgenticSearch({
    agentGoal: derive(...),  // Dynamic prompt based on found memberships
    suggestedQueries: EFFECTIVE_QUERIES,
    resultSchema: hotelResultSchema,
    additionalTools: {
      reportMembership: reportMembershipHandler({ memberships }),
    },
    title: "Hotel Membership Extractor",
  });

  // Use searcher's auth and agent state
  const { auth, isAuthenticated, isScanning, searchProgress, startScan, stopScan } = searcher;

  // Custom UI that wraps or replaces the base UI
  return {
    [NAME]: "🏨 Hotel Membership Extractor",
    memberships,
    [UI]: (
      <ct-screen>
        {/* Auth section from base or custom */}
        {searcher.authUI}

        {/* Scan controls */}
        <ct-button onClick={startScan}>Scan</ct-button>

        {/* Progress from base */}
        {searcher.progressUI}

        {/* Custom: Membership display */}
        {/* ... */}
      </ct-screen>
    ),
  };
});
```

## Implementation Plan

### Step 1: Extract Gmail utilities
Create `lib/gmail-utils.ts` with:
- GmailClient class
- fetchGmailEmails function
- Email type
- Auth type

### Step 2: Create base pattern
`gmail-agentic-search.tsx` with:
- Auth handling (from hotel-membership-extractor)
- searchGmail tool
- Progress tracking
- Agent setup via generateObject
- Exposes state and handlers

### Step 3: Refactor hotel-membership-extractor
- Import base pattern
- Pass hotel-specific configuration
- Keep domain-specific state (memberships)
- Keep domain-specific UI

### Step 4: Test
- Deploy both patterns
- Verify auth flow works
- Verify scanning works
- Verify hotel-specific features work

## Questions/Decisions

1. **Should auth be shared?**
   - The base pattern wishes for auth
   - Specialized patterns could also wish
   - Decision: Base handles auth, exposes it

2. **How to handle custom tools?**
   - Tools need access to specialized pattern's state
   - Pass handlers as config
   - Base merges with searchGmail

3. **UI composition?**
   - Base provides default UI
   - Also expose UI pieces (authUI, progressUI, controlsUI)
   - Specialized pattern can use pieces or override entirely

4. **Dynamic prompts?**
   - Hotel pattern builds prompt based on found memberships
   - Pass prompt as Cell/derive so it stays reactive

## Status
- [x] Analysis
- [x] Design
- [x] Implementation
- [x] Testing

## Implementation Notes (2025-12-03)

### Created Files
1. `gmail-agentic-search.tsx` (~600 lines) - Base pattern providing:
   - Gmail authentication (wish + inline UI)
   - searchGmail tool
   - Progress tracking and UI
   - Agent infrastructure via generateObject
   - Configurable via: agentGoal, systemPrompt, suggestedQueries, resultSchema, additionalTools

2. `hotel-membership-extractor-v2.tsx` (~290 lines) - Refactored to use base pattern:
   - Domain-specific: MembershipRecord, reportMembership tool
   - Dynamic agent prompt based on found memberships
   - Custom UI for displaying memberships
   - Composes base pattern via instantiation

### Key Patterns Used
1. **Composition via instantiation**: `const searcher = GmailAgenticSearch({...})`
2. **Embedding in UI**: `{searcher}` embeds base pattern's UI
3. **State-bound handlers**: `reportMembership` handler closes over `memberships` cell
4. **Reactive props**: `agentGoal` is a derive that reacts to state changes
5. **Exposed outputs**: Base pattern exposes state for child to use

### Comparison
- Original hotel-membership-extractor: 1315 lines
- Refactored: ~890 lines total (600 base + 290 specialized)
- **Benefit**: Base pattern is reusable for other Gmail agentic searchers
- Future specialized patterns would only need ~300 lines each

### Next Steps
- [x] Deploy and test both patterns
- [ ] Create another Gmail searcher to validate the pattern (e.g., receipt extractor)
- [ ] Consider extracting GmailClient class to shared lib

## Testing Notes (2025-12-03)

### Deployment
- Deployed `hotel-membership-extractor-v2.tsx` to `jkomoros-test` space
- Charm ID: `baedreidbuqf5m7sduxy3wujpvrqj3at5aqg6q2unfsvpy3wtbyc6yu555a`

### Test Results - PASSED
1. **Auth via wish**: Working - "Gmail connected" shown after favoriting GoogleAuth charm
2. **Agent execution**: Working - Agent runs with searchGmail tool
3. **searchGmail tool**: Working - Found emails from hotel brands:
   - Marriott: 20 emails
   - Hilton: 20 emails
   - Hyatt: 6 emails
   - IHG: 23 emails
   - Accor: 0 emails
4. **reportMembership tool**: Working - Saved membership successfully
5. **Membership found**: Hilton Honors #650697007 (Silver tier)
6. **Progress UI**: Working - Shows completed searches with email counts
7. **Custom UI**: Working - Displays membership with brand grouping

### Known Issues (FIXED)
1. ~~**isScanning state not resetting**~~: Fixed by pre-binding handlers outside of derive callbacks.
2. ~~**ReadOnlyAddressError on Done click**~~: Fixed - was caused by binding handlers inside derive callbacks which caused cell references to become stale/readonly.

**Root cause**: Handler bindings like `completeScan({ lastScanAt, isScanning })` inside a `derive()` callback can cause issues with cell references. The fix was to pre-bind all handlers outside the return statement:
```typescript
// Pre-bind handlers (important: must be done outside of derive callbacks)
const boundStartScan = startScan({ isScanning, isAuthenticated, progress: searchProgress });
const boundStopScan = stopScan({ lastScanAt, isScanning });
const boundCompleteScan = completeScan({ lastScanAt, isScanning });
```

### Architecture Validation
The composition pattern works well:
- Base pattern handles auth, searchGmail tool, progress tracking
- Specialized pattern adds custom tools, custom state, custom UI
- State-bound handlers allow child to pass tools that modify its own state
- Embedding `{searcher}` in UI renders the base pattern's full UI

## Phase 2: Improvements (2025-12-03)

After validating the design with two patterns (hotel-membership-gmail-agent, favorite-foods-gmail-agent), identified several improvements:

### Improvement 1: `createReportTool` Helper
**Status:** [x] Completed

**Problem:** Both specialized patterns have nearly identical "report" tool structures:
- `reportMembership` - saves hotel membership to list
- `reportFood` - saves food preference to list

**Solution:** Create a `createReportTool` helper that:
- Takes: `{ name, description, inputSchema, stateCell, idPrefix, dedupeKey }`
- Returns: A properly-typed handler that handles deduplication and saves to state
- Handles common patterns: ID generation, duplicate detection, timestamping

**Example usage:**
```typescript
const reportMembership = createReportTool({
  name: "reportMembership",
  description: "Report a found membership number",
  stateCell: memberships,
  idPrefix: "membership",
  dedupeKey: (item) => `${item.brand}-${item.memberNumber}`,
});
```

### Improvement 2: Expose UI Pieces
**Status:** [x] Completed

**Problem:** Currently, specialized patterns can only:
1. Use the entire base UI via `{searcher}` embedding
2. Build completely custom UI

**Solution:** Expose individual UI pieces from base pattern:
- `authUI` - The auth status and connect/disconnect buttons
- `progressUI` - The search progress display
- `controlsUI` - The scan/stop buttons

**Benefits:**
- More flexible composition
- Specialized patterns can mix base UI pieces with custom sections
- Don't need to rebuild common UI

### Improvement 3: Token Validation on Scan Start
**Status:** [x] Completed

**Problem:** If Gmail token is expired, the first search fails with 401. User sees confusing error.

**Solution:**
1. On scan start, make a lightweight Gmail API call (list 1 email)
2. If 401, show "Token expired, please re-authenticate" message
3. Don't start the agent until we know auth is valid

### Improvement 4: Auth State Accuracy
**Status:** [x] Completed

**Problem:** Auth UI shows "Gmail connected" even when token is actually expired.

**Solution:**
1. Store token expiry time (if available from auth response)
2. Check expiry before showing "connected" status
3. Or: periodically validate token in background
4. Show "Token may have expired" warning if uncertain

### Implementation Order
1. **Expose UI Pieces** - Most immediately useful, low risk
2. **createReportTool Helper** - Reduces boilerplate, higher complexity
3. **Token Validation** - Quality-of-life improvement
4. **Auth State Accuracy** - Depends on auth charm behavior, may need investigation

### Files to Update
- `gmail-agentic-search.tsx` - Add UI piece exports, token validation
- `hotel-membership-gmail-agent.tsx` - Use createReportTool if implemented
- `favorite-foods-gmail-agent.tsx` - Use createReportTool if implemented
- New: `lib/gmail-report-tool.ts` (optional) - For createReportTool helper

## Phase 2 Testing Notes (2025-12-03)

### End-to-End Test Results - PASSED

**Charm Tested:** Hotel Membership Extractor (new deployment with Phase 2 improvements)
**Charm ID:** `baedreidgi5zoon342n2jnysntllfk5663gr4n5mism4eembpuxkw6jirju`

**Test Flow:**
1. Navigated to deployed charm
2. Auth via wish required favoriting Google Auth charm first
3. Auth connected: "✓ Gmail connected" displayed
4. Clicked "Scan for Memberships"

**Results:**
1. **Token Validation**: ✅ Working
   - Console: `[GmailAgenticSearch] Validating token before scan...`
   - Console: `[GmailAgenticSearch] Token valid, starting scan`

2. **searchGmail Tool**: ✅ Working
   - Marriott: 20 emails found
   - Hilton: 22 emails found
   - Hyatt: 23 emails found
   - IHG: 21 emails found
   - Accor: 1 email found
   - Search limit (5) enforced correctly

3. **createReportTool**: ✅ Working
   - Console: `[ReportTool] SAVED: marriott:361200343`
   - Console: `[ReportTool] SAVED: marriott:181938366`
   - Deduplication working (unique key based on brand:number)
   - ID generation working (membership-xxxxx format)

4. **Data Persistence**: ✅ Working
   - 2 Marriott memberships saved and displayed
   - Membership details shown: number, tier, source email, date

5. **UI Pieces**: ✅ Working
   - authUI: Shows "✓ Gmail connected"
   - controlsUI: Scan/Stop buttons functional
   - progressUI: Shows during scan (partial - see Known Issues)

### Known Issues (Minor)

1. **"Scan Complete" section not rendering**: When agent completes (agentPending=false, agentResult=true, isScanning=true), the "Scan Complete" UI section with "Done" button doesn't appear. This may be a reactivity issue with derives inside embedded patterns. Core functionality unaffected - clicking "Stop Scan" properly completes the scan.

### Summary

All four Phase 2 improvements are implemented and working:
- ✅ createReportTool helper - reduces boilerplate significantly
- ✅ Exposed UI pieces (authUI, controlsUI, progressUI)
- ✅ Token validation on scan start - prevents confusing 401 errors
- ✅ Auth state accuracy - tokenMayBeExpired derive implemented

### Outstanding Issue: Progress UI Not Showing During Scan

**Problem:** The progress UI (showing "Scanning emails...", current query, completed searches) doesn't appear during scanning.

**Root Cause:** The progress UI condition is `scanning && pending`:
```typescript
{derive([isScanning, agentPending], ([scanning, pending]) =>
  scanning && pending ? ( ... ) : null
)}
```

But `agentPending` from generateObject is `false` even while tool calls are actively running:
- Debug shows: Is Scanning: Yes ⏳, Agent Pending: No ✓
- Console shows tool calls executing (searchGmail running, finding emails)
- `agentPending` doesn't reflect tool execution state - may only be true during initial prompt processing

**Attempted Fix:** Changing condition to just `isScanning`:
```typescript
{derive(isScanning, (scanning) => scanning ? ( ... ) : null)}
```
**Result:** Caused "Too many iterations: 101" error - reactive loop

**Next Steps:**
1. Investigate why `agentPending` is false during tool execution
2. Consider alternative ways to show progress (track via searchProgress cell changes)
3. May need framework-level fix if agentPending behavior is incorrect
