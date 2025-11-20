# Prompt Injection Tracker - Make It Work First

## Critical Bugs (Fix These First)

**BUG 1: Article count shows 0 when articles exist**
- parsedArticles computed() runs but result isn't displayed
- Check if parsedArticles.length is being calculated correctly
- Verify derive/computed chain for newArticleCount

**BUG 2: No visual indication that parsing happened**
- 35 emails loaded
- Console shows "Parsed 0 new articles" 
- Either regex isn't matching OR articles are all marked as "already processed"
- Add logging to parsedArticles to see what's happening

**BUG 3: Process button does nothing visible**
- "Process 0 New Articles" button exists but shows 0
- Click it → nothing happens
- Need to wire up the processing pipeline

## Phase 1: Core Functionality (DO THIS)

**TODO 1.1: Debug why article parsing returns 0**
```typescript
// Add logging to see what's happening:
console.log("Total emails:", emails.length);
console.log("Already processed URLs:", processedURLs.size);
for (const email of emails) {
  const match = email.markdownContent.match(/NEWS\s+\[([^\]]+)\]/);
  console.log("Email match:", !!match, email.subject);
}
```

**TODO 1.2: Show parsed articles list**
- Display parsedArticles array even if empty
- Each article: Title, URL, "Track this" button
- Don't wait for manual processing - show them immediately

**TODO 1.3: Make "Track this" button work**
- Click article → fetch it → extract report link → show report
- One button per article, direct action
- Show loading state per article

**TODO 1.4: Remove intermediate "Process" step**
- Don't make user click "Process X Articles" first
- Go directly from Articles → Track button → Analysis
- Remove confusing pipeline orchestration

## Phase 2: Basic UX (After Phase 1 Works)

**TODO 2.1: Collapse Gmail setup section**
- Default: Hidden, show "⚙️ Gmail Settings" toggle
- Most users don't need to see auth details after login

**TODO 2.2: Show what's new**
- "🆕 12 new articles since last check"
- "Already tracked: 3"
- Clear distinction between new and seen

**TODO 2.3: Article cards instead of raw email table**
```
┌──────────────────────────────────────┐
│ 📰 AI Security Flaw Discovered       │
│ 🔗 techcrunch.com/ai-vuln            │
│ [Track this]                         │
└──────────────────────────────────────┘
```

## Phase 3: Polish (Nice to Have)

- Batch "Track all" button
- Search/filter
- Export
- Auto-sync

## Root Cause Analysis Needed

Current logs show "Parsed 0 new articles from 0 emails" but we have 35 emails.
This suggests:
1. Either `emails` variable is empty when parsing runs
2. Or regex never matches
3. Or all URLs are in processedURLs already

**Fix approach:**
1. Add console.log in parsedArticles to see actual email count
2. Test regex against one real email  
3. Check if processedArticles is pre-populated somehow
4. Verify computed() dependency tracking
