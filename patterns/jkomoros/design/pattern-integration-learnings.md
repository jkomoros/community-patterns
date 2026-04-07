# Pattern Integration Learnings

## Date: November 8, 2025
## Patterns Studied: gmail-charm-creator, gmail-importer, gmail-auth, test-recipe-with-extraction, meta-analyzer

---

## Key Learnings

### 1. Gmail Integration Architecture

**How it works:**
- `gmail-auth.tsx` provides Google OAuth authentication
- `gmail-importer.tsx` consumes auth and fetches/stores emails
- `gmail-charm-creator.tsx` orchestrates creating instances of both

**For our use case:**
We have TWO options:

#### Option A: Embed GmailImporter directly (SIMPLER)
```typescript
import GmailAuth from "./gmail-auth.tsx";
import GmailImporter from "./gmail-importer.tsx";

export default recipe("Prompt Injection Tracker", () => {
  // Create auth instance
  const auth = GmailAuth({ auth: { /* defaults */ } });

  // Create importer with hardcoded query
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: 'from:"googlealerts-noreply@google.com" subject:"prompt injection"',
      limit: 100,
      historyId: "",
    },
    authCharm: auth,
  });

  // Access emails from importer
  const emails = importer.emails; // Cell<Email[]>

  // Use emails for processing...
});
```

#### Option B: Link to external GmailImporter charm (MORE FLEXIBLE)
```typescript
export default recipe<{ gmailImporter: any }>(
  "Prompt Injection Tracker",
  ({ gmailImporter }) => {
    const emails = gmailImporter.emails; // Cell<Email[]>
    // Use emails...
  }
);
```

**Recommendation:** **Option A** for v1 (self-contained, easier to deploy/test)

---

### 2. Email Data Structure

From `gmail-importer.tsx`, the Email type has:

```typescript
type Email = {
  id: string;                    // ✅ Unique message ID (use for deduplication!)
  threadId: string;              // Thread ID (will be same for all alerts)
  labelIds: string[];            // Gmail labels
  snippet: string;               // Brief preview
  subject: string;               // Email subject
  from: string;                  // Sender email
  date: string;                  // Send date
  to: string;                    // Recipient
  plainText: string;             // Plain text (often empty)
  htmlContent: string;           // ✅ HTML content (has the JSON + HTML we saw)
  markdownContent: string;       // ✅ Markdown version (best for LLM processing)
};
```

**Perfect for us:**
- `email.id` = unique message ID (use this for deduplication, not threadId!)
- `email.markdownContent` = the content we examined (JSON + markdown links)
- `email.date` = when email was received

---

### 3. LLM Extraction Pattern (from test-recipe-with-extraction.tsx)

**Key pattern:**
```typescript
// 1. Create trigger cell
const extractTrigger = cell<string>("");

// 2. Call generateObject with trigger as prompt
const { result: extractionResult, pending: extractionPending } = generateObject({
  system: "Your system prompt...",
  prompt: extractTrigger,  // ✅ Reactive cell
  model: "anthropic:claude-sonnet-4-5",
  schema: { /* JSON schema */ },
});

// 3. Handler updates trigger cell with timestamp to force re-trigger
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Cell<string> }
>(
  (_, { notes, extractTrigger }) => {
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

// 4. Use pending state in UI
<ct-button onClick={triggerExtraction({ notes, extractTrigger })} disabled={extractionPending}>
  {extractionPending ? "Extracting..." : "Extract Recipe"}
</ct-button>

// 5. Check if result exists before showing
const hasResult = derive(extractionResult, (result) => {
  if (!result || result === null) return false;
  return Object.keys(result).length > 0;
});
```

**Apply to our pattern:**
- Each email needs its own extraction trigger
- Use `generateObject` for structured output
- Track pending state to show progress
- Can have multiple LLM calls with different triggers/schemas

---

### 4. Multi-Item Processing (from meta-analyzer.tsx)

