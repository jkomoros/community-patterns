# Prompt Injection Tracker V2 - Improvement Specification

**Date**: November 14, 2025
**Author**: Claude (AI Product Manager)
**Status**: Ready for Implementation
**Priority**: High

---

## Executive Summary

This spec outlines improvements to transform the Prompt Injection Alert Tracker from a functional but complex prototype (60-70% complete) into a polished, production-ready tool. Based on analysis of existing code, design docs, UX feedback, and recent framework updates, we will:

1. **Remove unnecessary workarounds** now fixed in labs/
2. **Dramatically simplify UX** with progressive disclosure
3. **Fix critical bugs** (gmail-importer CPU pegging, article count showing 0)
4. **Modernize to new framework patterns** (pattern() function, improved derive/map)
5. **Add missing features** (read/unread tracking, better filtering, resilient processing)

**Target**: Production-ready in 4-6 hours of focused work.

---

## Research Findings

### Framework Updates (labs/ commits)

Recent labs/ commits that remove need for workarounds:

1. **8e55ed865** - "don't treat inputs to patterns/recipes as OpaqueRef anymore"
   - **Impact**: The `lift` workaround for processing importer.emails may no longer be needed
   - **Action**: Test if we can use `derive` directly on `importer.emails`

2. **fcef38199** - "feat: introduce pattern() function to replace recipe() with cleaner API"
   - **Impact**: New `pattern()` function available as alternative to `recipe()`
   - **Action**: Consider modernizing to `pattern()` if clearer

3. **c1ce57735** - "fix transformers w.r.t. map over opaqueref inside derive"
   - **Impact**: Map operations inside derive should work better now
   - **Action**: Simplify derive/map patterns

### Current Workarounds to Remove

1. **Lift pattern for email parsing** (lines 229-286)
   - Currently uses complex `derive` with manual loops
   - **Test**: Can we simplify to direct `.map()` on importer.emails?

2. **Manual phase buttons** (avoiding auto-chaining)
   - STATUS doc mentions: "Using derive to auto-trigger handlers causes closure errors"
   - **Test**: Can we now chain handlers automatically?

### Critical Bugs

1. **Gmail Importer CPU Pegging** (User-reported)
   - Deno process hits 100% CPU and gets stuck
   - Happens "every so often" - non-deterministic
   - **High Priority**: Create minimal repro if possible
   - **Mitigation**: Add timeout, better error handling, manual refresh button

2. **Article Count Shows 0** (UX-IMPROVEMENTS.md)
   - parsedArticles computed but result not displayed correctly
   - newArticleCount derived shows 0 even when articles exist
   - **Root Cause**: Likely derive dependency tracking issue
   - **Fix**: Verify derive dependencies and computed chain

3. **Processing Button Does Nothing** (UX-IMPROVEMENTS-v2.md)
   - Button shows "Process 0 New Articles"
   - Click → nothing visible happens
   - **Root Cause**: Connected to article count bug

### UX Issues (from improvement docs)

**Information Architecture Problems**:
- Too much complexity visible (two-level URL tracking)
- Gmail setup clutters main view
- No clear "what's next" action
- Confusing pipeline state
- Statistics show counts but no actionable info

**User Experience Problems**:
- Can't tell which emails processed
- No feedback on parse failures
- No progress during LLM processing
- Reports section empty with unhelpful message
- No search/filter
- No manual retry for failures

---

## Product Vision: Make It Smooth

### Core Principle: Zero-Friction Workflow

**Current workflow** (8 steps, confusing):
1. Land on page → see Gmail setup
2. Click "Fetch Emails"
3. Wait, see 35 emails
4. See "Process 0 New Articles" (confused!)
5. Click anyway? Nothing happens
6. Manual debugging required
7. Multiple manual button clicks for phases
8. Finally see results (maybe)

**Target workflow** (2 steps, clear):
1. Land on page → see "🆕 12 new alerts ready"
2. Click "⚡ Process Alerts" → wait 30s → see "✅ 3 new reports tracked"

### Design Principles

1. **Automatic by default**: No manual steps unless necessary
2. **Progressive disclosure**: Hide complexity, show results
3. **Clear feedback**: Always know what's happening and why
4. **Graceful errors**: Never get stuck, always recoverable
5. **Mobile-first sizing**: Works on phone screens

---

## Detailed Requirements

### 1. Simplified Information Architecture

