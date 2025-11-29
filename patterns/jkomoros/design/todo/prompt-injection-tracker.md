# Prompt Injection Tracker - TODO

## Status
**Ready to Implement:** Nov 29, 2025 - Using verified "dumb map approach"

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

**Result:** Deployed and working! Charm ID: `baedreifihxx26uni7da2bogh36edzvl7zfo5lf2cphxstgfxfrcqwzltwi`
- 5 test articles processed correctly
- All 5 show "Completed" status
- Map+generateObject pattern confirmed working
- Note: 0 links extracted (test URLs are fake - LLM correctly identifies them as not real security reports)

**Key learning:** Need `derive()` in the prompt parameter when building template strings with multiple article properties:
```typescript
prompt: derive(article, (a) => {
  if (!a) return "";
  return `Article Title: ${a.title}\nContent: ${a.content}`;
}),
```

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
