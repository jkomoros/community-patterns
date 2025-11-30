# Prompt Injection Tracker - TODO

## Status
**Active Investigation:** Nov 29, 2025 - Debugging caching behavior in pipeline

## ACTIVE: Caching Investigation

### Problem Statement

Despite following the "dumb map approach" and keeping map chains unbroken, we're seeing unexpected caching behavior with the five-level pipeline when using real Gmail data (~30 emails):

1. **Later pipeline stages are slow** - Even with framework caching, processing takes longer than expected
2. **Page refresh doesn't restore state quickly** - Expected cached results to load instantly
3. **L2 counter discrepancy** - After cache load, L2 shows 0/28 while L3 shows 28/28

### Pipeline Architecture (for reference)

```
L1: Extract URLs from emails (generateObject, ~30 items)
    ↓
L2: Fetch web content (fetchData, ~100+ URLs extracted)
    ↓
L3: Classify as original vs news article (generateObject)
    ↓
Dedupe: Collect unique original report URLs (pure derive)
    ↓
L4: Fetch original reports (fetchData)
    ↓
L5: Summarize reports (generateObject)
```

### Observed Symptoms

1. **Symptom: L2 counter shows 0/N after page reload**
   - L1: 30/30 ✓
   - L2: 0/28 ✗ (should show 28/28 if cached)
   - L3: 28/28 ✓
   - This suggests cell structure differs when loaded from cache vs fresh computation
   - The `fetchCompletedCount` check: `item.webContent?.result` - may not work on cached cells

2. **Symptom: "null" URL string instead of actual null**
   - Fixed in commit a59cc38
   - LLM returns literal "null" string via generateObject
   - WORKAROUND: `isValidUrl()` helper checks `url.toLowerCase() !== "null"`
   - Root cause: Schema interpretation issue in generateObject/LLM

3. **Symptom: Slow pipeline processing with real data**
   - Test data (5 items) processes quickly
   - Real Gmail data (30 emails → 100+ URLs) much slower
   - Need to determine: is this expected parallelism limits or cache misses?

### Hypotheses

**H1: Cell structure differs between fresh and cached states**
- When generateObject/fetchData return from cache, the cell wrapper might have different properties
- Checking `.result` might work fresh but not from cache
- Need to investigate: What does a cached cell look like vs fresh cell?

**H2: Inputs aren't as stable as we think**
- If inputs to generateObject/fetchData change slightly, cache is missed
- Possible sources of instability:
  - URL normalization differences
  - Timestamp or metadata in prompts
  - Object reference vs value comparison
- Need to add logging to verify exact inputs

**H3: ifElse reactive primitive issues**
- L4 uses `ifElse(needsOriginalFetch, fetchData(...), null)`
- `ifElse` might not cache correctly or might re-evaluate unexpectedly
- Need to verify ifElse behavior with cached inputs

**H4: derive() creating new objects breaks reference equality**
- Pipeline passes data through multiple derive() calls
- If derive creates new objects each time, downstream caches miss
- Need to verify object stability through pipeline

### Investigation Plan

#### Phase 1: Instrumentation & Logging

- [ ] Add console.log at each pipeline stage entry
- [ ] Log exact inputs to generateObject calls (hash of content?)
- [ ] Log exact inputs to fetchData calls (URL + options)
- [ ] Log cell structure: `.pending`, `.result`, `.error` presence and types
- [ ] Add timestamps to track when each stage runs

#### Phase 2: Minimal Reproduction

- [ ] Create a minimal test pattern with just L1 + L2
- [ ] Use 3-5 hardcoded test articles
- [ ] Verify caching works on this minimal version
- [ ] Add stages one by one to find where caching breaks

#### Phase 3: Cell Structure Analysis

- [ ] Log full cell object structure when fresh
- [ ] Log full cell object structure after page reload
- [ ] Compare the two - what's different?
- [ ] Update counter logic if needed to handle both cases

#### Phase 4: Input Stability Verification

- [ ] Add derive() that logs inputs before generateObject
- [ ] Verify same content produces same input hash
- [ ] Check URL normalization is consistent
- [ ] Verify no timestamps or random data in prompts

#### Phase 5: ifElse Investigation

