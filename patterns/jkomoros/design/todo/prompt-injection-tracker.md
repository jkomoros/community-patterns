# Prompt Injection Tracker - TODO

## Status
**In Progress:** Refactoring for proper LLM caching (Nov 27, 2025)

## Current Work: LLM Caching Architecture

### Problem Discovered
The `callLLM()` helper uses raw `fetch()` to `/api/ai/llm/generateObject`, which:
1. **Bypasses framework LLM caching** - each call is a fresh HTTP request
2. **May be restricted by policy in future** - direct API access might be limited
3. **Web content varies between fetches** - dynamic pages break cache keys

### Solution: webPageCache + Reactive generateObject

**Key insight from Alex:** "Use generateObject. And it's OK to have a single cache of URL -> webPage that we keep cached and assume never changes, within our own data model. Then that will make sure we always have exactly the same webPage content and thus the LLM extraction is also the same. It's critical the whole flow be designed to be character-by-character identical as much as possible."

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  emails (from Gmail)                                                 │
│       │                                                              │
│       ▼                                                              │
│  parsedArticles (derive) ──────► list of {url, title, emailId}      │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ webPageCache cell (persisted, available via wish)           │    │
│  │ Record<normalizedURL, { content: string, fetchedAt: string}>│    │
│  │                                                              │    │
│  │ - Check cache first, only fetch if missing                  │    │
│  │ - Content is IMMUTABLE once cached                          │    │
│  │ - Ensures character-by-character identical prompts          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  linkExtractionPrompt (derive) ──► builds prompt from cached content│
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ generateObject (reactive, framework-cached)                  │    │
│  │ - NEVER use fetch() to call LLM APIs directly               │    │
│  │ - Framework caches based on exact prompt string             │    │
│  │ - Same prompt = instant cached response                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  processedArticles + reports (cells)                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps (Current)

- [x] Add `CachedWebPage` interface and `webPageCache` to Output
- [x] Add `webPageCache` cell in pattern
- [x] Modify fetch logic to use cache (check first, write after)
- [x] Export webPageCache in return statement (available via wish)
- [x] Update handler signature to include webPageCache
- [x] Update UI button onClick to pass webPageCache
- [ ] Replace `callLLM()` with reactive `generateObject` trigger pattern
- [ ] Remove `callLLM()` helper function entirely
- [ ] Test that re-processing same articles uses cached LLM results

### generateObject Conversion - DETAILED DESIGN (Nov 27, 2025)

**Critical constraint from official docs (LLM.md):**
> "These functions can **only be called from within a pattern body**, not from handlers or `computed()` functions"

**Per-item pattern from docs:**
```typescript
// In pattern body, NOT in handler
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject<PhotoExtractionResult>({
    system: `...`,
    prompt: derive(photo, (p) => {
      if (!p?.data) return "Waiting..."; // Empty/waiting prevents LLM call
      return [{ type: "image", image: p.data }, { type: "text", text: `...` }];
    })
  });
});
```

#### Architecture: Reactive Per-Article LLM Calls