**Key pattern:**
```typescript
// 1. Get items to process
const allCharms = wish("#allCharms", []);
const personCharms = derive(allCharms, (charms) =>
  charms.filter((charm: any) => charm && "profile" in charm)
);

// 2. Handler creates snapshot for analysis
const triggerAnalysis = handler<
  Record<string, never>,
  { analysisInput: Cell<string>; personCharms: Array<OpaqueRef<PersonCharm>>; hasAnalyzed: Cell<boolean> }
>(
  (_, { analysisInput, personCharms, hasAnalyzed }) => {
    const snapshot = personCharms.map((charm, idx) => ({
      index: idx,
      name: charm.displayName || `Person ${idx + 1}`,
      notes: charm.notes || "",
    }));

    analysisInput.set(`${JSON.stringify(snapshot)}\n---ANALYZE-${Date.now()}---`);
    hasAnalyzed.set(true);
  },
);
```

**Apply to our pattern:**
- We need to process multiple emails (like processing multiple person charms)
- **BUT** we need sequential processing (can't batch all emails into one LLM call)
- Need to track which emails are processed
- Need progress indicator (X of Y emails)

**Challenge:** Handlers can't loop over emails sequentially with async LLM calls
**Solution:** Process one email at a time, track progress in state

---

### 5. Async Operations in Handlers

From `gmail-importer.tsx`, the `googleUpdater` handler shows:

```typescript
const googleUpdater = handler<unknown, {
  emails: Cell<Email[]>;
  auth: Cell<Auth>;
  settings: Cell<Settings>;
}>(
  async (_event, state) => {  // ✅ Handler can be async!
    console.log("googleUpdater!");

    const result = await process(auth, limit, query, { emails, settings });

    // Update state based on result
    if (result.newEmails) {
      state.emails.push(...result.newEmails);
    }
  },
);
```

**Key insight:** Handlers can be `async` and await promises!

**Apply to our pattern:**
- Handler can trigger email processing
- Handler can await web fetches
- Handler can await LLM responses (though generateObject is reactive)
- Need to carefully manage state updates

---

### 6. Processing Strategy for Sequential Email Analysis

**Problem:** We need to:
1. Fetch N unprocessed emails
2. For EACH email (sequentially):
   - Parse JSON
   - Unwrap URL
   - Fetch article (await)
   - LLM classify (reactive, need to wait for result)
   - If repost: fetch original (await)
   - Check URL against database
   - If novel: LLM extract (reactive, need to wait)
   - Update state

**Challenge:** Can't easily do this in a handler with reactive LLM calls

**Solution:** Process ONE email at a time with a "Process Next" button pattern:

```typescript
// State
const queuedEmails = cell<Email[]>([]);  // Emails to process
const currentEmail = cell<Email | null>(null);  // Email being processed
const processedEmailIds = cell<string[]>([]);  // IDs of processed emails

// Handler 1: Load queue
const loadQueue = handler((_, { emails, processedEmailIds, queuedEmails }) => {
  const allEmails = emails.get();
  const processed = new Set(processedEmailIds.get());
  const unprocessed = allEmails.filter(email => !processed.has(email.id));
  queuedEmails.set(unprocessed);
});

// Handler 2: Start processing next email
const processNext = handler((_, { queuedEmails, currentEmail }) => {
  const queue = queuedEmails.get();
  if (queue.length > 0) {
    currentEmail.set(queue[0]);
    queuedEmails.set(queue.slice(1));
  }
});

// Reactive LLM call on currentEmail
const extractionInput = derive(currentEmail, (email) =>
  email ? `${email.markdownContent}\n---PROCESS-${Date.now()}---` : ""
);

const { result, pending } = generateObject({
  prompt: extractionInput,
  // ...
});

// Handler 3: Save result and process next
const saveAndContinue = handler((_, { result, currentEmail, reports, processedEmailIds, queuedEmails, ... }) => {
  // Save result
  if (result.isNovel) {
    reports.push(result.extractedReport);
  }
  processedEmailIds.push(currentEmail.get().id);

  // Process next
  const queue = queuedEmails.get();
  if (queue.length > 0) {
    currentEmail.set(queue[0]);
    queuedEmails.set(queue.slice(1));
  } else {
    currentEmail.set(null); // Done
  }
});
```

**Alternative (BETTER): Batch process with WebFetch in handler**

Actually, we CAN do web fetching in handlers! WebFetch is NOT reactive like generateObject.

```typescript
const processEmails = handler<unknown, {
  emails: Cell<Email[]>;
  processedEmailIds: Cell<string[]>;
  reports: Cell<Report[]>;
}>(
  async (_, { emails, processedEmailIds, reports }) => {
    const allEmails = emails.get();
    const processed = new Set(processedEmailIds.get());
    const unprocessed = allEmails.filter(email => !processed.has(email.id));

    // Process each email
    for (const email of unprocessed) {
      // Parse JSON from email
      const articleData = parseEmailJSON(email.markdownContent);

      // Unwrap Google URL
      const actualURL = unwrapGoogleURL(articleData.url);

      // Fetch article content (await in handler!)
      const articleContent = await fetchURL(actualURL);

      // Now we need LLM classification...
      // This is where it gets tricky - can't call generateObject from handler
    }
  }
);
```

**Problem:** Can't call `generateObject` or `llm` from inside handlers!

**Hybrid Solution:**
- Use handler for web fetching (can await)
- Use reactive cells + generateObject for LLM calls
- Process emails in small batches

---

### 7. Recommended Architecture for Prompt Injection Tracker

Based on learnings, here's the updated approach:

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│ Prompt Injection Tracker Pattern                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌─────────────────┐         ┌──────────────────┐           │
│ │  Gmail Auth     │────────>│ Gmail Importer   │           │
│ │  (embedded)     │         │ (embedded)       │           │
│ └─────────────────┘         └──────────────────┘           │
│                                      │                       │
│                                      v                       │
│                              emails: Email[]                 │
│                                      │                       │
│                                      v                       │
│              ┌───────────────────────────────────┐          │
│              │  Email Processing Queue           │          │
│              │  - Filter by processedEmailIds    │          │
│              │  - Process one at a time          │          │
│              └───────────────────────────────────┘          │
│                                      │                       │
│                                      v                       │
│              ┌───────────────────────────────────┐          │
│              │  Stage 1: Parse & Fetch           │          │
│              │  - Extract article URL from JSON  │          │
│              │  - Unwrap Google tracking URL     │          │
│              │  - Fetch article (in handler)     │          │
│              └───────────────────────────────────┘          │
│                                      │                       │
│                                      v                       │
│              ┌───────────────────────────────────┐          │
│              │  Stage 2: LLM Classification      │          │
│              │  - Is this: Original/Repost/Generic?  │      │
│              │  - Extract original URL if repost │          │
│              │  (uses generateObject - reactive) │          │
│              └───────────────────────────────────┘          │
│                                      │                       │
│                                      v                       │
│              ┌───────────────────────────────────┐          │
│              │  Stage 3: Follow Original         │          │
│              │  - Fetch original URL (in handler)│          │
│              │  - Normalize URL                  │          │
│              │  - Check against existing reports │          │
│              └───────────────────────────────────┘          │
│                                      │                       │
│                                      v                       │
│              ┌───────────────────────────────────┐          │
│              │  Stage 4: Extract Report          │          │
│              │  - If novel: generateObject       │          │
│              │  - Save to reports array          │          │
│              │  - Mark email as processed        │          │
│              └───────────────────────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Challenges:**
1. ❌ Can't call `generateObject` from handlers (only in recipe body)
2. ❌ Can't loop with sequential LLM calls (reactive graph doesn't support imperative loops)
3. ✅ CAN do web fetching in handlers (async/await works)
4. ✅ CAN use handlers to update state after LLM completes

