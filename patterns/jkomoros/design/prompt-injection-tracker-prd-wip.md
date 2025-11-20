# Product Requirements Document: Prompt Injection Tracker UX Improvements

**Status**: ⚠️ **BLOCKED - Framework Limitation Discovered**
**Date**: 2024-11-18
**Updated**: 2024-11-18
**Author**: Claude (UX Analysis)

---

## ⚠️ IMPORTANT NOTE

**This PRD is associated with `prompt-injection-tracker-WIP.tsx`, NOT the main `prompt-injection-tracker.tsx` file.**

**Why separate files?**
- Phase 1 implementation (Load Examples + Read/Unread Filter) compiles successfully but **causes deployment timeouts**
- The main working pattern was reverted to the last stable version (commit ff60290)
- The Phase 1 attempt is preserved in `prompt-injection-tracker-WIP.tsx` as a learning artifact
- See `PHONE-A-BERNI-complex-filtered-render.md` for detailed bug report to framework authors

**Framework Limitation:**
Complex filtered array rendering with `derive(filteredList, list => list.map(...))` causes the compiler to hang during deployment. This blocks implementation of basic list filtering patterns (read/unread, severity, search) that are common in other frameworks.

**Status of Phase 1 Features:**
- ✅ **Load Examples button**: Implemented, tested successfully, works!
- ✅ **Filter toggle buttons (All | Unread | Read)**: Implemented, renders correctly
- ❌ **Filtered list rendering**: Causes deployment timeout due to framework limitation

The working pattern (`prompt-injection-tracker.tsx`) can be deployed and used while we wait for framework support for more complex derives.

---

## Executive Summary

The Prompt Injection Tracker successfully compiles and deploys, but has significant UX friction that prevents users from quickly understanding its value and getting started. This PRD identifies key usability issues and proposes improvements to reduce time-to-value and improve daily workflow.

## Current State Analysis

### What Works Well ✅

1. **Technical Foundation**: Pattern compiles, deploys, and runs without errors
2. **Information Architecture**: All necessary data is captured (severity, affected systems, novelty, etc.)
3. **Multi-phase Processing**: LLM-driven pipeline (extract → dedupe → fetch → summarize) is sound
4. **Read/Unread Tracking**: Basic concept for managing reviewed vs. new reports exists
5. **Import/Export**: JSON-based persistence allows backup/restore

### Critical UX Issues 🚨

#### 1. **Empty State Problem - No Value Demonstration**
**Issue**: New users see all zeros and empty sections. They can't visualize what the output looks like or understand the value.

**Impact**: High abandonment risk. Users don't know if the tool is worth the setup effort.

**User Quote**: *"Is this thing working? What am I supposed to see here?"*

#### 2. **Hidden Critical Path - Gmail Auth Buried**
**Issue**: Gmail authentication (the blocker to all functionality) is the 4th section, below Statistics and Actions which can't work without auth.

**Impact**: Users waste time trying to understand disabled buttons before realizing they need to scroll down and authenticate.

**Current Order**: Status → Statistics → Actions → Gmail Setup → Reports
**Problem**: First interaction should be Gmail auth, but it's hidden

#### 3. **Manual Processing - No Automation**
**Issue**: Users must manually click "Process New Alerts" after fetching emails. No automatic processing or scheduling.

**Impact**:
- Alerts sit unprocessed until user remembers to click
- Multiple manual steps create friction
- No "set and forget" workflow

**User Story**: *"As a security researcher, I want to check for new prompt injection vulnerabilities once daily without manually triggering each step."*

#### 4. **Complex Multi-Step Flow - Unclear Sequence**
**Issue**: The workflow has 5+ steps but no guidance on sequence or state.

**Current Steps** (not explicitly shown):
1. Authenticate Gmail
2. Fetch emails
3. Wait for fetch to complete
4. Click "Process New Alerts"
5. Wait for LLM extraction
6. Click "Fetch & Summarize Novel Reports"
7. Wait for summarization
8. Click "Save Reports"

**Impact**: Users get lost in the middle. It's unclear which step they're on or what to do next.

#### 5. **No Search/Filter - Unscalable with Many Reports**
**Issue**: After processing 50-100 alerts, the reports list becomes difficult to navigate. No filtering by:
- Read/Unread status
- Severity (Critical, High, Medium, Low)
- LLM-specific vs. general security
- Date range
- Affected systems
- Text search