The key insight is: **handler fetches web content, pattern body does LLM calls reactively**.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         NEW DATA FLOW                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌──────────────────┐                                                            │
│  │ User clicks      │                                                            │
│  │ "Fetch Content"  │                                                            │
│  └────────┬─────────┘                                                            │
│           │                                                                       │
│           ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ fetchArticleContent HANDLER (async side effect)                             │  │
│  │                                                                              │  │
│  │ for each article in parsedArticles:                                         │  │
│  │   if NOT in webPageCache:                                                   │  │
│  │     content = await fetch(/api/agent-tools/web-read)                        │  │
│  │     webPageCache.set({...cache, [url]: {content, fetchedAt}})               │  │
│  │                                                                              │  │
│  │ (Handler ONLY fetches, does NOT call LLM)                                   │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                       │
│           │ webPageCache updated                                                  │
│           ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ articlesWithContent DERIVE (reactive)                                       │  │
│  │                                                                              │  │
│  │ derive([parsedArticles, webPageCache], ([articles, cache]) => {             │  │
│  │   return articles                                                            │  │
│  │     .filter(a => cache[a.articleURL])  // Only articles with cached content │  │
│  │     .map(a => ({                                                            │  │
│  │       ...a,                                                                  │  │
│  │       articleContent: cache[a.articleURL].content,                          │  │
│  │     }));                                                                     │  │
│  │ });                                                                          │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                       │
│           │ articlesWithContent changes                                          │
│           ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ articleLinkExtractions IN PATTERN BODY (reactive per-article LLM)          │  │
│  │                                                                              │  │
│  │ const articleLinkExtractions = articlesWithContent.map((article) => {       │  │
│  │   return generateObject({                                                    │  │
│  │     system: LINK_EXTRACTION_SYSTEM,                                         │  │
│  │     prompt: derive(article, (a) => {                                        │  │
│  │       if (!a?.articleContent) return "";  // Empty = no LLM call            │  │
│  │       return JSON.stringify({                                               │  │
│  │         articleURL: a.articleURL,                                           │  │
│  │         articleContent: a.articleContent,                                   │  │
│  │         title: a.title,                                                     │  │
│  │       });                                                                    │  │
│  │     }),                                                                      │  │
│  │     model: "anthropic:claude-sonnet-4-5",                                   │  │
│  │     schema: SINGLE_ARTICLE_EXTRACTION_SCHEMA,                               │  │
│  │   });                                                                        │  │
│  │ });                                                                          │  │
│  │                                                                              │  │
│  │ Each article gets its own generateObject call.                              │  │
│  │ Framework caches: same articleContent = same prompt = cached LLM result.    │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                       │
│           │ articleLinkExtractions[i].result populated reactively                │
│           ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ collectedLinkResults DERIVE (collect all LLM results)                       │  │
│  │                                                                              │  │
│  │ derive(articleLinkExtractions, (extractions) => {                           │  │
│  │   const completed = extractions.filter(e => e.result && !e.pending);        │  │
│  │   return {                                                                   │  │
│  │     total: extractions.length,                                              │  │
│  │     completed: completed.length,                                            │  │
│  │     pending: extractions.filter(e => e.pending).length,                     │  │
│  │     results: completed.map(e => e.result),                                  │  │
│  │   };                                                                         │  │
│  │ });                                                                          │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                       │
│           │ All LLM calls complete                                               │
│           ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ novelReportURLs DERIVE (dedupe against existing reports)                    │  │
│  │                                                                              │  │
│  │ derive([collectedLinkResults, reports], ([results, existingReports]) => {   │  │
│  │   const existingURLs = new Set(existingReports.map(r => r.sourceURL));      │  │
│  │   const novelURLs = [];                                                      │  │
│  │   for (const result of results.results) {                                   │  │
│  │     for (const link of result.securityReportLinks) {                        │  │
│  │       if (!existingURLs.has(normalizeURL(link))) {                          │  │
│  │         novelURLs.push(normalizeURL(link));                                 │  │
│  │       }                                                                      │  │
│  │     }                                                                        │  │
│  │   }                                                                          │  │
│  │   return [...new Set(novelURLs)];  // Dedupe                                │  │
│  │ });                                                                          │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                       │
│           ▼                                                                       │
│  (Same pattern for report fetching and summarization LLM)                        │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Implementation Steps

**Step 1: Add `articlesWithContent` derive**
```typescript
// Join parsedArticles with webPageCache to get content for each article
const articlesWithContent = derive(
  [parsedArticles, webPageCache] as const,
  ([articles, cache]: [any[], Record<string, CachedWebPage>]) => {
    return articles
      .filter(a => cache[a.articleURL]) // Only include articles with cached content
      .map(a => ({
        emailId: a.emailId,
        articleURL: a.articleURL,
        title: a.title,
        articleContent: cache[a.articleURL].content,
      }));
  }
);
```

**Step 2: Replace LLM calls in pattern body with per-article generateObject**
```typescript
// In pattern body - creates reactive LLM call for each article
const articleLinkExtractions = articlesWithContent.map((article) => {
  return generateObject({
    system: LINK_EXTRACTION_SYSTEM,
    prompt: derive(article, (a) => {
      if (!a?.articleContent) return ""; // Empty prompt = no LLM call
      return JSON.stringify({
        articleURL: a.articleURL,
        articleContent: a.articleContent,
        title: a.title,
      });
    }),
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        articleURL: { type: "string" },
        securityReportLinks: { type: "array", items: { type: "string" } },
      },
      required: ["articleURL", "securityReportLinks"],
    },
  });
});
```

**Step 3: Create derive to collect results and track progress**
```typescript
const linkExtractionProgress = derive(
  articleLinkExtractions,
  (extractions) => {
    const total = extractions.length;
    const pending = extractions.filter(e => e.pending).length;
    const completed = extractions.filter(e => e.result && !e.pending).length;
    const errors = extractions.filter(e => e.error).length;
    const results = extractions
      .filter(e => e.result)
      .map(e => e.result);

    return { total, pending, completed, errors, results, allDone: pending === 0 && total > 0 };
  }
);
```