**Revised Approach - Simpler v1:**
```
┌─────────────────────────────────────────────────────┐
│ SIMPLIFIED: Process ALL emails in ONE LLM call      │
├─────────────────────────────────────────────────────┤
│                                                      │
│ 1. Handler: Fetch ALL unprocessed emails            │
│    - Filter by processedEmailIds                    │
│    - For each: parse JSON, unwrap URL, fetch article│
│    - Create batch: [{email, articleContent}, ...]   │
│    - Set to analysis trigger cell                   │
│                                                      │
│ 2. Reactive: generateObject processes batch         │
│    - Classify each article                          │
│    - Extract original URLs for reposts              │
│    - Return array of classifications                │
│                                                      │
│ 3. Handler: Process LLM results                     │
│    - For each "original" classification:            │
│      - Normalize URL                                │
│      - Check against existing reports               │
│      - If novel: trigger detailed extraction        │
│    - Mark all emails as processed                   │
│                                                      │
│ 4. Reactive: generateObject for detailed extraction │
│    - Extract structured data for novel reports      │
│    - Return report objects                          │
│                                                      │
│ 5. Handler: Save reports                            │
│    - Add to reports array                           │
│    - Done                                            │
└─────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Simpler flow (2 LLM stages instead of per-email processing)
- ✅ More cost-efficient (batch processing)
- ✅ Faster (parallel analysis of multiple emails)
- ✅ Works with reactive constraints

**Drawbacks:**
- ❌ Can't follow original URLs mid-stream (would need second batch)
- ❌ Less granular progress ("analyzing..." vs "email 3 of 10")

**Solution:** Two-phase processing
1. **Phase 1 (batch):** Classify all article URLs, extract original URLs for reposts
2. **Phase 2 (batch):** Fetch original URLs, deduplicate, extract details for novel reports

---

### 8. Updated Implementation Strategy

**Step-by-Step Flow:**

```typescript
// STEP 1: User clicks "Process New Alerts"
const startProcessing = handler(async (_, state) => {
  state.isProcessing.set(true);

  // Get unprocessed emails
  const allEmails = state.gmailImporter.emails.get();
  const processed = new Set(state.processedEmailIds.get());
  const unprocessed = allEmails.filter(e => !processed.has(e.id));

  // Parse and fetch article content for each email
  const batch = [];
  for (const email of unprocessed) {
    try {
      const articleData = parseEmailJSON(email.markdownContent);
      const actualURL = unwrapGoogleURL(articleData.url);

      // Option: fetch article here or just pass URL to LLM
      // const articleContent = await fetchArticle(actualURL);

      batch.push({
        emailId: email.id,
        emailDate: email.date,
        articleTitle: articleData.title,
        articleDesc: articleData.description,
        articleURL: actualURL,
        // articleContent: articleContent,  // If we fetch in handler
      });
    } catch (error) {
      console.error(`Error processing email ${email.id}:`, error);
    }
  }

  // Trigger LLM batch classification
  state.classificationTrigger.set(JSON.stringify(batch) + `\n---${Date.now()}---`);
});

