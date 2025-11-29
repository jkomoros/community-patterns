# DELETE THIS FILE AFTER READING

## Current Work: Prompt Injection Tracker v3 - Report URL Deduplication

### What We're Building
Adding **Level 2 deduplication tracking** to prompt-injection-tracker-v3.tsx so that:
- Many articles pointing to the same original report URL are deduplicated
- Users can see "X novel" vs "Y already tracked" report URLs
- Novel reports get a "NEW" badge in the UI

### Design Decision (User Approved)
Keep the "dumb map approach" - rely on framework caching for efficiency:
```
L1: allArticles.map(generateObject)  → extracts links (framework cached)
L2: allExtractedLinks.map(fetchData) → fetches content (framework cached)
L3: linkContents.map(generateObject) → summarizes (framework cached)
```

Add tracking layer ON TOP (not replacing):
```typescript
// Source of truth: saved reports cell (persists)
const reports = cell<PromptInjectionReport[]>([]);

// Derive set of already-tracked report URLs
const trackedReportURLs = derive(reports, list =>
  new Set(list.map(r => normalizeURL(r.sourceURL)))
);

// Filter to find NOVEL links (not in reports cell)
const novelReportLinks = derive(
  { extracted: allExtractedLinks, tracked: trackedReportURLs },
  ({ extracted, tracked }) => extracted.filter(url => !tracked.has(normalizeURL(url)))
);
```

### Implementation Status

**DONE:**
1. Added `ProcessedArticle` interface (lines 169-177)
2. Added `trackedReportURLs` derive - Set of normalized URLs from saved reports
3. Added `novelReportLinks` derive - filters extracted links against tracked
4. Added `alreadyTrackedLinks` derive - the inverse
5. Added `novelLinkCount` and `alreadyTrackedCount` derives
6. Updated pipeline status UI to show "Report URLs: X novel / Y tracked (Z total)"
7. Updated summaries header to show novel/tracked counts
8. Added "NEW" badge to novel items in summary cards using inline derive

**NOT YET DONE:**
- Deploy and test the changes
- Need to verify the derive-inside-JSX works for the NEW badge
- May need a "Save Report" handler to add reports to the `reports` cell

### Key Files
- `/Users/alex/Code/community-patterns/patterns/jkomoros/prompt-injection-tracker-v3.tsx` - Main pattern (edited)
- `/Users/alex/Code/community-patterns/patterns/jkomoros/prompt-injection-tracker.tsx` - Original v1 for reference

### Working Charm IDs (from previous session)
- Tracker: `baedreihcs2r3w6swus4g6lrwgroey66jquog23nbh52rrxfrxvszmfuonq`
- Gmail Auth: `baedreial66p5sxocjc5c6mult5vygvirxbsd2undnubf2in5lyntza5uy4`
- Space: `test-jkomoros`

### Branch
`prompt-injection-tracker-map-approach`

### Key Learnings from This Session
1. The "dumb map approach" works and should be preserved - framework caching handles efficiency
2. Deduplication should be a VIEW layer on top, not changing the reactive pipeline
3. `reports` cell is the source of truth for tracked reports - derive tracking from it
4. Can use `derive()` inside JSX to compute per-item properties like "isNovel"

### What's Still Needed
1. **Test the pattern** - Deploy fresh charm and verify novel/tracked display works
2. **Save mechanism** - Currently no way to add reports to `reports` cell. May need:
   - A "Save" button per report, OR
   - A "Save All Novel" button, OR
   - Automatic saving when summary completes
3. **Commit changes** - Once tested and working

### Git Status
One uncommitted change to prompt-injection-tracker-v3.tsx with the deduplication tracking code.

### Next Steps
1. Deploy: `env CT_API_URL=http://localhost:8000 CT_IDENTITY=claude.key deno task ct charm new patterns/jkomoros/prompt-injection-tracker-v3.tsx --space test-jkomoros`
2. Link auth: `deno task ct charm link GMAIL_AUTH_ID NEW_TRACKER_ID/authCharm --space test-jkomoros`
3. Test with real Gmail data
4. Verify novel/tracked counts display correctly
5. Add save mechanism if needed
6. Commit when working
