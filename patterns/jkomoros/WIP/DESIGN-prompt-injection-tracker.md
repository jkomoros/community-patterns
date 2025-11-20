# Prompt Injection Alert Tracker - Design Document

## Product Requirements Document (PRD)

### Overview
Automate the daily workflow of monitoring Google Alerts for "prompt injection" to identify and track genuinely new security reports while filtering out low-quality reposts and duplicates.

### User Story
As a security researcher tracking prompt injection vulnerabilities, I receive 5-20 Google Alert emails daily. Most (90%+) are low-quality blog reposts linking back to the same original reports. Currently, I manually:
1. Skim email title, description, and source domain
2. Decide if it might be new
3. Click through to article
4. Scan for links to original security reports (often buried deep in article)
5. Visit original report
6. Determine if it's genuinely new
7. If new, manually log it with summary

**Goal**: Automate this entire workflow, presenting only genuinely new reports with structured summaries.

### Core Features

#### 1. Email Ingestion & Processing
- **Manual Trigger**: User clicks "Process New Alerts" button (no CRON/automated scheduling)
- **Gmail Integration**: Fetch recent emails from Gmail with query matching Google Alerts for "prompt injection"
- **Deduplication**: Track processed email IDs to avoid reprocessing
- **Batch Processing**: Process multiple emails in one run
- **Progress Indication**: Show "Processing X of Y emails..." status

#### 2. Intelligent Content Analysis
- **Link Extraction**: Extract all URLs from each Google Alert email body
- **Web Content Retrieval**: Fetch and read the actual article content from each link
- **Repost Detection**: LLM analyzes if article is:
  - Original security research/report
  - Blog post discussing someone else's research (with link to original)
  - News article referencing original research (with link)
  - Low-quality repost with no new information
- **Original Source Tracking**: If article is a repost, extract and follow link to original security report
- **Multi-hop Following**: Follow up to 2-3 links to find the original source

#### 3. Novelty Detection
- **URL-Based Deduplication**: Check if original report URL matches any existing tracked reports
- **URL Normalization**: Strip tracking parameters, fragments, and normalize for comparison
- **Deduplication Logic**: Same original source URL = not new (regardless of which blog reposted it)
- **Novel Report Identification**: A report is new if:
  - The normalized original source URL is not in our database
  - This is the first time we've seen this specific security report/disclosure

#### 4. Structured Report Generation
For each new report identified, automatically capture:
- **Title**: Name of the vulnerability/attack
- **Source URL**: Link to original security report
- **Discovery Date**: When it was reported
- **Summary**: 2-3 sentence overview of what happened
- **Attack Mechanism**: How the attack works (technical details)
- **Affected Systems**: What products/systems are vulnerable
- **Novelty Factor**: What makes this attack new/different
- **Original Email**: Link back to the Google Alert email that contained it

#### 5. User Interface

**Main View**:
- Button: "Process New Alerts" (with count of unprocessed emails if available)
- Processing status: "Processing 3 of 12 emails..." with spinner
- Count: "X new reports found today, Y total reports tracked"

**Reports List**:
- Sortable list of all tracked reports (newest first)
- Each report shows:
  - Title (clickable to original source)
  - Date discovered
  - Affected systems (tags)
  - Summary (collapsible)
  - Full details (expandable)
- Actions per report:
  - "Mark as False Positive" (removes from list)
  - "Edit" (modify any field)
  - "Add Note" (append observations)

**Email Log** (secondary view):
- List of processed emails with results:
  - Email date/subject
  - Processing result: "New Report" | "Repost" | "Not Relevant"
  - Link to report if new
- Ability to "Reprocess" an email if analysis was wrong