#### Header Status Card (Always Visible)
```
┌─────────────────────────────────────────────────┐
│ ⚡ Prompt Injection Tracker                     │
│                                                  │
│ 🆕 12 new alerts  •  🔒 47 tracked  •  3 unread │
│                                                  │
│ [⚡ Process 12 Alerts]     Last: 2 hours ago    │
└─────────────────────────────────────────────────┘
```

**States**:
- ✅ Up to Date (green) - no new alerts
- 🆕 New Alerts (blue) - X alerts ready to process
- ⏳ Processing (yellow) - analyzing...
- ⚠️ Needs Attention (red) - error occurred

#### Progressive Disclosure
- **Default view**: Status + New alerts preview + Tracked reports
- **Hidden by default**: Gmail setup, processed articles, debug info
- **Toggle to show**: "⚙️ Settings" → expands Gmail auth section

### 2. Automated Email Processing

**Auto-sync on load**:
- Check for new emails immediately when pattern loads
- Show: "🔄 Checking for new alerts..." then "✅ Found 12 new"
- Auto-parse emails as they arrive (no manual button)

**Deduplication**:
- Show: "ℹ️ Skipped 3 duplicate articles (already seen)"
- Click to see list of skipped URLs
- "🔄 Reprocess anyway" option

### 3. One-Click Processing Pipeline

**Single "Process Alerts" button**:
- Combines all phases into one async flow
- Fetches articles → Extracts links → Dedupes → Fetches reports → Summarizes
- Real-time progress indicator

**Progress Feedback**:
```
⏳ Processing 12 alerts...

  [========>              ] 35%

  Current: Extracting security report links (2/5 articles)
  Elapsed: 1m 23s

  [Cancel Process]
```

**Phases** (internal, not exposed to user):
1. Parse emails → article URLs
2. Dedupe against processed
3. Fetch article content (parallel, batch of 5)
4. LLM Phase 1: Extract security report links
5. Dedupe against known reports
6. Fetch novel report content (parallel, batch of 3)
7. LLM Phase 2: Summarize reports
8. Save to reports array

**Error Handling**:
- If article fetch fails → log, continue with others
- If LLM times out → show error, allow retry
- If websocket disconnects → detect, show "Reconnecting...", auto-retry
- Never let one failure block entire pipeline

### 4. Improved Reports Display

**List View** (default):
```
┌──────────────────────────────────────────────────┐
│ 🔥 NEW  [HIGH]  GPT-4 Vision Metadata Injection │
│                                                   │
│ Discovered: Nov 8, 2025  •  🏷️ LLM-Specific     │
│                                                   │
│ Attacker can embed malicious prompts in image    │
│ metadata to hijack GPT-4 Vision...               │
│                                                   │
│ [Mark Read] [View Source] [Share] [More ▾]      │
└──────────────────────────────────────────────────┘
```

**Unread Highlighting**:
- Blue left border + background tint for unread
- "🔥 NEW" badge
- Counter in header: "3 unread"
- Click anywhere on card → mark as read
- "Mark All Read" bulk action

**Filtering** (top of list):
```
[All Reports ▾]  [Severity ▾]  [🔍 Search...]  [⚙️]

Filters:
☐ Show only unread
☐ LLM-specific only
☐ High/Critical only
```

**Sort Options**:
- Newest first (default)
- Severity (critical → low)
- Unread first

### 5. Settings & Configuration

**Collapsible Gmail Setup**:
- Default: Hidden
- Show: "⚙️ Gmail Settings" toggle
- Contents: Auth, query, fetch button, email table

**Processing Settings**:
```
⚙️ Settings

Auto-sync:
  ☑ Check for new alerts on load
  ☑ Auto-process new alerts (no manual click)
  Interval: [15 minutes ▾]  ☐ Enable

Batch sizes:
  Articles per batch: [5]
  Reports per batch: [3]

LLM Settings:
  Model: [claude-sonnet-4-5 ▾]
  Timeout: [60 seconds]

[Save Settings]
```

### 6. Export/Import (Keep Existing)

**Current implementation works well**:
- Export JSON (copy to clipboard)
- Import JSON (paste, merge with deduplication)
- Keep exactly as-is

### 7. Error Recovery

**Timeout Handling**:
- Article fetch: 30s timeout
- LLM calls: 60s timeout
- Show elapsed time: "⏱️ 2m 15s (this is taking longer than usual)"
- "⏹️ Stop Processing" button