**Impact**: Tool becomes less useful as it succeeds. Power users will generate hundreds of reports.

#### 6. **Processing Feedback - Poor Visibility**
**Issue**: During LLM processing (can take 30-60 seconds), only a small status text updates. No progress bar, no time estimate.

**Impact**: Users think the app is frozen. May click buttons multiple times or refresh.

#### 7. **Import/Export Hidden - Backwards Progressive Disclosure**
**Issue**: JSON import/export section only appears *after* you have reports. But new users would benefit from importing example data first.

**Impact**: Missed opportunity for onboarding. Users can't "try before they buy" by importing sample reports.

#### 8. **Read/Unread Management - Incomplete Feature**
**Issue**: Reports have read/unread status, but:
- No "Mark All as Read" bulk action
- No filter to show only unread
- No keyboard shortcuts (space to mark read, j/k navigation)
- Unread count shown in header but can't click to filter

**Impact**: Feature exists but doesn't provide enough value. Users still need external tracking.

## User Personas

### Primary: Security Researcher
**Goals**:
- Stay on top of LLM security vulnerabilities
- Quickly assess new threats
- Track which reports I've reviewed

**Pain Points**:
- Too many low-quality "news about news" articles
- Manual tracking in spreadsheets
- Missing critical disclosures buried in noise

**Frequency**: Daily check (5-10 minutes)

### Secondary: Security Team Lead
**Goals**:
- Monitor emerging threats for team awareness
- Generate weekly summaries for team meetings
- Archive reports for post-incident analysis

**Pain Points**:
- No export to team wiki/Slack
- Can't bulk tag or categorize
- No reporting/analytics view

**Frequency**: Weekly review (30 minutes)

## Proposed Improvements

### Phase 1: Quick Wins (1-2 hours implementation)

#### 1.1 Reorder UI Sections
**Change**: Move Gmail Setup to the top, right below the header.

**New Order**:
1. Status Dashboard (collapsed to single line)
2. Gmail Setup (prominent, with visual indicator if not authed)
3. Reports List (the main content)
4. Statistics (collapsed, expandable)
5. Actions (combined into context menus)
6. Import/Export (always visible, not conditional)

**Rationale**: Put the blocker first, the value (reports) second.

#### 1.2 Add Example Data Toggle
**Change**: Add a "Load Example Reports" button that imports 3-5 sample prompt injection reports.

**Implementation**:
```typescript
const sampleReports: PromptInjectionReport[] = [
  {
    title: "HackedGPT - ChatGPT Memory Hijacking",
    severity: "high",
    summary: "Researchers demonstrate persistent memory poisoning...",
    // ... rest of sample data
  },
  // 2-4 more examples
];

const loadExamples = handler(() => {
  for (const report of sampleReports) {
    reports.push(report);
  }
});
```

**Rationale**: Show don't tell. Users see value immediately.

#### 1.3 Add Read/Unread Filter
**Change**: Add toggle buttons above reports list: `All` | `Unread` | `Read`

**Implementation**: Simple derived filter:
```typescript
const filterMode = cell<'all' | 'unread' | 'read'>('all');
const filteredReports = derive([reports, filterMode], ([list, mode]) => {
  if (mode === 'unread') return list.filter(r => !r.isRead);
  if (mode === 'read') return list.filter(r => r.isRead);
  return list;
});
```

**Rationale**: Makes read/unread tracking actually useful.

### Phase 2: Flow Improvements (3-4 hours)

#### 2.1 Automatic Processing Pipeline
**Change**: Add checkbox "Auto-process new alerts" (default: ON). When enabled, fetching emails automatically triggers the full pipeline.

**Benefit**: Reduces 5-step flow to 1 step (Fetch Emails).

#### 2.2 Processing Progress Indicator
**Change**: Replace status text with visual progress:
- Step indicator: "Step 2 of 4: Extracting security links..."
- Progress bar with percentage
- Estimated time remaining

**Rationale**: Reduces uncertainty, prevents user abandonment during long LLM calls.

#### 2.3 Severity Filtering
**Change**: Add severity filter chips: `🔴 Critical` | `🟠 High` | `🟡 Medium` | `🟢 Low`

**Rationale**: Users triage by severity first. This is security-critical workflow.

### Phase 3: Power User Features (5-8 hours)

