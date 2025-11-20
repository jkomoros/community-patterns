# Prompt Injection Tracker - UX Improvements

## Current Issues

**Information Architecture:**
1. Shows "0 new articles" even with 35 emails loaded
2. Manual "Fetch Emails" button when should auto-sync
3. Complex two-level URL tracking (Articles → Reports) is hidden but confusing
4. No visual indication of processing pipeline state
5. Gmail table shows raw emails without clear next action
6. Statistics at top show counts but no actionable info
7. "Process X New Articles" button but always shows 0

**User Experience:**
8. Can't tell which emails have been processed
9. No feedback when regex parsing fails  
10. No way to see what articles were extracted from which email
11. Reports section is empty with unhelpful "No reports yet" message
12. No progress indication during LLM processing
13. Can't manually retry failed parses
14. No search/filter within results

## Proposed Improvements

### Phase 1: Auto-Processing & Visual Feedback (High Priority)

**TODO 1.1:** Auto-parse emails as they arrive
- Remove manual "Process" button
- Run parsedArticles computation automatically when emails change
- Show "⏳ Parsing 35 emails..." indicator during processing

**TODO 1.2:** Show per-email status
- Add status badge to each email row: ✓ Parsed | ⏳ Processing | ✗ No article found
- Color-code rows: green (article found), gray (no article), yellow (processing)
- Show extracted article title inline with email if found

**TODO 1.3:** Visual pipeline view
```
[📧 35 Emails] → [📰 12 Articles] → [🔍 Analyzing...] → [🔒 3 Reports]
     ↓ click to expand each section
```

**TODO 1.4:** Replace email table with card view
- Each card shows: Email subject, date, extracted article (if found), action buttons
- Cards grouped by status (New Articles, Already Processed, No Article Found)
- Click card to expand and show full email content

### Phase 2: Progressive Disclosure & Actions (Medium Priority)

**TODO 2.1:** Simplified main view
- Top: Stats + "Sync Gmail" button
- Middle: List of NEW articles (not emails) with "Track this" buttons
- Bottom: Tracked reports (existing functionality)
- Hide email table by default (show "View raw emails" toggle)

**TODO 2.2:** Article preview cards
```
┌─────────────────────────────────────────┐
│ 📰 Article Title (from email)           │
│ 🔗 example.com/article                  │  
│ 📅 Nov 13, 2025                         │
│ [Track this] [Skip] [Already read]     │
└─────────────────────────────────────────┘
```

**TODO 2.3:** Batch operations
- "Track all new articles" button
- "Mark all as read" button  
- Select multiple articles with checkboxes

**TODO 2.4:** Auto-sync on load
- Check Gmail automatically when charm opens
- Show last sync time: "Last synced: 2 minutes ago"
- Auto-sync every 5 minutes (configurable)

### Phase 3: Error Handling & Debug (Medium Priority)

**TODO 3.1:** Show parse failures clearly
- Section: "⚠️ 5 emails with no article found"
- Expandable list showing which emails and why (regex didn't match, etc.)
- "Show email" button to debug

**TODO 3.2:** LLM processing feedback
- When analyzing article: "🔍 Analyzing: [Article Title]..."
- Show which step: "Fetching article..." → "Extracting report link..." → "Analyzing report..."
- Error states: "❌ Failed to fetch: 404 Not Found"

**TODO 3.3:** Deduplication transparency
- Show: "ℹ️ Skipped 3 duplicate articles"
- Click to see list of skipped URLs
- Option to force re-process

### Phase 4: Advanced Features (Low Priority)

**TODO 4.1:** Search & Filter
- Search box for articles/reports
- Filter by: Date range, Severity, Read/Unread, Domain
- Sort by: Date, Severity, Title

**TODO 4.2:** Tagging & Organization
- Add custom tags to reports
- Group reports by tag
- "Similar reports" suggestion (same vulnerability type)

**TODO 4.3:** Export & Sharing
- Export to Markdown
- Export to JSON  
- Copy report link to clipboard
- Share specific report

**TODO 4.4:** Smart notifications
- Desktop notification for high-severity reports
- Email digest (daily summary)
- Slack integration

## Quick Wins (Do First)

1. **Auto-parse on email load** - Biggest UX improvement
2. **Show article count** - Fix "0 new articles" when articles exist
3. **Card view for articles** - Replace confusing email table
4. **One-click "Track All"** - Reduce manual work
5. **Hide Gmail setup** - Progressive disclosure (toggle to show)

## Design Principles

- **Zero-config**: Works immediately after Gmail auth
- **Automatic**: Minimal manual intervention
- **Progressive**: Hide complexity, show results
- **Actionable**: Every screen element has clear next step
- **Transparent**: Show what's happening and why
- **Forgiving**: Easy to retry, undo, or skip