- [ ] Create test pattern using just ifElse + fetchData
- [ ] Verify conditional fetching caches correctly
- [ ] Test with condition that changes vs stays same
- [ ] Document ifElse caching behavior

### Test Fixtures Needed

For reproducible testing, we need:
- [ ] Extract 5-10 real emails from deployed charm as JSON fixtures
- [ ] Include variety: some with links, some without
- [ ] Save as `test-fixtures/emails.json` in pattern or WIP
- [ ] Pattern can load fixtures for testing instead of Gmail

### Progress Log

**Nov 29, 2025 - Session 1:**
- Deployed tracker-v3 with Gmail auth
- Connected to Gmail, fetched 30 emails
- Observed L2 counter bug: shows 0/28 when L3 shows 28/28
- Identified "null" URL string bug - FIXED in commit a59cc38
- Server crashed during testing, restarted with --clear-cache
- Deployment infrastructure hitting ConflictErrors, couldn't deploy fixed version
- Created this investigation plan

**Current Status:**
- Fix for "null" URL committed but not tested with live data
- L2 counter bug identified but not fixed (user deferred as "cosmetic")
- Need to set up proper test fixtures for reproducible debugging

### Next Steps (for next session)

1. **Extract test fixtures** from deployed charm with emails
2. **Add instrumentation** - console.log at each pipeline stage
3. **Create minimal reproduction** - strip down to just L1 + L2
4. **Document cell structure** - what does cached vs fresh look like?

### Files

- Pattern: `patterns/jkomoros/prompt-injection-tracker-v3.tsx`
- TODO: `patterns/jkomoros/design/todo/prompt-injection-tracker.md` (this file)
- Related commits:
  - a59cc38: Fix LLM returning "null" string instead of actual null for URLs
  - 6529af6: Fix pipeline metrics and reactivity loop from computed() inside map

---

## PREVIOUS: Implementation Status (Reference)

## Key Finding: The "Dumb Map Approach" Works

Framework author confirmed and we verified:

```typescript
// THIS WORKS - just use map + generateObject directly
const extractions = articles.map((article) => ({
  articleId: article.id,
  extraction: generateObject({
    system: "Extract security report links...",
    prompt: article.content,
    model: "anthropic:claude-sonnet-4-5",
    schema: EXTRACTION_SCHEMA,
  }),
}));
```

**Verified behaviors:**
- Adding 1 item → only 1 new LLM call (others stay cached)
- Per-item caching works automatically within a session
- NO manual caching layer needed
- NO webPageCache pattern needed
- NO OpaqueRef casting needed

## What NOT To Do (Framework Author Feedback)

> "Ugh, no, it is building another layer of caching on top"

**DON'T:**
- Build webPageCache or similar caching layers
- Manually cast away from OpaqueRef
- Manually add OpaqueRef casts in handlers
- Use `callLLM()` helper with raw fetch()
- Create complex reactive trigger patterns

**DO:**
- Use simple `.map()` over items with `generateObject`
- Let the framework handle caching automatically
- Keep handlers simple (just fetch web content)
- Access `.pending`, `.result`, `.error` directly in JSX

## Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SIMPLIFIED DATA FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  emails (from Gmail via linked auth)                           │
│       │                                                         │
│       ▼                                                         │
│  parsedArticles = derive(emails, extract URLs/titles)          │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ articleExtractions = parsedArticles.map((article) =>    │   │
│  │   generateObject({                                       │   │
│  │     system: LINK_EXTRACTION_SYSTEM,                     │   │
│  │     prompt: article.content,                            │   │
│  │     schema: EXTRACTION_SCHEMA,                          │   │
│  │   })                                                     │   │
│  │ )                                                        │   │
│  │                                                          │   │
│  │ Framework caches automatically per unique prompt.        │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  pendingCount = derive(extractions, count pending)             │
│  completedResults = derive(extractions, collect results)       │
│       │                                                         │
│       ▼                                                         │
│  Display in UI with .pending/.result/.error access             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Start Fresh with Working Pattern ✅ DONE

