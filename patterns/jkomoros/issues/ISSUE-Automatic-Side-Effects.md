# Issue: How to Perform Automatic Side Effects on Reactive Changes?

## Summary

I'm building a pattern that needs to automatically save data when an LLM extraction completes. I've tried using `computed()` to watch for completion and trigger saves, but encountered runtime errors. **What's the correct way to perform side effects automatically when reactive values change?**

## Use Case

**Pattern:** Hotel Membership Extractor - automatically extracts hotel loyalty numbers from Gmail

**Workflow:**
1. LLM generates a Gmail search query
2. Gmail API fetches emails
3. LLM extracts membership numbers from emails
4. **Need:** Automatically save results to pattern state when extraction completes

**Why automatic save is needed:**
- Multiple iterations: LLM refines queries based on previous results (e.g., if first query finds promotional emails but no memberships, try more specific query)
- User shouldn't manually click "Save" after each iteration
- Need seamless iteration: Extract → Auto-save → Refine query → Extract → Auto-save → ...

## Current State (Working - Manual Save)

The pattern works correctly with a manual save button, but requires user to click after each extraction:

```typescript
// Handler for manual save (WORKS)
const saveResults = handler<unknown, {
  memberships: Cell<Default<MembershipRecord[], []>>;
  brandHistory: Cell<Default<BrandSearchHistory[], []>>;
  extractorResult: Cell<any>;
  queryResult: Cell<any>;
  emails: Cell<any[]>;
}>((_, state) => {
  const extracted = state.extractorResult.get();
  const queryResultData = state.queryResult.get();
  const emailsList = state.emails.get();

  // ... save logic: update memberships, brandHistory, etc.
  state.memberships.set([...currentMemberships, ...newMemberships]);
  state.brandHistory.set(updatedHistory);
});

// UI Button
<ct-button onClick={saveResults({ memberships, brandHistory, extractorResult, queryResult, emails })}>
  💾 Save Results
</ct-button>
```

## What We Tried (Failed Attempts)

### Attempt 1: Using `computed()` with `.get()`

```typescript
computed(() => {
  // Watch for extraction completion
  const extracted = extractorResult.get();
  const queryResultData = queryResult.get();
  const scanning = isScanning.get();
  const pending = extractorPending.get();
  const emailsList = emails.get();

  if (!scanning || pending || !extracted || !queryResultData) return;

  // Update cells with save logic
  memberships.set([...currentMemberships, ...newMemberships]);
  brandHistory.set(updatedHistory);
});
```

**Error:**
```
TypeError: extractorResult.get is not a function
```

**Analysis:** `extractorResult` from `generateObject` is already a value, not a cell.

---

### Attempt 2: Using `computed()` without `.get()` on generateObject results

```typescript
const autoSave = computed(() => {
  // Note: extractorResult and queryResult are already values (not cells)
  const extracted = extractorResult;
  const queryResultData = queryResult;
  const scanning = isScanning.get();  // Pattern input cell
  const pending = extractorPending;   // Already a boolean
  const emailsList = emails.get();    // Pattern output cell

  if (!extracted || !queryResultData || !emailsList) return;
  if (!scanning || pending) return;

  // Save logic
  memberships.set([...currentMemberships, ...newMemberships]);
  brandHistory.set(updatedHistory);

  return true;
});
```

**Error:**
```
TypeError: isScanning.get is not a function
```

**Analysis:** Inside `computed()`, even pattern input cells don't have `.get()` method.

---

## Full Pattern Code

Here's the complete pattern showing where automatic save is needed:

```typescript
/// <cts-enable />
import { Cell, computed, Default, derive, generateObject, handler, NAME, pattern, UI } from "commontools";
import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

interface MembershipRecord {
  id: string;
  hotelBrand: string;
  programName: string;
  membershipNumber: string;
  tier?: string;
  sourceEmailId: string;
  sourceEmailDate: string;
  sourceEmailSubject: string;
  extractedAt: number;
  confidence?: number;
}

interface QueryAttempt {
  query: string;
  attemptedAt: number;
  emailsFound: number;
  membershipsFound: number;
  emailIds: { [id: string]: true };
}

interface BrandSearchHistory {
  brand: string;
  attempts: QueryAttempt[];
  status: "searching" | "found" | "exhausted";
}

interface HotelMembershipInput {
  memberships: Default<MembershipRecord[], []>;
  scannedEmailIds: Default<string[], []>;
  lastScanAt: Default<number, 0>;
  brandHistory: Default<BrandSearchHistory[], [{ brand: "Marriott"; attempts: []; status: "searching" }]>;
  searchedBrands: Default<string[], []>;
  searchedNotFound: Default<any[], []>;
  unsearchedBrands: Default<string[], []>;
  currentQuery: Default<string, "">;
  isScanning: Default<boolean, false>;
  queryGeneratorInput: Default<string, "">;
  gmailFilterQuery: Default<string, "">;
  limit: Default<number, 50>;
  auth: Default<{
    token: string;
    tokenType: string;
    scope: string[];
    expiresIn: number;
    expiresAt: number;
    refreshToken: string;
    user: { email: string; name: string; picture: string };
  }, {
    token: "";
    tokenType: "";
    scope: [];
    expiresIn: 0;
    expiresAt: 0;
    refreshToken: "";
    user: { email: ""; name: ""; picture: "" };
  }>;
}

export default pattern<HotelMembershipInput>(({
  memberships,
  scannedEmailIds,
  lastScanAt,
  brandHistory,
  searchedBrands,
  searchedNotFound,
  unsearchedBrands,
  currentQuery,
  isScanning,
  queryGeneratorInput,
  gmailFilterQuery,
  limit,
  auth,
}) => {
  const authCharm = GmailAuth({ auth: auth });

  // Stage 1: LLM Query Generator - generates Gmail search queries
  const queryGeneratorPrompt = derive(brandHistory, (history: BrandSearchHistory[]) => {
    return JSON.stringify({ brandHistory: history });
  });

  const { result: queryResult, pending: queryPending } = generateObject({
    system: `Given the brand search history, suggest the next Gmail query to try.

You can see complete history of all query attempts for each brand. Analyze previous attempts:
- What queries were tried?
- Did they find emails but no memberships? (query too broad, got promotional emails)
- Did they find no emails? (query too narrow)

Refine queries based on what you learned. Maximum 5 attempts per brand.

Example progression for Marriott:
- Attempt 1: "from:marriott.com" → 40 emails, 0 memberships (too broad)
- Attempt 2: "from:marriott.com subject:(account OR membership)" → 5 emails, 1 membership ✅

Return:
- selectedBrand: The brand to search next
- query: The Gmail query string
- reasoning: Why you chose this query`,
    prompt: derive([queryGeneratorPrompt, queryGeneratorInput], ([state, trigger]) =>
      trigger ? `${state}\n---TRIGGER-${trigger}---` : ""
    ),
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        selectedBrand: { type: "string" },
        query: { type: "string" },
        reasoning: { type: "string" },
      },
      required: ["selectedBrand", "query"],
    },
  });

  // Auto-use LLM query when available
  const autoQuery = derive(
    [queryResult, queryPending, isScanning, gmailFilterQuery],
    ([result, pending, scanning, manualQuery]) => {
      if (scanning && !pending && result && result.query && result.query !== "done") {
        return result.query;
      }
      return manualQuery;
    }
  );

  // Fetch emails with auto-generated query
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: autoQuery,
      limit,
      historyId: "",
    },
    authCharm: authCharm,
  });

  const emails = importer.emails;

  // Automatically trigger extraction when emails arrive
  const autoExtractorTrigger = derive([emails, queryPending, isScanning], ([emailList, qPending, scanning]) => {
    if (!emailList || !Array.isArray(emailList)) return "";
    if (scanning && !qPending && emailList.length > 0) {
      const emailIds = emailList.map((e: any) => e.id).sort().join(",");
      return `AUTO-${emailIds}`;
    }
    return "";
  });

  // Stage 2: LLM Membership Extractor
  const extractorPrompt = derive(
    [emails, memberships],
    ([emailList, existingMemberships]: [any[], MembershipRecord[]]) => {
      const safeEmailList = (emailList && Array.isArray(emailList)) ? emailList : [];
      const safeExistingMemberships = (existingMemberships && Array.isArray(existingMemberships)) ? existingMemberships : [];
      const existingNumbers = safeExistingMemberships.map(m => m.membershipNumber);

      return JSON.stringify({
        emails: safeEmailList.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          date: email.date,
          content: email.markdownContent || email.snippet,
        })),
        existingMembershipNumbers: existingNumbers,
      });
    }
  );

  const { result: extractorResult, pending: extractorPending } = generateObject({
    system: `Extract hotel loyalty program membership information from emails.

