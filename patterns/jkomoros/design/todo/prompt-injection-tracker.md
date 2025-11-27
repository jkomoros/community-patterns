# Prompt Injection Tracker - TODO

## Status
**Working:** Core functionality verified end-to-end (Nov 27, 2025)

## Completed
- [x] CT-1085 workaround: Accept authCharm as direct input for manual linking
- [x] Gmail integration working via linked auth
- [x] Email parsing and article extraction
- [x] LLM link extraction from articles
- [x] LLM report summarization
- [x] Report saving and display

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