**Failed Items**:
```
⚠️ 3 articles failed to fetch

  • techcrunch.com/... - 404 Not Found
  • medium.com/... - Timeout after 30s
  • arxiv.org/... - Connection refused

[Retry Failed] [Skip & Continue]
```

**Gmail Importer CPU Pegging** (Critical Bug):
- **Detection**: Monitor processing time, if stuck >5min with no progress → alert
- **Recovery**: "🔄 Restart Gmail Connection" button
- **Prevention**: Add request timeout to importer
- **Logging**: Console log for repro case: "Gmail importer stuck: [state details]"

### 8. Minimal Repro for Gmail CPU Bug

**If we can create repro**:
```markdown
## Gmail Importer CPU Pegging Repro

**Symptoms**:
- Deno process hits 100% CPU
- Pattern becomes unresponsive
- Happens non-deterministically

**Repro Steps**:
1. [Document steps when found]
2. [Include: space name, charm ID, query, email count]
3. [Console logs before freeze]
4. [Memory/CPU stats]

**Workaround**:
- Restart dev server
- Lower email limit (100 → 50)
- Add timeout to importer fetch
```

---

## Technical Architecture Changes

### Remove Workarounds

#### 1. Test: Remove lift pattern for email parsing

**Current** (lines 229-286):
```typescript
const parsedArticles = derive(
  [emails, processedArticles] as const,
  ([emailList, processedList]: [any[], ProcessedArticle[]]) => {
    // Manual loop processing...
  }
);
```

**Test if this works now**:
```typescript
const parsedArticles = derive([emails, processedArticles] as const,
  ([emailList, processedList]) => {
    return emailList
      .map(email => {
        const article = extractArticleFromEmail(email.markdownContent);
        if (!article) return null;
        // ...
      })
      .filter(Boolean);
  }
);
```

**If it works** → 50 lines simpler!

#### 2. Consolidate into single handler

**Current**: 3 separate manual handlers (startProcessing, processLinkExtractionResults, saveReports)

**Improved**: Single async handler with try/catch and progress updates

```typescript
const processAllAlerts = handler<unknown, {
  parsedArticles: Array<Article>;
  processedArticles: Cell<ProcessedArticle[]>;
  reports: Cell<Report[]>;
  isProcessing: Cell<boolean>;
  processingStatus: Cell<string>;
}>(async (_, state) => {
  state.isProcessing.set(true);

  try {
    // Phase 1: Fetch articles (parallel)
    updateProgress("Fetching articles...");
    const articleBatch = await fetchArticlesBatch(state.parsedArticles);

    // Phase 2: LLM extract links
    updateProgress("Extracting security report links...");
    const linkExtractionResult = await extractLinksLLM(articleBatch);

    // Phase 3: Dedupe and fetch novel reports
    updateProgress("Fetching novel security reports...");
    const novelReports = await fetchNovelReports(linkExtractionResult, state.reports);

    // Phase 4: LLM summarize
    updateProgress("Summarizing reports...");
    const summarized = await summarizeReportsLLM(novelReports);

    // Phase 5: Save
    updateProgress("Saving reports...");
    saveSummarizedReports(summarized, state.reports);

    state.isProcessing.set(false);
    updateProgress(`✅ Added ${summarized.length} new reports!`);

  } catch (error) {
    state.isProcessing.set(false);
    updateProgress(`❌ Error: ${error.message}`);
  }
});
```

### Modernize to pattern() (Optional)

**Current**:
```typescript
export default recipe<Input, Output>("Prompt Injection Alert Tracker", ({ emails }) => {
  // ...
});
```

**New pattern() syntax** (if clearer):
```typescript
export default pattern<Input, Output>({
  name: "Prompt Injection Alert Tracker",
  implementation: ({ emails }) => {
    // ...
  }
});
```

**Decision**: Test both, use whichever is clearer. Not a priority.

---

## UI Component Specifications

### Status Badge Component

```typescript
type Status = "up-to-date" | "new-alerts" | "processing" | "error";

const StatusBadge = ({ status, count }: { status: Status; count?: number }) => {
  const config = {
    "up-to-date": { icon: "✅", bg: "#f0fdf4", text: "Up to Date" },
    "new-alerts": { icon: "🆕", bg: "#dbeafe", text: `${count} new alerts` },
    "processing": { icon: "⏳", bg: "#fef3c7", text: "Processing..." },
    "error": { icon: "⚠️", bg: "#fee2e2", text: "Needs Attention" },
  };

  const { icon, bg, text } = config[status];

  return (
    <div style={{ background: bg, padding: "8px 12px", borderRadius: "4px" }}>
      {icon} {text}
    </div>
  );
};
```