// STEP 2: Reactive LLM classification
const classificationTrigger = cell("");
const { result: classificationResult, pending: classificationPending } = generateObject({
  system: `Classify each article as: original-report, repost (provide original URL), or not-relevant`,
  prompt: classificationTrigger,
  schema: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            emailId: { type: "string" },
            classification: { type: "string", enum: ["original-report", "repost", "not-relevant"] },
            originalURL: { type: "string" },  // If repost
            confidence: { type: "number" },
          }
        }
      }
    }
  }
});

// STEP 3: Handler processes classification results
const processClassifications = handler(async (_, state) => {
  const results = state.classificationResult.get();
  if (!results?.classifications) return;

  // Collect URLs to check for novelty
  const urlsToCheck = [];
  for (const item of results.classifications) {
    if (item.classification === "repost" && item.originalURL) {
      // TODO: fetch original URL content here if needed
      urlsToCheck.push({
        emailId: item.emailId,
        url: normalizeURL(item.originalURL),
      });
    } else if (item.classification === "original-report") {
      const emailData = /* find email by emailId */;
      urlsToCheck.push({
        emailId: item.emailId,
        url: normalizeURL(emailData.articleURL),
      });
    }
  }

  // Check novelty
  const existingURLs = new Set(
    state.reports.get().map(r => normalizeURL(r.sourceUrl))
  );

  const novelURLs = urlsToCheck.filter(item => !existingURLs.has(item.url));

  // Trigger detailed extraction for novel reports
  if (novelURLs.length > 0) {
    state.extractionTrigger.set(JSON.stringify(novelURLs) + `\n---${Date.now()}---`);
  }

  // Mark emails as processed
  const processedIds = results.classifications.map(c => c.emailId);
  state.processedEmailIds.push(...processedIds);

  state.isProcessing.set(false);
});
```

This is getting complex. Let me think about a simpler approach...

---

### 9. SIMPLEST Approach (Recommended for v1)

**Key insight:** We don't NEED to fetch article content to classify!
- The email already contains: title, description, source domain
- That's enough for basic classification
- We can skip the "fetch article" step initially

**Simplified Flow:**

```
1. User clicks "Process Alerts"
   ↓