#### 3.1 Search Functionality
**Change**: Add search bar that filters reports by:
- Title
- Summary
- Attack mechanism
- Affected systems

**Implementation**: Full-text search using existing patternTool capability.

#### 3.2 Bulk Actions
**Change**: Add checkbox selection + bulk actions:
- Mark all as read
- Export selected reports
- Delete selected reports

#### 3.3 Keyboard Shortcuts
**Change**: Add keyboard navigation:
- `j/k`: Next/previous report
- `Space`: Toggle read/unread
- `x`: Select/deselect
- `/`: Focus search

**Rationale**: Power users process many reports. Mouse is slow.

#### 3.4 Report Details Modal
**Change**: Instead of inline `<details>` expansion, click report title to open modal with:
- Full report content
- Related articles (that linked to this report)
- User notes (editable)
- Tags (editable)

**Benefit**: Better focus on one report at a time. More space for content.

### Phase 4: Advanced (Future Consideration)

#### 4.1 Email on New Critical Alerts
**Change**: Send email/Slack notification when Critical severity report is discovered.

#### 4.2 Weekly Digest
**Change**: Generate markdown/PDF summary of new reports this week.

#### 4.3 Trends Dashboard
**Change**: Chart showing:
- Reports per week over time
- Affected systems frequency
- Severity distribution

## Success Metrics

### Adoption Metrics
- **Time to First Report**: Target < 2 minutes (from landing to seeing first report)
- **Setup Completion Rate**: % of users who authenticate Gmail
- **Example Data Usage**: % of new users who load examples

### Engagement Metrics
- **Daily Active Users**: % of users who check daily
- **Reports Processed per Session**: Average number reviewed
- **Read/Unread Ratio**: % of reports marked as read within 7 days

### Quality Metrics
- **False Positive Rate**: % of reports not actually LLM-specific
- **Duplicate Rate**: % of reports that are duplicates despite deduping
- **User Satisfaction**: NPS score from power users

## Implementation Priority

### Must Have (Block Launch)
1. ✅ Fix Frame mismatch error (DONE)
2. Load example reports button
3. Reorder UI sections (Gmail first)
4. Read/Unread filter

### Should Have (Launch Week 1)
5. Auto-process pipeline
6. Progress indicators
7. Severity filtering
8. Search functionality

### Nice to Have (Post-Launch)
9. Keyboard shortcuts
10. Bulk actions
11. Details modal
12. Trends dashboard

## Technical Considerations

### Performance
- **Concern**: With 200+ reports, rendering may slow down
- **Solution**: Virtualized list (render only visible reports)
- **Concern**: Search on 200+ reports may be slow
- **Solution**: Debounced search + index cached in derived value

### Data Persistence
- **Current**: JSON import/export (manual)
- **Risk**: Users lose data on browser cache clear
- **Recommendation**: Add "Auto-save to clipboard" every 10 reports processed

### LLM Costs
- **Current**: No limits on processing
- **Risk**: User processes 100 articles → $5+ API cost
- **Recommendation**: Add cost estimate before processing large batches

## Open Questions

1. **Should we dedupe across user sessions?** (i.e., global deduplication database)
2. **Should we support multiple Gmail accounts?** (for team usage)
3. **Should we integrate with existing security tools** (Slack, PagerDuty, Jira)?
4. **Should we support RSS feeds** as alternative to Gmail?

## Appendix: Competitive Analysis

### Existing Solutions
- **Manual Google Alerts → Spreadsheet**: Free, but 100% manual
- **Feedly + RSS**: Better than email, but no deduplication or LLM analysis
- **Security-focused news aggregators**: Broader scope, miss niche disclosures

### Our Differentiator
- **LLM-powered deduplication**: Focus on original reports, not news coverage
- **LLM-specific classification**: Filter general security noise
- **Integrated end-to-end**: Gmail → Analysis → Tracking in one tool

## Conclusion

The Prompt Injection Tracker has a solid technical foundation but needs UX polish to be usable. The highest-priority improvements are:

1. **Show value first**: Example reports to demonstrate output
2. **Fix critical path**: Put Gmail auth at the top
3. **Reduce clicks**: Auto-processing pipeline
4. **Enable triage**: Read/unread filter + severity filter

With these changes, the tool can become a daily-driver for security researchers tracking LLM vulnerabilities.