### Progress Bar Component

```typescript
const ProgressBar = ({ percent, label }: { percent: number; label: string }) => (
  <div>
    <div style={{ fontSize: "12px", marginBottom: "4px" }}>{label}</div>
    <div style={{ background: "#e5e7eb", borderRadius: "4px", height: "8px" }}>
      <div
        style={{
          background: "#3b82f6",
          width: `${percent}%`,
          height: "100%",
          borderRadius: "4px",
          transition: "width 0.3s"
        }}
      />
    </div>
  </div>
);
```

### Report Card Component

```typescript
const ReportCard = ({ report, onToggleRead }: {
  report: OpaqueRef<PromptInjectionReport>;
  onToggleRead: (id: string) => void;
}) => (
  <ct-card
    style={{
      marginBottom: "12px",
      background: report.isRead ? "#ffffff" : "#dbeafe",
      borderLeft: report.isRead ? "none" : "4px solid #3b82f6",
      cursor: "pointer"
    }}
    onClick={() => onToggleRead(report.id)}
  >
    {/* Card content */}
  </ct-card>
);
```

---

## Implementation Plan

### Phase 1: Fix Critical Bugs (2 hours)

**1.1 Fix article count showing 0**
- [ ] Debug parsedArticles derive dependencies
- [ ] Verify emailCount computed correctly
- [ ] Test with real emails
- [ ] Add console logging for debugging

**1.2 Make parsing automatic**
- [ ] Remove manual "Process" button for parsing
- [ ] Auto-run parseEmailscript when emails change
- [ ] Show "⏳ Parsing 35 emails..." indicator

**1.3 Add Gmail CPU bug mitigation**
- [ ] Add timeout to email fetching (5min max)
- [ ] Detect stuck state (no progress for 2min)
- [ ] Show "🔄 Restart Connection" button
- [ ] Log details for minimal repro

**Commit**: "Fix critical bugs: article count, auto-parsing, gmail timeout"

### Phase 2: Remove Workarounds (1 hour)

**2.1 Test simplified email parsing**
- [ ] Try removing lift, use derive + map directly
- [ ] Test with importer.emails (now not OpaqueRef per commit 8e55ed865)
- [ ] If works: remove 50+ lines of manual loop code
- [ ] If doesn't work: document why, keep current approach

**2.2 Consolidate handlers**
- [ ] Combine startProcessing + processLinkExtractionResults + saveReports
- [ ] Single async handler with try/catch
- [ ] Progress updates throughout
- [ ] Error recovery at each stage

**Commit**: "Remove workarounds: simplified parsing, consolidated handlers"

### Phase 3: UX Overhaul (2 hours)

**3.1 Redesign header status**
- [ ] Create unified status card component
- [ ] Show state: up-to-date | new-alerts | processing | error
- [ ] One primary action button (context-aware)
- [ ] Stats: X new, Y tracked, Z unread

**3.2 Progressive disclosure**
- [ ] Hide Gmail setup by default
- [ ] Add "⚙️ Settings" toggle
- [ ] Collapse debug sections
- [ ] Focus on: Status → Action → Results

**3.3 Improve reports list**
- [ ] Add unread highlighting (blue border + background)
- [ ] Click anywhere to mark read
- [ ] "Mark All Read" bulk action
- [ ] Severity badges with colors

**3.4 Add filtering**
- [ ] Search box (filters by title/summary)
- [ ] "Show only unread" checkbox
- [ ] "LLM-specific only" checkbox
- [ ] Severity filter dropdown

**Commit**: "UX overhaul: redesigned status, progressive disclosure, filtering"

### Phase 4: Error Handling & Recovery (1 hour)

**4.1 Timeout handling**
- [ ] 30s timeout for article fetches
- [ ] 60s timeout for LLM calls
- [ ] Show elapsed time during processing
- [ ] "⏹️ Stop Processing" button

**4.2 Failed item tracking**
- [ ] Show list of failed articles/reports
- [ ] Reason for failure (404, timeout, etc.)
- [ ] "Retry Failed" button
- [ ] "Skip & Continue" button

**4.3 Graceful degradation**
- [ ] If one article fails, continue with others
- [ ] If LLM times out, save partial results
- [ ] If websocket disconnects, auto-reconnect
- [ ] Never get stuck, always recoverable

**Commit**: "Add error handling: timeouts, retries, graceful degradation"