2. Handler:
   - Get unprocessed emails from GmailImporter
   - For each email:
     * Parse JSON from markdownContent
     * Unwrap Google tracking URL
     * Extract: title, description, actualURL
   - Build batch array
   - Set classification trigger
   ↓
3. LLM (generateObject):
   - Input: Array of {emailId, title, desc, url}
   - Output: Array of {emailId, classification, originalURL, confidence}
   - Classify based on title/description alone (no article fetch yet)
   ↓
4. Handler (when LLM completes):
   - For reposts: use provided originalURL
   - For originals: use the article URL
   - Normalize all URLs
   - Check against existing reports.sourceUrl
   - For novel URLs:
     * Fetch article content (NOW we fetch, only for novel ones)
     * Set extraction trigger
   ↓
5. LLM (generateObject):
   - Extract structured data from novel articles
   - Return report objects
   ↓
6. Handler:
   - Save reports
   - Mark emails as processed
   - Done
```

**Why this is better:**
- ✅ No unnecessary article fetches (only fetch novel reports)
- ✅ Batch processing (fast)
- ✅ Clear separation: parse → classify → dedupe → fetch → extract → save
- ✅ Works within reactive constraints

---

## Code Patterns to Reuse

### From gmail-importer: Email Filtering
```typescript
// Get unprocessed emails
const allEmails = gmailImporter.emails; // Cell<Email[]>
const processed = processedEmailIds; // Cell<string[]>

const unprocessedEmails = derive({ allEmails, processed }, ({ allEmails, processed }) => {
  const processedSet = new Set(processed);
  return allEmails.filter(email => !processedSet.has(email.id));
});

const unprocessedCount = derive(unprocessedEmails, (list) => list.length);
```

### From test-recipe: LLM Trigger Pattern
```typescript
const trigger = cell<string>("");

const startProcess = handler((_, { inputData, trigger }) => {
  const data = inputData.get();
  trigger.set(`${JSON.stringify(data)}\n---PROCESS-${Date.now()}---`);
});

const { result, pending } = generateObject({
  prompt: trigger,
  schema: { /* ... */ },
});

<ct-button onClick={startProcess({ inputData, trigger })} disabled={pending}>
  {pending ? "Processing..." : "Process"}
</ct-button>
```

### From meta-analyzer: Check Result Before Showing
```typescript
const hasResults = derive(result, (r) => {
  if (!r || r === null) return false;
  return Array.isArray(r.items) && r.items.length > 0;
});

{ifElse(
  hasResults,
  <div>Show results...</div>,
  <div>No results found</div>
)}
```

---

## Updated Design Decisions

Based on learnings:

1. **✅ Embed Gmail Integration:** Import and instantiate GmailAuth + GmailImporter directly
2. **✅ Batch Processing:** Process all unprocessed emails in one go (not one-at-a-time)
3. **✅ Minimal Article Fetching:** Only fetch article content for novel reports (not for classification)
4. **✅ Two-Phase LLM:**
   - Phase 1: Classify batch of emails (input: title/desc/url from email JSON)
   - Phase 2: Extract details for novel reports (input: fetched article content)
5. **✅ URL-based deduplication:** After classification, normalize URLs and check against existing
6. **✅ Use Email.id:** Track processed emails by their unique message ID

---

## Next Steps

1. Update DESIGN doc with simplified architecture
2. Start Phase 1: Create pattern scaffold with embedded Gmail components
3. Implement email filtering and batch preparation
4. Implement Phase 1 LLM classification
5. Implement URL deduplication
6. Implement Phase 2 LLM extraction for novel reports