### Success Metrics
- **Time Saved**: Reduce manual review time from ~30min/day to ~5min/day
- **Accuracy**: 95%+ precision (few false positives in "new report" list)
- **Coverage**: 95%+ recall (don't miss genuinely new reports)
- **Efficiency**: Process typical day's alerts (10-15 emails) in < 2 minutes

### Non-Goals (Phase 1)
- Automated scheduling (user must manually trigger)
- Real-time notifications when processing completes
- Integration with external tracking systems (e.g., GitHub Issues, Notion)
- Automated security alerts or responses
- Support for other types of Google Alerts (only prompt injection)
- Historical processing (only processes new emails since last run)

---

## Implementation Design

### Architecture Overview

**Pattern Structure**: Single self-contained pattern with Gmail integration and web fetching

**Key Components**:
1. Gmail email fetcher (using gmail auth charm)
2. Link extractor from email HTML
3. Web content fetcher with redirect handling
4. Multi-stage LLM analysis pipeline
5. State management for processed emails and known reports
6. UI for triggering processing and viewing results

### Data Models

```typescript
interface ProcessedArticle {
  articleURL: string;                  // The Google Alert article URL (normalized)
  emailId: string;                     // Gmail message ID that linked to this
  processedDate: string;               // When we analyzed it
  originalReportURLs: string[];        // Original report URLs found in this article
  classification: 'has-reports' | 'no-reports' | 'error';
  notes?: string;                      // Error messages or processing notes
}

interface PromptInjectionReport {
  id: string;                    // Generated UUID
  title: string;                 // Vulnerability/attack name
  sourceUrl: string;             // Original security report URL
  discoveryDate: string;         // ISO date when report was published
  summary: string;               // 2-3 sentence overview
  attackMechanism: string;       // Technical description of how it works
  affectedSystems: string[];     // List of vulnerable systems/products
  noveltyFactor: string;         // What makes this new/different
  severity?: 'low' | 'medium' | 'high' | 'critical';
  isLLMSpecific: boolean;        // Is this an LLM-specific security issue?
  llmClassification: string;     // Explanation of LLM-specific classification
  originalEmailId: string;       // Link back to Google Alert email
  addedDate: string;             // ISO date when we added to tracker
  userNotes: string;             // User can add observations
  tags: string[];                // User-added tags for categorization
}

interface TrackerInput {
  // No external inputs needed - embeds Gmail components directly
}

interface TrackerOutput {
  lastProcessedDate: string;                                  // Last time we ran
  processedArticles: Default<ProcessedArticle[], []>;         // Google Alert articles we've analyzed
  reports: Default<PromptInjectionReport[], []>;              // Unique original security reports
  isProcessing: boolean;                                      // Currently running?
  processingStatus: string;                                   // Status message during processing

  // Derived/computed stats
  processedEmailCount: number;                                // How many emails analyzed
  uniqueReportCount: number;                                  // How many unique reports found
}
```

### Pattern Architecture

**Self-Contained Design:**
```
┌──────────────────────────────────────────────────────┐
│ Prompt Injection Alert Tracker                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌────────────┐    auth     ┌──────────────────┐   │
│  │ GmailAuth  │────────────>│ GmailImporter    │   │
│  │ (embedded) │             │ (embedded)       │   │
│  └────────────┘             └──────────────────┘   │
│                                      │               │
│                                      v               │
│                              emails: Email[]         │
│                                      │               │
│                     ┌────────────────┴──────┐       │
│                     v                       v       │
│          processedEmailIds          New Emails      │
│          (filter processed)         (to analyze)    │
│                                           │          │
│                                           v          │
│                            Batch Classification LLM  │
│                                           │          │
│                                           v          │
│                            URL Deduplication         │
│                                           │          │
│                                           v          │
│                            Batch Extraction LLM      │
│                                           │          │
│                                           v          │
│                                  reports: Report[]   │
└──────────────────────────────────────────────────────┘
```

**Key Components:**
- **GmailAuth** (imported): Handles Google OAuth
- **GmailImporter** (imported): Fetches/stores emails, pre-configured with query
- **Processing Logic** (new): Parse emails, classify, deduplicate, extract
- **State Management** (new): processedEmailIds, reports, isProcessing

### Reactive Data Flow Pipeline

**Core Insight:** We track TWO sets of URLs:
1. **Processed article URLs** - Google Alert articles we've read (with mapping to what they link to)
2. **Known report URLs** - Unique original security reports (with summaries)

**Complete Pipeline:**

**Step 1: Fetch & Parse Google Alert Articles**
```
FOR EACH unprocessed email:
  1. Parse JSON from email.markdownContent
  2. Extract Google tracking URL
  3. Unwrap to get actual article URL
  4. Normalize article URL
  5. Check if article URL in processedArticles
     - If yes: Skip (already analyzed this article)
     - If no: Add to batch for fetching
```

**Step 2: Fetch Article Content & Extract Links** (async handler)
```
FOR EACH new article URL:
  1. Fetch article content (await WebFetch)
  2. Set as input to link extraction LLM
```

**Step 3: LLM - Extract Security Report Links** (generateObject - reactive)
```
Input: Array of {
  emailId: string,
  articleURL: string,
  articleContent: string  // Full HTML/text content
}

Output: {
  articles: Array<{
    emailId: string,
    articleURL: string,
    securityReportLinks: string[],  // URLs that appear to be original security reports
    classification: "has-security-links" | "no-security-links" | "is-original-report"
  }>
}

Process:
- LLM reads article content
- Extracts URLs that appear to be original security reports/advisories
- Distinguishes between:
  * Blog post linking to Tenable/researcher blog → extract Tenable URL
  * Original report itself (article IS the security report) → return article URL
  * Generic mention with no original source → return empty array
- Returns array of security report URLs found in article

Prompt guidance:
"Extract URLs that point to ORIGINAL security research/reports. Look for:
- Company security blogs (tenable.com/blog, security.googleblog.com, etc.)
- Researcher blogs/sites
- GitHub repositories with PoC code or advisories
- Security advisory pages
- CVE database entries
Ignore: social media, news sites, aggregators, generic homepages"
```

**Step 4: Deduplicate Original Report URLs** (handler)
```
FOR EACH article result:
  FOR EACH securityReportLink in article.securityReportLinks:
    1. Normalize URL
    2. Check if normalized URL in existing reports.sourceURL
    3. If new:
       - Add to novelReports list
       - Record mapping: articleURL → originalReportURL
    4. If duplicate:
       - Still record mapping (article points to known report)

  Save ProcessedArticle {
    articleURL,
    emailId,
    originalReportURLs: article.securityReportLinks,
    processedDate: now
  }
```

**Step 5: LLM - Summarize and Classify Novel Reports** (generateObject - reactive)
```
Input: Array of {
  reportURL: string,
  reportContent: string  // Fetched from reportURL
}

Output: {
  reports: Array<{
    sourceURL: string,
    title: string,
    summary: string,
    attackMechanism: string,
    affectedSystems: string[],
    noveltyFactor: string,
    severity: "low" | "medium" | "high" | "critical",
    discoveryDate: string,
    isLLMSpecific: boolean,  // NEW: Is this an LLM-specific security issue?
    llmClassification: string  // NEW: Why this is/isn't LLM-specific
  }>
}

Process:
- LLM reads original security report content
- Extracts structured vulnerability details
- Generates summary and attack mechanism description
- **NEW: Classifies if this is an LLM-specific security issue:**
  * TRUE if: Prompt injection, jailbreaking, LLM-specific exploits, attacks only possible with LLMs
  * FALSE if: General security issue that happens to mention AI/LLMs in passing

LLM Classification Criteria for isLLMSpecific:
✅ YES (LLM-specific):
- Prompt injection attacks
- Jailbreaking/safety bypass techniques
- Model manipulation (poisoning, backdoors)
- LLM memory hijacking
- Agent/agentic system vulnerabilities specific to LLM behavior
- Attacks that exploit LLM text generation

❌ NO (not LLM-specific):
- General malware that mentions AI
- Traditional web security issues in apps that happen to use AI
- Business/product problems with AI companies
- General AI ethics/safety discussions
- Crypto scams using AI for social engineering (unless exploiting LLM vulnerabilities)

This allows filtering the final reports to ONLY genuine LLM security vulnerabilities.
```

**Step 6: Save Reports** (handler)
```
FOR EACH extracted report:
  Add to reports array with:
    - All LLM-extracted fields
    - sourceURL (normalized)
    - addedDate: now
    - originalEmailId: first email that led us to this report
```

**Total LLM Calls:** 2 batch calls (extract links from articles + summarize novel reports)
**Article Fetches:** Every Google Alert article + every novel original report

### Revised Workflow Sequence

```
1. USER: Clicks "Process New Alerts"
   ↓
2. HANDLER (prepareArticleBatch - async):
   Set isProcessing = true
   Get all emails from embedded GmailImporter

   FOR EACH email:
     a. Parse JSON from email.markdownContent
     b. Unwrap Google tracking URL → articleURL
     c. Normalize articleURL
     d. Check if articleURL in processedArticles
        - If yes: Skip (already read this article)
        - If no: Add to newArticles batch

   FOR EACH newArticle:
     Fetch article content (await WebFetch)
     Add to batch: {emailId, articleURL, articleContent}

   Set linkExtractionTrigger = JSON.stringify(batch) + timestamp
   ↓
3. LLM PHASE 1 (generateObject - reactive):
   Extract security report links from each article

   Input: [{emailId, articleURL, articleContent}, ...]

   Output: {
     articles: [{
       emailId,
       articleURL,
       securityReportLinks: ["url1", "url2", ...],  // Original report URLs
       classification: "has-links" | "is-original" | "no-links"
     }]
   }

   LLM identifies links within article that point to original security reports
   ↓
4. HANDLER (processLinkExtractionResults - async):
   novelReportURLs = []

   FOR EACH article result:
     FOR EACH securityReportLink:
       Normalize URL
       Check if normalized URL in existing reports.sourceURL
       IF new:
         Add to novelReportURLs

       Record ProcessedArticle {
         articleURL,
         emailId,
         originalReportURLs: securityReportLinks,
         processedDate: now
       }

   IF novelReportURLs not empty:
     FOR EACH novelURL:
       Fetch report content (await WebFetch)
       Add to extraction batch: {reportURL, reportContent}

     Set reportExtractionTrigger = JSON.stringify(batch) + timestamp
   ELSE:
     Set isProcessing = false (no new reports found)
   ↓
5. LLM PHASE 2 (generateObject - reactive):
   Summarize novel original reports

   Input: [{reportURL, reportContent}, ...]

   Output: {
     reports: [{
       sourceURL,
       title,
       summary,
       attackMechanism,
       affectedSystems,
       severity,
       ...
     }]
   }

   LLM reads original report and generates structured summary
   ↓
6. HANDLER (saveReports):
   FOR EACH extracted report:
     Add to reports array

   Set isProcessing = false
   Update lastProcessedDate
   ↓
7. UI: Show "Found X new security reports from Y articles (Z emails processed)"
```

**Key Characteristics:**
- ✅ Fetch EVERY Google Alert article (to find links within)
- ✅ Track processed article URLs (prevent re-reading same article)
- ✅ Extract security report links from articles with LLM
- ✅ Deduplicate on original report URLs (not article URLs)
- ✅ Only summarize novel original reports
- ✅ Map: article URL → [original report URLs it links to]

### Error Handling Strategy

- **Gmail Auth Failed**: Show error, prompt user to re-authenticate
- **Email Fetch Failed**: Retry once, then show error but don't block other emails
- **Web Fetch Failed**: Try next link in email, log the failure
- **LLM Call Failed**: Retry with exponential backoff (max 2 retries)
- **LLM Timeout**: After 60s, mark as "error" and move to next email
- **Link Following Depth**: Max 2 hops to find original report

### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Prompt Injection Alert Tracker                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Last processed: 2 hours ago (3:45 PM)                        │
│ Status: [Process New Alerts] button                          │
│                                                               │
│ 📊 Statistics:                                               │
│   • 3 new reports today                                      │
│   • 47 total reports tracked                                 │
│   • 156 emails processed                                     │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ Recent Reports (showing 10 most recent)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ [EXPAND] ChatGPT Prompt Injection via Image Metadata        │
│          2024-11-08 • High severity                          │
│          Affects: ChatGPT, GPT-4 Vision                      │
│          Summary: Attacker can embed malicious prompts...    │
│          [View Source] [Edit] [False Positive]               │
│                                                               │
│ [EXPAND] Claude Code Execution Bypass                        │
│          2024-11-07 • Critical severity                      │
│          Affects: Claude API, Claude.ai                      │
│          Summary: New technique allows arbitrary code...     │
│          [View Source] [Edit] [False Positive]               │
│                                                               │
│ ... (more reports)                                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Similar Patterns to Study

Before implementation, research these patterns for reference:

1. **`gmail-importer.tsx`** (or similar Gmail pattern)
   - How Gmail OAuth authentication works
   - How to fetch emails with specific queries
   - Email HTML parsing and content extraction
   - State management for processed messages

2. **`food-recipe.tsx`** / **`test-recipe-with-extraction.tsx`**
   - LLM-based extraction from unstructured content
   - Using `generateObject` for structured output
   - Handling "extract from notes" button pattern
   - Displaying extracted structured data

3. **`meta-analyzer.tsx`**
   - Analyzing multiple items (person profiles → reports)
   - Button to trigger analysis with pending state
   - LLM-based pattern detection across items
   - Showing "no results" vs "results found"

4. **`person.tsx`**
   - Complex state management with multiple fields
   - Editable structured data
   - Notes field for unstructured content
   - Expandable/collapsible sections

5. **Web fetching patterns** (if any exist)
   - How to fetch external URLs
   - Parsing HTML content
   - Handling redirects
   - Error handling for failed fetches

---

## Incremental Development Plan (TODOs)

### Phase 0: Research & Setup ✅ COMPLETE
- [x] **Research existing patterns** (30min)
  - ✅ Studied gmail-importer, gmail-auth, gmail-charm-creator
  - ✅ Studied test-recipe-with-extraction for LLM patterns
  - ✅ Studied meta-analyzer for multi-item analysis
  - ✅ Documented learnings in LEARNINGS-pattern-integration.md
  - ✅ COMMIT: "Add pattern integration learnings..."

- [x] **Fetch example Google Alert emails** (15min)
  - ✅ Created space `claude-prompt-injection-1`
  - ✅ Deployed gmail-charm-creator
  - ✅ Authenticated and fetched 42 emails
  - ✅ Examined email structure (JSON + markdown format)
  - ✅ Identified threading (up to 65 emails per thread)
  - ✅ Documented findings in RESEARCH-google-alert-structure.md
  - ✅ COMMIT: "Add comprehensive research findings..."

### Phase 1: Basic Pattern with Embedded Gmail
- [ ] **Create pattern scaffold with Gmail integration** (30min)
  - Create `prompt-injection-tracker.tsx` in WIP folder
  - Import GmailAuth and GmailImporter
  - Define TypeScript interfaces (PromptInjectionReport, etc.)
  - Create basic recipe structure
  - Embed GmailAuth instance
  - Embed GmailImporter with hard-coded query
  - Add placeholder UI showing importer
  - Test that it compiles and deploys
  - Test Gmail auth and email fetching works
  - COMMIT: "Create tracker scaffold with embedded Gmail"

- [ ] **Add state management and article URL tracking** (25min)
  - Add `processedArticles: Cell<ProcessedArticle[]>` to track analyzed articles
  - Add `reports: Cell<PromptInjectionReport[]>` for unique security reports
  - Add `isProcessing: Cell<boolean>` for processing state
  - Add `lastProcessedDate: Cell<string>`
  - Derive unprocessedEmails by checking article URLs against processedArticles
  - Display counts in UI: total emails, new articles to process, total reports tracked
  - Add "Process New Alerts" button (placeholder, doesn't work yet)
  - COMMIT: "Add state management and article URL tracking"

### Phase 2: Email Parsing & Article Fetching
- [ ] **Implement JSON parsing and URL extraction** (25min)
  - Create function to parse JSON from email.markdownContent
  - Extract article data: title, description, Google tracking URL
  - Implement Google URL unwrapping (extract `url=` param, decode)
  - Implement URL normalization (remove tracking params, lowercase, etc.)
  - Test with concrete examples from RESEARCH doc
  - Display parsed data in UI for debugging
  - COMMIT: "Add JSON parsing and URL extraction"

- [ ] **Implement article URL deduplication** (20min)
  - For each email: extract and normalize article URL
  - Check if normalized URL exists in processedArticles array
  - Build list of new article URLs to fetch
  - Display: "X new articles to process (Y already seen)"
  - COMMIT: "Add article URL deduplication"

- [ ] **Fetch Google Alert article content** (30min)
  - Handler fetches content for each new article URL (async in handler)
  - Use WebFetch to retrieve article HTML/text
  - Handle errors (404, timeout, etc.) gracefully
  - Build batch: [{emailId, articleURL, articleContent}, ...]
  - Store fetched articles in temp state for display
  - COMMIT: "Add Google Alert article fetching"

### Phase 3: Extract Security Report Links (LLM Phase 1)
- [ ] **Implement link extraction with generateObject** (45min)
  - Create linkExtraction trigger cell
  - Handler sets trigger with fetched articles batch + timestamp
  - Use generateObject with schema for link extraction
  - Schema: {articles: [{emailId, articleURL, securityReportLinks[], classification}]}
  - LLM prompt: "Extract URLs from article that point to ORIGINAL security reports"
  - LLM identifies Tenable blog, GitHub advisories, CVE pages, etc.
  - Display extracted links in UI for debugging
  - Test with real article content
  - COMMIT: "Add LLM security link extraction"

- [ ] **Add pending state and UI indicators** (15min)
  - Show "Analyzing X articles..." when pending
  - Disable "Process" button while extracting
  - Display extracted links after completion
  - COMMIT: "Add link extraction progress UI"

### Phase 4: Original Report URL Deduplication
- [ ] **Implement report URL deduplication** (30min)
  - Handler processes link extraction results
  - For each article: get securityReportLinks array
  - For each link: normalize URL
  - Check if normalized URL in existing reports.sourceURL
  - Build list of novel report URLs (not yet seen)
  - Save ProcessedArticle record for each analyzed article
  - Display: "Found X original reports, Y are new, Z are known"
  - COMMIT: "Add original report URL deduplication"

### Phase 5: Fetch & Summarize Novel Reports (LLM Phase 2)
- [ ] **Fetch original security report content** (30min)
  - Handler fetches content for each novel report URL (async)
  - Use WebFetch to retrieve report HTML/text
  - Handle errors (404, timeout, etc.)
  - Build batch: [{reportURL, reportContent}, ...]
  - Store fetched reports in temp state
  - COMMIT: "Add original report content fetching"

- [ ] **Implement report summarization with generateObject** (45min)
  - Create reportExtraction trigger cell
  - Handler sets trigger with fetched reports + timestamp
  - Use generateObject with schema for report extraction
  - Schema: {reports: [{sourceURL, title, summary, attackMechanism, affectedSystems, severity, ...}]}
  - LLM extracts structured vulnerability data from original report
  - Display extracted reports in UI
  - Test with real security reports
  - COMMIT: "Add LLM report summarization"

### Phase 6: Save Reports & Complete Pipeline
- [ ] **Implement report saving** (30min)
  - Handler waits for report extraction to complete
  - For each extracted report:
    * Add to reports array with normalized sourceURL
    * Set addedDate to current timestamp
  - Update lastProcessedDate
  - Set isProcessing = false
  - COMMIT: "Add report saving and pipeline completion"

- [ ] **End-to-end testing** (45min)
  - Test full flow with real unprocessed emails
  - Verify classifications are accurate
  - Verify URL deduplication works
  - Verify reports are saved correctly
  - Test with emails we know are duplicates
  - COMMIT: "Complete end-to-end pipeline testing"

### Phase 7: UI Polish & Report Management
- [ ] **Build reports list UI** (45min)
  - Display all reports sorted by date (newest first)
  - Show key fields: title, date, affected systems, severity
  - Make title clickable to source URL
  - Add collapsible summary/details
  - COMMIT: "Add reports list display UI"

- [ ] **Add report management actions** (30min)
  - "Mark as False Positive" button (removes from list)
  - "Edit" button (make fields editable)
  - "Add Note" button (append to userNotes field)
  - Save edits back to reports array
  - COMMIT: "Add report management actions"

### Phase 8: Refinement & Polish
- [ ] **Add error handling** (30min)
  - Handle JSON parse failures gracefully
  - Handle web fetch timeouts/404s
  - Show error messages in UI
  - Don't let one bad email block others
  - COMMIT: "Add error handling and resilience"

- [ ] **Add processing statistics** (20min)
  - Track: emails processed, reposts found, duplicates found, new reports added
  - Display in UI after processing completes
  - "Processed 15 emails: 2 new reports, 8 reposts, 5 duplicates"
  - COMMIT: "Add processing statistics"

- [ ] **Real-world testing** (60min)
  - Process 30+ real emails from multiple days
  - Verify accuracy of classifications
  - Verify no duplicate reports slip through
  - Test with known duplicates
  - Manually verify a few "new" reports are actually new
  - Document any issues
  - COMMIT: "Complete real-world testing"

- [ ] **Add import/export for reports** (30min)
  - Add "Export Reports" button that generates JSON/CSV download
  - Add "Import Reports" button with file upload
  - Import should merge with existing reports (dedupe by sourceURL)
  - Export format: JSON array of reports with all fields
  - This allows persistence across server resets in dev mode
  - COMMIT: "Add report import/export functionality"

### Phase 9: Documentation & Cleanup
- [ ] **Write pattern documentation** (20min)
  - Add comments explaining key functions
  - Document the analysis pipeline stages
  - Add usage instructions at top of file
  - Note limitations and edge cases
  - COMMIT: "Add pattern documentation"

- [ ] **Final testing and refinement** (30min)
  - Use pattern for 2-3 days with real workflow
  - Collect feedback and pain points
  - Make any necessary adjustments
  - FINAL COMMIT: "Complete prompt-injection-tracker v1"

---

## Estimated Time Investment

- **Phase 0 (Research)**: ✅ 1 hour (COMPLETE)
- **Phase 1 (Scaffold + Gmail)**: 55 minutes
- **Phase 2 (Parsing & Article Fetching)**: 75 minutes
- **Phase 3 (LLM Link Extraction)**: 60 minutes
- **Phase 4 (Report URL Deduplication)**: 30 minutes
- **Phase 5 (Fetch & Summarize Reports)**: 75 minutes
- **Phase 6 (Save & Complete)**: 75 minutes
- **Phase 7 (Reports UI)**: 105 minutes
- **Phase 8 (Testing & Polish)**: 110 minutes
- **Phase 9 (Documentation)**: 50 minutes

**Total**: ~7 hours of focused development time
**Realistic**: 9-11 hours spread over 2-3 days with testing and iteration

**Architecture Benefits:**
- Batch LLM processing (2 calls total, not per-email)
- Embedded Gmail (self-contained, easier to deploy)
- Dual deduplication (article URLs + report URLs)
- Tracks lineage (article → original reports it links to)

---

## Open Questions & Risks

### Questions to Answer During Research
1. How does Gmail authentication work in patterns? Is there a reusable charm?
2. What web fetching capabilities exist? Can we use external APIs?
3. How expensive will this be in terms of LLM calls per email?
4. Can we parallelize email processing or must it be sequential?
5. What's the best way to handle link redirects and shorteners?

### Known Risks
1. **LLM Accuracy**: May not correctly identify reposts vs original reports
   - Mitigation: Start with high-precision prompts, iterate based on false positives

2. **Processing Time**: Could take 2-5 minutes for 15 emails
   - Mitigation: Show clear progress, allow background processing

3. **Cost**: Multiple LLM calls per email (2 stages × multiple links × many emails)
   - Mitigation: Optimize prompts, only call Stage 4 for novel reports, limit to reasonable batch size

4. **Web Fetching**: Sites may block scraping or require JavaScript
   - Mitigation: Graceful degradation, work with what we can fetch

5. **URL Normalization**: Different URLs might point to same report (mirrors, archives)
   - Mitigation: Start with basic normalization, add more sophisticated matching if needed

---

## Future Enhancements (Post-v1)

- **Enhanced Progress Tracking**: Add better visibility into long-running LLM operations
  - Show elapsed time for current operation ("LLM running for 2m 15s...")
  - Add timeout warnings ("This is taking longer than expected...")
  - Show which specific step is running ("Analyzing report 1/3...")
  - Add cancel button to abort stuck operations
  - Consider showing a progress bar or spinner animation
  - Log timestamps for each pipeline stage for debugging
  - Add "Last activity" timestamp to detect stuck states
- **Verify Caching & Deduplication**: Audit that URL tracking is working correctly
  - Verify processedArticles prevents re-fetching same article URLs
  - Verify reports array prevents re-tracking same report URLs
  - Test with duplicate emails to ensure we don't re-process
  - Consider adding metrics: "X articles skipped (already processed)"
  - Add logging to show deduplication in action
  - Consider caching web-read results to avoid re-fetching same URLs
- **Article Backlinks**: For each tracked report URL, show all alert articles that mentioned it
  - Display as expandable section under each report
  - List article titles, dates, and URLs
  - Allow clicking through to review how different sources covered it
  - Helps understand the reach/impact of a disclosure
  - Useful for seeing multiple perspectives on same vulnerability
- **Automated Scheduling**: Run periodically without manual trigger
- **Notifications**: Alert user when new reports are found
- **Export**: Generate markdown reports, export to GitHub Issues
- **Search & Filter**: Search reports by keyword, filter by severity/affected system
- **Analytics**: Track trends over time (# new attacks per week, most affected systems)
- **Multi-source**: Support other alert sources beyond Google Alerts
- **Collaborative**: Share tracked reports with team
- **Threat Intelligence**: Cross-reference with CVE database, security advisories