**Step 4: Simplify handler to ONLY fetch web content**
```typescript
// Handler now ONLY fetches web content into cache
const fetchArticleContent = handler<
  unknown,
  { parsedArticles: any[]; webPageCache: Cell<Record<string, CachedWebPage>>; processingStatus: Cell<string> }
>(
  async (_, { parsedArticles, webPageCache, processingStatus }) => {
    const cache = webPageCache.get();
    let fetched = 0;

    for (const article of parsedArticles) {
      if (cache[article.articleURL]) continue; // Skip cached

      processingStatus.set(`Fetching ${++fetched}/${parsedArticles.length}...`);
      const content = await fetchWebContent(article.articleURL);
      if (content) {
        const updatedCache = { ...webPageCache.get() };
        updatedCache[article.articleURL] = { content, fetchedAt: new Date().toISOString() };
        webPageCache.set(updatedCache);
      }
    }

    processingStatus.set(`Fetched ${fetched} articles. LLM processing reactively...`);
    // LLM calls happen AUTOMATICALLY via reactive generateObject in pattern body!
  }
);
```

**Step 5: Remove callLLM() and update UI**
- Delete `callLLM()` helper function entirely
- Remove the two phases of LLM calls from processAllArticles handler
- Update UI to show progress from `linkExtractionProgress` derive
- Add reactive status display showing pending/completed counts

#### Key Benefits of This Architecture

1. **Framework LLM caching works**: Same article content = same prompt = cached result
2. **Per-article granularity**: Each article cached independently, partial reruns work
3. **Progress tracking**: `linkExtractionProgress.pending` shows real-time status
4. **Simpler handler**: Handler only does side effects (fetch), no LLM logic
5. **Automatic reruns**: If webPageCache updates, LLM calls react automatically

#### Challenges to Watch For

1. **Array reactivity**: `.map()` on reactive array may need careful handling
2. **derive() in generateObject prompt**: Must access nested properties correctly
3. **Empty prompt handling**: Return "" to prevent LLM call for missing content
4. **Progress aggregation**: Need derive to collect all LLM results

#### Test Results (Nov 27, 2025)
- Deployed charm: `baedreiab5tvgwfwqcexx24qbkeencwwtky3rw633tk4drqwkyg5o26yvh4`
- First run: `Phase 1 complete: 29/29 articles (0 cache hits, 29 fetches)` ✅
- Web content cached with immutable semantics (never overwritten)
- Console shows `[FETCH]` for cache misses, `[CACHE HIT]` for cached content

**Next step:** Implement Step 1 (articlesWithContent derive) and Step 2 (per-article generateObject).

### Key Files Changed
- `prompt-injection-tracker.tsx` - main pattern
- Output interface now includes `webPageCache: Default<Record<string, CachedWebPage>, {}>`

## Completed
- [x] CT-1085 workaround: Accept authCharm as direct input for manual linking
- [x] Gmail integration working via linked auth
- [x] Email parsing and article extraction
- [x] LLM link extraction from articles
- [x] LLM report summarization
- [x] Report saving and display
- [x] Auto-run pipeline (processAllArticles handler) - needs refactor for caching

## UI Improvements Needed

### Better Status Visibility
The current UI makes it hard to tell if processing is stuck or still working.

**Issues identified:**
1. "Analyzing 2 articles with LLM..." shows indefinitely even after LLM completes
2. No progress indicator (e.g., "2/41 articles processed")
3. Multi-step pipeline requires manual button clicks between phases - not obvious
4. When linkExtractionPending is false but processingStatus still shows old message

**Suggested improvements:**
- Add a progress bar or X/Y counter for article processing
- Auto-continue pipeline instead of requiring manual "Fetch & Summarize" click
- Show timestamps for when each phase started/completed
- Add a timeout indicator (e.g., "Processing for 30s...")
- Clear status message when LLM completes

### Processing Limitations
- Currently limited to 2 articles per batch (line 739) - intentional for testing
- Consider making this configurable or removing the limit

### Other Improvements
- [ ] **Display processingStatus cell value prominently in UI** - currently written to cell but not visible to user
- [ ] Show which articles have been processed vs pending
- [ ] Add ability to reprocess failed articles
- [ ] Better error display when article fetch fails
- [ ] Add "Cancel Processing" button

## Auto-Run Pipeline Refactor

### Problem
Current pipeline requires 3 manual button clicks:
1. "Process N New Articles" → fetches articles, triggers LLM link extraction
2. "Fetch & Summarize Novel Reports" → processes LLM results, fetches reports, triggers summarization
3. "Save N Reports" → saves to reports array

This is slow and confusing. Users can't tell if it's stuck or working.

### Design: Single Async Handler

**Key insight:** Async/await IS allowed in handlers. The current code already uses it (line 726).
The limitation (line 604 comment) is only about `derive` calling handlers, not async operations.

**Solution:** Combine all 3 phases into one `processAllArticles` handler that:

```
Phase 1: Fetch Articles (parallel)
├── For each article URL in parsedArticles (up to batchSize)
├── Use Promise.all for parallel fetches
├── Update status: "Fetching articles 5/41..."
└── Output: articleBatch[]

Phase 2: LLM Link Extraction
├── POST /api/ai/llm/generateObject with articleBatch
├── Update status: "Extracting security links from 10 articles..."
└── Output: extractedLinks[]

Phase 3: Dedupe & Fetch Novel Reports (parallel)
├── Filter extractedLinks against existing reports (caching!)
├── Use Promise.all for parallel fetches of novel report URLs
├── Update status: "Fetching 3 novel security reports..."
└── Output: reportBatch[]

Phase 4: LLM Summarization
├── POST /api/ai/llm/generateObject with reportBatch
├── Update status: "Summarizing 3 security reports..."
└── Output: summarizedReports[]

Phase 5: Save Reports
├── Push each report to reports cell
├── Push each article to processedArticles cell (caching!)
├── Update status: "Added 2 new security reports!"
└── Set isProcessing = false
```

### Caching Architecture (Already Correct!)

The pattern already has proper caching:

1. **Article-level cache** (lines 302-347):
   - `processedArticles` cell stores analyzed article URLs
   - `parsedArticles` derive filters out already-processed URLs
   - After processing, articles added to `processedArticles` (line 544)

2. **Report-level cache** (lines 525-540):
   - `reports` cell stores saved report source URLs
   - `existingURLs` Set filters out already-saved reports
   - Only "novel" reports (not in existingURLs) are fetched/summarized

3. **URL normalization** (lines 121-143):
   - `normalizeURL()` removes tracking params, fragments, trailing slashes
   - Ensures consistent deduplication

### Implementation Steps

- [ ] **Step 1:** Extract system prompts and schemas to constants
  - Move link extraction prompt/schema to `LINK_EXTRACTION_PROMPT` / `LINK_EXTRACTION_SCHEMA`
  - Move summarization prompt/schema to `SUMMARIZATION_PROMPT` / `SUMMARIZATION_SCHEMA`

- [ ] **Step 2:** Create helper function for LLM API calls
  ```typescript
  async function callLLM(system: string, prompt: string, schema: object): Promise<any> {
    const response = await fetch("/api/ai/llm/generateObject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        messages: [{ role: "user", content: prompt }],
        model: "anthropic:claude-sonnet-4-5",
        schema,
      }),
    });
    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
    const data = await response.json();
    return data.object;
  }
  ```

- [ ] **Step 3:** Create new `processAllArticles` handler
  - Combine logic from `startProcessing`, `processLinkExtractionResults`, `saveReports`
  - Use Promise.all for parallel fetches
  - Update `processingStatus` at each phase
  - Handle errors gracefully (continue on individual article failures)

- [ ] **Step 4:** Remove old handlers and reactive generateObject calls
  - Remove `startProcessing` handler
  - Remove `processLinkExtractionResults` handler
  - Remove `saveReports` handler (keep for manual use?)
  - Remove `linkExtractionTrigger` and `reportSummarizationTrigger` cells
  - Remove reactive `generateObject` calls

- [ ] **Step 5:** Update UI
  - Single "Process All" button
  - Better progress display showing current phase
  - Remove intermediate debug sections (or collapse them)

- [ ] **Step 6:** Make batch size configurable
  - Add `batchSize` input with Default<number, 10>
  - Or remove limit entirely (process all)

### API Reference

**LLM generateObject endpoint:**
```
POST /api/ai/llm/generateObject
{
  system: string,           // System prompt
  messages: [{role: "user", content: string}],  // User message with data
  model: "anthropic:claude-sonnet-4-5",
  schema: {...},            // JSON schema for output
}

Response: { object: {...} }  // Structured output matching schema
```

**Web read endpoint:**
```
POST /api/agent-tools/web-read
{
  url: string,
  max_tokens: number,
  include_code: boolean,
}

Response: { content: string }  // Markdown content
```

### Testing Plan
1. Deploy updated pattern
2. Verify caching: process same emails twice, second time should skip already-processed
3. Verify full pipeline runs without manual clicks
4. Verify progress status updates correctly
5. Verify reports are saved correctly

## Testing Notes
Tested with:
- Gmail account: alex@common.tools
- Gmail-auth charm ID: baedreifvnxubn7p47ta6mir4iyonzqjy4pcdpvdir6gdzpsau6kjdcgokq
- Tracker charm ID: baedreibpmqz3bqumdb3lwgpilmniejdih2arzxhgbycrxc36hbvdgw7fam
- Successfully extracted and saved 1 security report about Google Antigravity vulnerability