Look for:
- Hotel brand name (Marriott, Hilton, Hyatt, IHG, etc.)
- Program name (Marriott Bonvoy, Hilton Honors, etc.)
- Membership numbers (typically 9-12 digits)
- Tier levels (Gold, Platinum, Diamond, etc.)

Return empty array if no NEW memberships found.`,
    prompt: derive([extractorPrompt, autoExtractorTrigger], ([data, trigger]) =>
      trigger ? `${data}\n---TRIGGER-${trigger}---` : ""
    ),
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        memberships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hotelBrand: { type: "string" },
              programName: { type: "string" },
              membershipNumber: { type: "string" },
              tier: { type: "string" },
              sourceEmailId: { type: "string" },
              sourceEmailSubject: { type: "string" },
              sourceEmailDate: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["hotelBrand", "programName", "membershipNumber", "sourceEmailId", "sourceEmailSubject", "sourceEmailDate", "confidence"],
          },
        },
      },
      required: ["memberships"],
    },
  });

  // ============================================
  // THIS IS WHERE WE NEED AUTOMATIC SAVE
  // ============================================
  //
  // When extractorResult completes and extractorPending becomes false,
  // we need to automatically:
  // 1. Read extracted memberships from extractorResult
  // 2. Read query info from queryResult
  // 3. Read current state from memberships, brandHistory cells
  // 4. Update memberships with new findings
  // 5. Update brandHistory with this query attempt
  // 6. Update lastScanAt timestamp
  //
  // Currently using computed() for this, but it doesn't work:

  computed(() => {
    // This fails - how should we do this?
    const extracted = extractorResult.get();  // ERROR: extractorResult.get is not a function
    const queryResultData = queryResult.get();
    const scanning = isScanning.get();         // ERROR: isScanning.get is not a function
    const pending = extractorPending.get();
    const emailsList = emails.get();

    if (!scanning || pending || !extracted || !queryResultData) return;

    const selectedBrand = queryResultData.selectedBrand;
    const usedQuery = queryResultData.query;
    if (!selectedBrand || !usedQuery) return;

    const currentMemberships = memberships.get();
    const scanned = scannedEmailIds.get();
    const currentHistory = brandHistory.get();

    const extractedMemberships = extracted.memberships || [];

    // Add new memberships with IDs
    const newMemberships = extractedMemberships.map((m: any) => ({
      ...m,
      id: `${m.hotelBrand}-${m.membershipNumber}-${Date.now()}`,
      extractedAt: Date.now(),
    }));

    // Update memberships array
    memberships.set([...currentMemberships, ...newMemberships]);

    // Update scanned email IDs
    const emailIds = emailsList.map((e: any) => e.id);
    scannedEmailIds.set([...new Set([...scanned, ...emailIds])]);

    // Update brandHistory with query attempt
    const emailIdsSet: { [id: string]: true } = {};
    emailIds.forEach((id: string) => {
      emailIdsSet[id] = true;
    });

    const attempt: QueryAttempt = {
      query: usedQuery,
      attemptedAt: Date.now(),
      emailsFound: emailsList.length,
      membershipsFound: newMemberships.length,
      emailIds: emailIdsSet,
    };

    // Find or create brand history entry
    let brandEntry = currentHistory.find(h => h.brand === selectedBrand);
    let updatedHistory: BrandSearchHistory[];

    if (brandEntry) {
      const newAttempts = [...brandEntry.attempts, attempt];
      let newStatus: "searching" | "found" | "exhausted" = brandEntry.status;
      if (newMemberships.length > 0) {
        newStatus = "found";
      } else if (newAttempts.length >= 5) {
        newStatus = "exhausted";
      } else {
        newStatus = "searching";
      }

      updatedHistory = currentHistory.map(h =>
        h.brand === selectedBrand
          ? { ...h, attempts: newAttempts, status: newStatus }
          : h
      );
    } else {
      const newStatus: "searching" | "found" | "exhausted" =
        newMemberships.length > 0 ? "found" : "searching";

      updatedHistory = [
        ...currentHistory,
        {
          brand: selectedBrand,
          attempts: [attempt],
          status: newStatus,
        },
      ];
    }

    brandHistory.set(updatedHistory);
    lastScanAt.set(Date.now());
  });

  // Handler to start scan workflow
  const startScan = handler<unknown, {
    queryGeneratorInput: Cell<string>;
    isScanning: Cell<Default<boolean, false>>;
    currentQuery: Cell<Default<string, "">>;
    auth: Cell<Default<any, any>>;
  }>((_, state) => {
    const authData = state.auth.get();
    const authenticated = !!(authData && authData.token && authData.user && authData.user.email);

    if (!authenticated) return;

    state.isScanning.set(true);
    state.currentQuery.set("");
    state.queryGeneratorInput.set(`START-${Date.now()}`);
  });

  return {
    [NAME]: "🏨 Hotel Membership Extractor",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2 style="margin: 0; fontSize: 18px;">Hotel Memberships</h2>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 16px;">
            <ct-button
              onClick={startScan({ queryGeneratorInput, isScanning, currentQuery, auth })}
              size="lg"
            >
              🔍 Scan for Hotel Memberships
            </ct-button>

            {/* Display extracted memberships */}
            <div>
              <h3>Your Memberships</h3>
              {/* ... membership display UI ... */}
            </div>

            {/* Debug info showing brandHistory iterations */}
            <details>
              <summary>🔧 Debug Info</summary>
              {derive(brandHistory, (history) => {
                if (!history || !Array.isArray(history) || history.length === 0) {
                  return <div>No history yet</div>;
                }
                return history.map((brandEntry) => (
                  <details>
                    <summary>
                      {brandEntry.brand} - Status: {brandEntry.status} ({brandEntry.attempts.length} attempts)
                    </summary>
                    <div>
                      {brandEntry.attempts.map((attempt, idx) => (
                        <div>
                          <div><strong>Attempt {idx + 1}:</strong> {new Date(attempt.attemptedAt).toLocaleString()}</div>
                          <div><strong>Query:</strong> {attempt.query}</div>
                          <div><strong>Results:</strong> {attempt.emailsFound} emails → {attempt.membershipsFound} memberships</div>
                          {attempt.membershipsFound > 0 && <div>✅ Success!</div>}
                        </div>
                      ))}
                    </div>
                  </details>
                ));
              })}
            </details>
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
  };
});
```

## Questions

1. **How should we perform side effects automatically when reactive values change?**
   - Is there a different primitive than `computed()` for this?
   - Should we be structuring the pattern differently?

2. **How do we access cells inside reactive computations?**
   - Why doesn't `extractorResult.get()` work inside `computed()`?
   - Why doesn't `isScanning.get()` work inside `computed()`?

3. **Is automatic save even possible in the current framework?**
   - If not, should we stick with manual save button?
   - Or is there a pattern we're missing?

4. **Alternative approaches?**
   - Should we be using a different pattern structure?
   - Is there a way to "trigger" handlers programmatically?

## Desired Behavior

When `extractorResult` completes (i.e., `extractorPending` becomes `false`):
1. Automatically read the results
2. Update `memberships` cell with new findings
3. Update `brandHistory` cell with this query attempt
4. Update `lastScanAt` timestamp
5. No user interaction required

This enables seamless iteration where the LLM can refine queries based on previous results without manual intervention between iterations.

## Environment

- CommonTools framework (latest version)
- Pattern using `generateObject` for LLM interactions
- Cells from pattern input parameters

---

**Any guidance on the correct approach would be greatly appreciated!**