### Phase 5: Testing & Polish (30min)

**5.1 End-to-end testing**
- [ ] Process 20+ real emails
- [ ] Verify deduplication works
- [ ] Test with known duplicates
- [ ] Test error cases (bad URLs, timeouts)

**5.2 Performance testing**
- [ ] Measure time to process 15 emails
- [ ] Verify parallel fetching works
- [ ] Check memory usage
- [ ] Monitor for gmail CPU bug

**5.3 Documentation**
- [ ] Update DESIGN doc with v2 changes
- [ ] Document removed workarounds
- [ ] Add troubleshooting guide
- [ ] Update STATUS with completion

**Commit**: "Complete v2: tested, polished, documented"

---

## Success Metrics

### Before (Current State)
- ❌ Article count shows 0
- ❌ Manual multi-step process (confusing)
- ❌ Gmail CPU bug can occur
- ❌ No error recovery
- ❌ Complex UI with too much exposed
- ❌ No filtering or search
- ⚠️ Works but requires debugging

### After (Target State)
- ✅ Auto-parses emails on load
- ✅ One-click processing (all phases automatic)
- ✅ Gmail timeout prevents CPU pegging
- ✅ Graceful error handling with retry
- ✅ Clean, focused UI (progressive disclosure)
- ✅ Filtering, search, read/unread tracking
- ✅ Production-ready, polished experience

### Key Metrics
- **Time to value**: <30 seconds (from landing to seeing new reports)
- **Error recovery**: 100% (never stuck, always recoverable)
- **Processing time**: <2 minutes for 15 emails (including LLM)
- **User comprehension**: "What's next?" always clear
- **Mobile usability**: Works on phone screens

---

## Future Enhancements (Post-V2)

**P1 (Next sprint)**:
- Automated scheduling (run every 15min)
- Desktop notifications for new reports
- Severity-based alerting (high/critical only)

**P2 (Future)**:
- Export to markdown/GitHub issues
- Collaborative sharing
- CVE database cross-reference
- Trend analytics (new reports per week)
- Multi-source alerts (not just Gmail)

---

## Risk Analysis

### High Risk
- ❌ **Gmail CPU bug** - Non-deterministic, hard to repro
  - **Mitigation**: Timeout + restart button + logging for repro

### Medium Risk
- ⚠️ **Framework changes break existing code** - lift pattern removal might not work
  - **Mitigation**: Test incrementally, keep fallback if needed

- ⚠️ **LLM timeouts on slow networks** - Could frustrate users
  - **Mitigation**: Show elapsed time, allow cancel, save partial results

### Low Risk
- ℹ️ **URL normalization edge cases** - Different URLs for same report
  - **Mitigation**: Start simple, add sophisticated matching later

---

## Appendix: Key Files

**Implementation**:
- Main: `/recipes/alex/WIP/prompt-injection-tracker.tsx` (1179 lines)

**Documentation**:
- Original design: `DESIGN-prompt-injection-tracker.md`
- Status report: `STATUS-prompt-injection-tracker.md`
- UX issues: `PROMPT-INJECTION-UX-IMPROVEMENTS-v2.md`
- This spec: `SPEC-prompt-injection-tracker-v2.md`

**Related Patterns**:
- `gmail-auth.tsx` - OAuth
- `gmail-importer.tsx` - Email fetching (HAS CPU BUG!)
- `test-recipe-with-extraction.tsx` - LLM extraction pattern
- `meta-analyzer.tsx` - Multi-item analysis pattern

---

## Questions for User

Before implementation:

1. **Auto-process vs manual**: Should "Process Alerts" be automatic on load, or keep as manual button?
   - Recommendation: Manual button (user control), but auto-parse emails

2. **Gmail CPU bug**: Do you have any additional context on when it occurs?
   - Have you noticed patterns? (specific query, email count, etc.)

3. **Priority**: What's most important?
   - A) Fix bugs (article count, CPU pegging)
   - B) Simplify UX (progressive disclosure, one-click processing)
   - C) Both equally

Recommendation: Start with A (fix bugs), then B (UX), then test thoroughly.

---

## Ready to Implement

This spec is ready for implementation. Next steps:

1. Review and approve spec
2. Start Phase 1 (fix critical bugs)
3. Iterate through phases 2-5
4. Deploy and test end-to-end
5. Collect real-world feedback

**Estimated timeline**: 4-6 hours focused work across 2-3 sessions.

**End of Spec** 🎯