- [x] Create new `prompt-injection-tracker-v3.tsx` in WIP/
- [x] Use `map-test-100-items.tsx` as template (verified working)
- [x] Start with hardcoded test articles (no Gmail yet)
- [x] Verify basic map + generateObject flow works

**Result:** FULLY WORKING! URL extraction functional.
- 5 test articles processed correctly
- 12 total URLs extracted successfully
- Real security URLs extracted (NVD, OWASP, heartbleed.com, CISA, etc.)

**CRITICAL FINDING: Empty Array + Handler Pattern**

The key breakthrough: **Use empty array default + handler to load data, NOT pre-populated defaults.**

```typescript
// ❌ BROKEN: Pre-populated default - .result is UNDEFINED
interface Input {
  articles: Default<Article[], typeof TEST_ARTICLES>;
}

// ✅ WORKS: Empty array + handler - .result has data
interface Input {
  articles: Default<Article[], []>;
}

const loadArticles = handler<unknown, { articles: Cell<Article[]> }>(
  (_event, { articles }) => {
    for (const article of TEST_ARTICLES) {
      articles.push(article);
    }
  }
);
```

**Why:** Items added via handler go through the reactive system properly, wiring up generateObject results. Pre-populated defaults bypass this.

See: `community-docs/superstitions/2025-11-29-generateObject-empty-array-handler-pattern.md`

**Other learnings:**
- Check `!pending` for completion, not `.result`
- Direct `item.content` access works with empty array + handler pattern
- Template strings in prompts need derive() to avoid "opaque value" error

### Phase 2: Add Gmail Integration

- [ ] Add Gmail auth input (like current pattern)
- [ ] Add `derive` to parse emails into articles
- [ ] Each article: `{ id, url, title, content }`
- [ ] Map over articles with generateObject for link extraction

### Phase 3: Link Extraction LLM

```typescript
const EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    securityReportLinks: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["securityReportLinks"] as const,
};

const articleExtractions = parsedArticles.map((article) => ({
  articleId: article.id,
  extraction: generateObject({
    system: "Extract URLs that link to security vulnerability reports...",
    prompt: `Title: ${article.title}\n\nContent: ${article.content}`,
    model: "anthropic:claude-sonnet-4-5",
    schema: EXTRACTION_SCHEMA,
  }),
}));
```

### Phase 4: Report Fetching & Summarization

- [ ] Collect all extracted links from completed extractions
- [ ] Dedupe against existing reports
- [ ] For novel links, fetch content (handler with fetch)
- [ ] Map over fetched reports with generateObject for summarization

```typescript
const reportSummaries = fetchedReports.map((report) => ({
  url: report.url,
  summary: generateObject({
    system: "Summarize this security report...",
    prompt: report.content,
    model: "anthropic:claude-sonnet-4-5",
    schema: SUMMARY_SCHEMA,
  }),
}));
```

### Phase 5: UI & Polish

- [ ] Status card showing pending/completed counts
- [ ] List of reports with summaries
- [ ] Read/unread tracking
- [ ] Settings section (collapsed by default)

## File Structure

```
patterns/jkomoros/WIP/
├── prompt-injection-tracker-v3.tsx    # NEW - Clean implementation
├── map-test-100-items.tsx             # Reference pattern (verified)
└── prompt-injection-tracker-*.tsx     # OLD - Archive these
```

## Testing Checklist

- [ ] Deploy with test data (hardcoded articles)
- [ ] Verify LLM calls work and results display
- [ ] Add 1 article → verify only 1 new LLM call
- [ ] Connect Gmail → verify articles parse
- [ ] Full flow: Gmail → Extract → Summarize → Display

## Known Limitations

1. **Reload behavior**: Reactive state not preserved across page reloads
   - Framework author: "need to remember reactive state - non-trivial runtime change"
   - LLM results will re-request on reload (but API-level caching may help)

2. **Storage conflicts**: At scale (100+ items), may see transaction failures
   - Observed in testing, not blocking

## Reference: Working Pattern

See `map-test-100-items.tsx` for verified working code:
- `Default<Item[], []>` for input types
- `derive(items, (list) => list.length)` for counts
- `items.map((item) => generateObject({...}))` for per-item LLM
- `str` template tag for reactive NAME
- Direct `.pending`, `.result` access in JSX
