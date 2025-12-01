/// <cts-enable />
/**
 * PROMPT INJECTION TRACKER V3
 *
 * Extracts URLs from security newsletters using Gmail integration + LLM extraction.
 *
 * =============================================================================
 * KEY INSIGHT: MULTI-LEVEL FRAMEWORK CACHING
 * =============================================================================
 *
 * This pattern demonstrates how to leverage Common Tools' automatic caching
 * at MULTIPLE levels. The framework caches results for ANY reactive primitive
 * based on its inputs - not just generateObject, but also fetchData!
 *
 * THE "DUMB MAP APPROACH" - Works for ALL reactive primitives:
 * ------------------------------------------------------------
 * ```typescript
 * // Level 1: LLM extraction (cached by prompt content)
 * const extractions = articles.map((article) => ({
 *   extraction: generateObject({ prompt: article.content, ... }),
 * }));
 *
 * // Level 2: Web fetching (cached by URL + options)
 * const webContent = links.map((url) => ({
 *   content: fetchData({
 *     url: "/api/agent-tools/web-read",
 *     mode: "json",
 *     options: { method: "POST", body: { url } },
 *   }),
 * }));
 *
 * // Level 3: LLM summarization (cached by fetched content)
 * const summaries = webContent.map((item) => ({
 *   summary: generateObject({ prompt: item.content.result, ... }),
 * }));
 * ```
 *
 * HOW FRAMEWORK CACHING WORKS:
 * ----------------------------
 * 1. Each reactive primitive (generateObject, fetchData, etc.) is cached by inputs
 * 2. Same inputs = same cached result, no re-execution
 * 3. When inputs change, only affected items are recomputed
 * 4. Works across page refreshes and sessions (persisted cache)
 * 5. Multiple levels of caching compose automatically
 *
 * REACTIVE PRIMITIVES THAT CACHE:
 * -------------------------------
 * - generateObject({ prompt, schema, ... }) - Cached by prompt + schema + model
 * - generateText({ prompt, ... }) - Cached by prompt + model
 * - fetchData({ url, options }) - Cached by URL + method + body + headers
 *
 * WHAT NOT TO DO:
 * ---------------
 * ❌ Don't build custom caching layers (webPageCache, processedArticles, etc.)
 * ❌ Don't cast to OpaqueRef<> in map callbacks (causes type issues)
 * ❌ Don't use complex state machines for "processing" states
 * ❌ Don't try to batch/queue calls manually
 * ❌ Don't use imperative fetch() in handlers for cacheable data
 *
 * INSTEAD:
 * --------
 * ✅ Use fetchData() for web requests - framework caches automatically
 * ✅ Use generateObject() for LLM - framework caches automatically
 * ✅ Chain multiple levels with map() - each level caches independently
 * ✅ Trust the framework to handle caching, deduplication, and persistence
 *
 * =============================================================================
 * ARCHITECTURE: FIVE-LEVEL CACHING PIPELINE WITH DEDUPLICATION
 * =============================================================================
 *
 * Level 1: Article → Link Extraction (generateObject, cached by article content)
 *   - Gmail emails converted to articles
 *   - LLM extracts security-related URLs from newsletters
 *   - Classification: has-security-links, is-original-report, no-security-links
 *
 * Level 2: URL → Web Content (fetchData, cached by URL)
 *   - Fetch actual page content via /api/agent-tools/web-read
 *   - Framework caches by URL - same URL never fetched twice
 *   - Returns markdown content for LLM analysis
 *
 * Level 3: Web Content → Classification (generateObject, cached by content)
 *   - Classify: Is this an ORIGINAL report or a NEWS ARTICLE about one?
 *   - If news article: extract the URL to the original report it references
 *   - If original: this URL IS the canonical source
 *
 * DEDUPLICATION (pure derive, instant):
 *   - Collect all original report URLs (either source URL or extracted URL)
 *   - Normalize and deduplicate by URL
 *   - Multiple news articles → same original = only processed once
 *
 * Level 4: Original URL → Fetch Original (fetchData, cached by URL)
 *   - Fetch the actual original reports
 *   - Skip fetch if already fetched in L2 (direct originals)
 *   - Framework caching means same original never fetched twice
 *
 * Level 5: Original Content → Report Summary (generateObject, cached by content)
 *   - LLM analyzes original report content
 *   - Extracts: title, summary, severity, isLLMSpecific, canonicalId
 *   - Framework caches by content - same content never analyzed twice
 *
 * WORKAROUNDS:
 * ------------
 * - CT-1085: wish() favoriting is broken, so authCharm is exposed as a
 *   top-level input and linked via `ct charm link`
 */
import {
  Cell,
  cell,
  Default,
  derive,
  fetchData,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";
import GmailImporter from "./gmail-importer.tsx";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Normalize URL for deduplication
 * - Remove tracking parameters (utm_*, fbclid, gclid, etc.)
 * - Remove URL fragments (#section)
 * - Remove trailing slashes
 * - Convert to lowercase
 */
function normalizeURL(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove common tracking parameters
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "fbclid", "gclid", "msclkid", "ref", "source", "_ga", "mc_cid", "mc_eid"
    ];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    // Remove fragment
    parsed.hash = "";

    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, "");

    // Convert to lowercase
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Check if a URL is valid (not null, undefined, empty, or literal "null" string)
 *
 * WORKAROUND: The LLM (via generateObject) sometimes returns the literal string
 * "null" instead of actual null/undefined when a field should be empty. This
 * appears to be an issue in how the schema description is interpreted or how
 * the response is parsed. The schema says "Null if isOriginalReport=true" but
 * the LLM returns "null" as a string value. This helper papers over that issue.
 */
function isValidUrl(url: unknown): url is string {
  return typeof url === "string" && url.length > 0 && url.toLowerCase() !== "null";
}

// =============================================================================
// TYPES
// =============================================================================

interface Article {
  id: string;
  title: string;
  source: string;
  content: string;
}

interface ExtractedLinks {
  urls: string[];
  classification: "has-security-links" | "is-original-report" | "no-security-links";
}

interface PromptInjectionReport {
  id: string;
  title: string;
  sourceURL: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  isLLMSpecific: boolean;
  discoveryDate: string;
  addedDate: string;
}

// =============================================================================
// SCHEMAS
// =============================================================================

// Schema for extracting security report links with classification
const LINK_EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    urls: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Security-related URLs found (CVEs, advisories, security blogs, GitHub security issues)",
    },
    classification: {
      type: "string" as const,
      enum: ["has-security-links", "is-original-report", "no-security-links"] as const,
      description: "Classification of this content",
    },
  },
  required: ["urls", "classification"] as const,
};

// Schema for classifying fetched content and extracting original report URLs
const CONTENT_CLASSIFICATION_SCHEMA = {
  type: "object" as const,
  properties: {
    isOriginalReport: {
      type: "boolean" as const,
      description: "TRUE if this IS an original security report (CVE, vendor advisory, researcher disclosure). FALSE if it's a news article/blog ABOUT a security issue.",
    },
    originalReportUrl: {
      type: "string" as const,
      description: "If isOriginalReport=false, the URL to the original report this article discusses. Null if isOriginalReport=true or no clear original found.",
    },
    confidence: {
      type: "string" as const,
      enum: ["high", "medium", "low"] as const,
      description: "Confidence in the classification",
    },
    briefDescription: {
      type: "string" as const,
      description: "One-line description of what this content is about",
    },
  },
  required: ["isOriginalReport", "confidence", "briefDescription"] as const,
};

// Schema for final report summarization (used on original reports)
const REPORT_SUMMARY_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Clear name for the vulnerability/attack" },
    summary: { type: "string" as const, description: "2-3 sentence overview" },
    severity: {
      type: "string" as const,
      enum: ["low", "medium", "high", "critical"] as const,
    },
    isLLMSpecific: {
      type: "boolean" as const,
      description: "TRUE if this is specifically about LLM/AI security (prompt injection, jailbreaking, etc.)",
    },
    discoveryDate: { type: "string" as const, description: "When reported (YYYY-MM or YYYY-MM-DD)" },
    canonicalId: {
      type: "string" as const,
      description: "Canonical identifier: CVE-XXXX-XXXXX if available, or a descriptive slug like 'log4shell-rce'",
    },
  },
  required: ["title", "summary", "severity", "isLLMSpecific", "discoveryDate", "canonicalId"] as const,
};

// LLM prompt for classifying content and extracting original report URLs
const CONTENT_CLASSIFICATION_SYSTEM = `Classify this security content:

ORIGINAL REPORT (isOriginalReport: true):
- CVE details pages (nvd.nist.gov, cve.org)
- Vendor security advisories (Microsoft MSRC, Apache advisories, etc.)
- Security researcher disclosures (first-person: "We discovered...", "I found...")
- GitHub security advisories
- CISA/government advisories

NEWS/BLOG ARTICLE (isOriginalReport: false):
- News coverage of a security issue
- Blog posts summarizing/discussing someone else's research
- Aggregator content linking to original sources
- Third-party analysis of a vulnerability

If this is a NEWS/BLOG article, look for URLs pointing to the ORIGINAL report:
- Links to CVE pages, vendor advisories, researcher blogs
- "Read more", "Original report", "Advisory" links
- Extract the most authoritative source URL

Return null for originalReportUrl if:
- This IS an original report (isOriginalReport: true)
- No clear original source is linked`;

// LLM prompt for security link extraction
const LINK_EXTRACTION_SYSTEM = `You are analyzing content to extract SECURITY-RELATED URLs only.

Extract URLs that point to:
- CVE details (nvd.nist.gov, cve.org)
- Security advisories (company security blogs, CISA, vendor advisories)
- Security research (GitHub security advisories, researcher blogs)
- Vulnerability disclosures

Classification rules:
1. "is-original-report": The content IS original security research (first-person: "We discovered...")
2. "has-security-links": Contains links to security reports/advisories
3. "no-security-links": No security-relevant URLs, just marketing or general content

IGNORE: social media, news homepages, marketing pages, product demos.
Return ONLY security-relevant URLs.`;

// LLM prompt for report summarization
const REPORT_SUMMARY_SYSTEM = `Summarize this security report. Determine if it's LLM-specific:

LLM-SPECIFIC (isLLMSpecific: true):
- Prompt injection attacks
- Jailbreaking/safety bypass
- LLM memory hijacking
- Agent system exploits

NOT LLM-SPECIFIC (isLLMSpecific: false):
- General malware mentioning AI
- Traditional web vulnerabilities
- Business issues with AI companies

Be concise. Focus on the vulnerability, not the article structure.`;

// =============================================================================
// TEST DATA - Simulated security newsletter articles
// =============================================================================

const TEST_ARTICLES: Article[] = [
  {
    id: "article-1",
    title: "Log4j Vulnerability Advisory",
    source: "Security Weekly Newsletter",
    content: `
CRITICAL: Apache Log4j Remote Code Execution Vulnerability (Log4Shell)

A critical remote code execution vulnerability has been discovered in the widely-used
Apache Log4j logging library. This is one of the most severe vulnerabilities in years.

Official CVE: https://nvd.nist.gov/vuln/detail/CVE-2021-44228
Apache advisory: https://logging.apache.org/log4j/2.x/security.html
CISA guidance: https://www.cisa.gov/news-events/news/apache-log4j-vulnerability-guidance

Affected versions: 2.0-beta9 through 2.14.1
Patch available: Yes, upgrade to 2.17.0 or later
    `.trim(),
  },
  {
    id: "article-2",
    title: "OWASP LLM Security Risks",
    source: "AI Security Digest",
    content: `
The OWASP Foundation has published their Top 10 security risks for Large Language Models.
Key risks include prompt injection, data leakage, and insecure output handling.

Full OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
GitHub repository: https://github.com/OWASP/www-project-top-10-for-large-language-model-applications

This is essential reading for anyone building LLM-powered applications.
    `.trim(),
  },
  {
    id: "article-3",
    title: "Weekly Security Roundup",
    source: "InfoSec News",
    content: `
This week in security:

1. Microsoft Security Response Center updates
   - Monthly security updates and advisories
   - Details: https://msrc.microsoft.com/update-guide/

2. Chrome security updates
   - Regular browser security patches
   - Release notes: https://chromereleases.googleblog.com/

3. GitHub Security Advisories Database
   - Comprehensive vulnerability database
   - Browse: https://github.com/advisories

Stay safe out there!
    `.trim(),
  },
  {
    id: "article-4",
    title: "Heartbleed Retrospective",
    source: "Security History",
    content: `
Looking back at one of the most impactful vulnerabilities in internet history:
the Heartbleed bug in OpenSSL.

Official Heartbleed site: https://heartbleed.com/
CVE details: https://nvd.nist.gov/vuln/detail/CVE-2014-0160
OpenSSL advisory: https://www.openssl.org/news/secadv/20140407.txt

This vulnerability affected millions of servers worldwide and led to major
improvements in how we handle security disclosures.
    `.trim(),
  },
  {
    id: "article-5",
    title: "Product Launch Announcement",
    source: "Marketing Email",
    content: `
Introducing our new cloud security platform! With AI-powered threat detection
and automated incident response, you'll never miss a security event.

Features:
- Real-time monitoring
- Automated remediation
- Compliance reporting

Schedule a demo at https://product.example.com/demo

No security vulnerabilities mentioned in this marketing email - just product info.
    `.trim(),
  },
];

// =============================================================================
// HANDLERS
// =============================================================================

// Handler to load test articles (like addItem in map-test-100-items)
const loadTestArticles = handler<unknown, { articles: Cell<Article[]> }>(
  (_event, { articles }) => {
    // Clear and load test articles
    for (const article of TEST_ARTICLES) {
      articles.push(article);
    }
  }
);

// Extra test article for incremental caching tests
const EXTRA_TEST_ARTICLE: Article = {
  id: "article-6",
  title: "Spectre and Meltdown Update",
  source: "CPU Security Newsletter",
  content: `
Update on CPU-level vulnerabilities affecting modern processors.

Recent patches and mitigations for Spectre and Meltdown variants:

Official Intel Advisory: https://www.intel.com/content/www/us/en/security-center/advisory/intel-sa-00088.html
MITRE CVE Entry: https://nvd.nist.gov/vuln/detail/CVE-2017-5754
AMD Security Bulletin: https://www.amd.com/en/corporate/product-security

These hardware-level vulnerabilities require both firmware and OS-level patches.
  `.trim(),
};

// Handler to add a single extra article (for incremental caching tests)
const addSingleArticle = handler<unknown, { articles: Cell<Article[]> }>(
  (_event, { articles }) => {
    articles.push(EXTRA_TEST_ARTICLE);
  }
);

// Handler to toggle read/unread state for a report URL
const toggleRead = handler<
  unknown,
  { readUrls: Cell<string[]>; url: string }
>((_event, { readUrls, url }) => {
  const current = readUrls.get();
  const normalizedUrl = normalizeURL(url);
  const index = current.indexOf(normalizedUrl);
  if (index >= 0) {
    // Remove from array (mark as unread)
    readUrls.set(current.filter((u) => u !== normalizedUrl));
  } else {
    // Add to array (mark as read)
    readUrls.set([...current, normalizedUrl]);
  }
});

// =============================================================================
// PATTERN
// =============================================================================

interface TrackerInput {
  // Gmail filter query - default to Google Alerts for "prompt injection"
  gmailFilterQuery: Default<string, 'from:"googlealerts-noreply@google.com" subject:"prompt injection"'>;
  // Max emails to fetch
  limit: Default<number, 50>;
  // Manual articles (for testing without Gmail)
  articles: Default<Article[], []>;
  // WORKAROUND (CT-1085): Accept auth charm as direct input since wish doesn't work reliably.
  // Link gmail-auth charm using: deno task ct charm link GMAIL_AUTH_ID TRACKER_ID/authCharm --space YOUR_SPACE
  authCharm: Default<any, null>;
}

interface TrackerOutput {
  articles: Article[];
  extractedLinks: string[];
}

const PromptInjectionTracker = pattern<TrackerInput, TrackerOutput>(({ gmailFilterQuery, limit, articles, authCharm }) => {
  // ==========================================================================
  // DEBUG: Pipeline Instrumentation (for caching investigation)
  // Remove this section once caching issues are resolved
  // ==========================================================================
  const DEBUG_LOGGING = false; // Set to false to disable logging

  const debugLog = (stage: string, data: any) => {
    if (DEBUG_LOGGING) {
      console.log(`[PIPELINE:${stage}]`, JSON.stringify(data, null, 2));
    }
  };

  const debugCellStructure = (name: string, cell: any) => {
    if (!DEBUG_LOGGING) return;
    const structure = {
      hasPending: "pending" in cell,
      hasResult: "result" in cell,
      hasError: "error" in cell,
      pendingValue: cell?.pending,
      resultType: cell?.result === undefined ? "undefined" : cell?.result === null ? "null" : typeof cell?.result,
      errorValue: cell?.error,
      keys: cell ? Object.keys(cell) : [],
    };
    console.log(`[CELL:${name}]`, JSON.stringify(structure, null, 2));
  };

  // ==========================================================================
  // Gmail Integration
  // ==========================================================================
  // WORKAROUND (CT-1085): Pass authCharm from input since wish("#googleAuth") doesn't work
  // reliably. Link auth using: deno task ct charm link GMAIL_AUTH_ID TRACKER_ID/authCharm --space YOUR_SPACE
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery,
      limit,
      historyId: "",
      debugMode: DEBUG_LOGGING, // Use same flag as pattern debug logging
    },
    authCharm, // Pass through from input (link via ct charm link)
  });

  // Count for display (emails counted directly from importer)
  const emailCount = derive(importer.emails, (list: any[]) => list.length);
  const manualCount = derive(articles, (list) => list.length);
  const articleCount = derive(
    { emails: importer.emails, manual: articles },
    ({ emails, manual }) => emails.length + manual.length
  );

  // ==========================================================================
  // Reports storage and read state
  // ==========================================================================
  const reports = cell<PromptInjectionReport[]>([]);
  const readUrls = cell<string[]>([]); // Track which report URLs have been read (normalized)

  // ==========================================================================
  // LEVEL 1: Extract security links from articles (the "dumb map approach")
  // CRITICAL: Must map over reactive cell arrays, NOT derive results!
  // - `articles` is an input cell - can map over it
  // - `importer.emails` is a cell output from GmailImporter - can map over it
  // ==========================================================================

  // Process manual articles (maps over input cell - reactive!)
  const manualArticleExtractions = articles.map((article) => ({
    articleId: article.id,
    articleTitle: article.title,
    articleSource: article.source,
    extraction: generateObject<ExtractedLinks>({
      system: LINK_EXTRACTION_SYSTEM,
      prompt: article.content,
      model: "anthropic:claude-sonnet-4-5",
      schema: LINK_EXTRACTION_SCHEMA,
    }),
  }));

  // Process email articles (maps over GmailImporter output cell - reactive!)
  const emailArticleExtractions = importer.emails.map((email: any) => ({
    articleId: email.id,
    articleTitle: email.subject || "No Subject",
    articleSource: email.from || "Unknown",
    extraction: generateObject<ExtractedLinks>({
      system: LINK_EXTRACTION_SYSTEM,
      prompt: email.markdownContent || email.snippet || "",
      model: "anthropic:claude-sonnet-4-5",
      schema: LINK_EXTRACTION_SCHEMA,
    }),
  }));

  // Combine extractions from both sources for aggregation (derive is fine for read-only)
  // Note: Added defensive array checks for when email/manual might not be arrays during hydration
  const articleExtractions = derive(
    { manual: manualArticleExtractions, email: emailArticleExtractions },
    ({ manual, email }) => [
      ...(Array.isArray(manual) ? manual : []),
      ...(Array.isArray(email) ? email : [])
    ]
  );

  // ==========================================================================
  // Progress tracking
  // ==========================================================================
  // DEBUG: Log L1 cell structure
  const _debugL1CellStructure = derive(articleExtractions, (list) => {
    if (!DEBUG_LOGGING) return null;
    const sample = list.slice(0, 3).filter((item: any) => item).map((item: any, idx: number) => {
      const ext = item.extraction;
      return {
        idx,
        articleId: item.articleId,
        extraction: ext ? {
          hasPendingProp: "pending" in ext,
          hasResultProp: "result" in ext,
          hasErrorProp: "error" in ext,
          pendingValue: ext.pending,
          resultType: ext.result === undefined ? "undefined" : ext.result === null ? "null" : typeof ext.result,
          hasUrls: !!ext.result?.urls,
          urlCount: ext.result?.urls?.length || 0,
          allKeys: Object.keys(ext),
        } : "null/undefined",
      };
    });
    console.log("[DEBUG:L1-CELL-STRUCTURE]", JSON.stringify({ totalItems: list.length, sample }, null, 2));
    return sample;
  });

  const pendingCount = derive(articleExtractions, (list) =>
    list.filter((e: any) => e && e.extraction?.pending).length
  );

  // Completed = not pending (matches what the UI checkmarks show)
  // NOTE: L1 uses !pending (like L3), not !pending && result (like L2)
  const completedCount = derive(articleExtractions, (list) =>
    list.filter((e: any) => e && !e.extraction?.pending).length
  );

  // Collect all extracted links for counting (derive is fine for read-only aggregation)
  const allExtractedLinks = derive(articleExtractions, (list) => {
    const links: string[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!item) continue; // Skip undefined items during hydration
      const result = item.extraction?.result;
      if (result && result.urls) {
        for (const url of result.urls) {
          const normalized = normalizeURL(url);
          if (!seen.has(normalized)) {
            seen.add(normalized);
            links.push(url);
          }
        }
      }
    }
    return links;
  });

  const linkCount = derive(allExtractedLinks, (links) => links.length);
  const reportCount = derive(reports, (list: PromptInjectionReport[]) => list.length);

  // Count by classification
  const classificationCounts = derive(articleExtractions, (list) => {
    const counts: Record<string, number> = { "has-security-links": 0, "is-original-report": 0, "no-security-links": 0 };
    for (const item of list) {
      if (!item) continue; // Skip undefined items during hydration
      const classification = item.extraction?.result?.classification as string | undefined;
      if (classification && counts[classification] !== undefined) {
        counts[classification]++;
      }
    }
    return counts;
  });

  // ==========================================================================
  // LEVELS 2-5: Process URLs from each article through the pipeline
  // CRITICAL: Must map over cell arrays, not derive results!
  // We use FIXED SLOTS (3 URLs per article) per superstition:
  // "2025-11-29-map-only-over-cell-arrays-fixed-slots.md"
  // ==========================================================================

  const MAX_URLS_PER_ARTICLE = 3;

  // Helper: Process a single URL slot through L2→L3→L4→L5
  // Returns null for all fields if url is null
  const processUrlSlot = (url: any) => {
    // L2: Fetch web content
    const webContentBody = derive(url, (u: any) => ({ url: u, max_tokens: 4000, include_code: false }));
    const webContent = ifElse(
      url,
      fetchData<{ content: string; title?: string }>({
        url: "/api/agent-tools/web-read",
        mode: "json",
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: webContentBody,
        },
      }),
      null
    );

    // L3: Classify content
    const classificationPrompt = derive(
      { url, content: webContent },
      ({ url, content }: any) => {
        const pageContent = content?.result?.content;
        if (pageContent) {
          return `URL: ${url}\n\nPage Content:\n${pageContent.slice(0, 8000)}\n\nClassify this content and extract original report URL if applicable.`;
        }
        return `URL: ${url}\n\nClassify based on URL pattern only.`;
      }
    );
    const classification = ifElse(
      url,
      generateObject<{
        isOriginalReport: boolean;
        originalReportUrl: string | null;
        confidence: "high" | "medium" | "low";
        briefDescription: string;
      }>({
        system: CONTENT_CLASSIFICATION_SYSTEM,
        prompt: classificationPrompt,
        model: "anthropic:claude-sonnet-4-5",
        schema: CONTENT_CLASSIFICATION_SCHEMA,
      }),
      null
    );

    // L4: Fetch original report if this is a news article pointing to one
    const needsOriginalFetch = derive(classification, (c: any) =>
      c?.result && !c.result.isOriginalReport && isValidUrl(c.result.originalReportUrl)
    );
    const originalReportUrl = derive(classification, (c: any) => c?.result?.originalReportUrl);

    const originalContentBody = derive(originalReportUrl, (u: any) => ({ url: u, max_tokens: 4000, include_code: false }));
    const originalContent = ifElse(
      needsOriginalFetch,
      fetchData<{ content: string; title?: string }>({
        url: "/api/agent-tools/web-read",
        mode: "json",
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: originalContentBody,
        },
      }),
      null
    );

    // L5: Summarize the final report content
    const isOriginal = derive(classification, (c: any) => c?.result?.isOriginalReport);
    const reportContent = ifElse(
      isOriginal,
      webContent,
      originalContent
    );

    const summaryPrompt = derive(
      { url, originalReportUrl, content: reportContent, isOriginal },
      ({ url, originalReportUrl, content, isOriginal }: any) => {
        const targetUrl = isOriginal ? url : (originalReportUrl || url);
        const pageContent = content?.result?.content;
        if (pageContent) {
          return `URL: ${targetUrl}\n\nPage Content:\n${pageContent.slice(0, 8000)}\n\nSummarize this security report.`;
        }
        return `URL: ${targetUrl}\n\nSummarize based on URL pattern.`;
      }
    );
    const summary = ifElse(
      url,
      generateObject<{
        title: string;
        summary: string;
        severity: "low" | "medium" | "high" | "critical";
        isLLMSpecific: boolean;
        discoveryDate: string;
        canonicalId: string;
      }>({
        system: REPORT_SUMMARY_SYSTEM,
        prompt: summaryPrompt,
        model: "anthropic:claude-sonnet-4-5",
        schema: REPORT_SUMMARY_SCHEMA,
      }),
      null
    );

    return {
      sourceUrl: url,
      webContent,
      classification,
      originalReportUrl,
      originalContent,
      isOriginal,
      summary,
    };
  };

  // Helper: Process an article's URLs through L2-L5 using fixed slots
  // This is applied via .map() to both manual and email extractions
  const processArticleUrls = (article: any) => {
    // Extract up to MAX_URLS_PER_ARTICLE URLs as fixed slots
    const url0 = derive(article.extraction, (ext: any) => ext?.result?.urls?.[0] || null);
    const url1 = derive(article.extraction, (ext: any) => ext?.result?.urls?.[1] || null);
    const url2 = derive(article.extraction, (ext: any) => ext?.result?.urls?.[2] || null);

    // Process each slot through the full pipeline
    const slot0 = processUrlSlot(url0);
    const slot1 = processUrlSlot(url1);
    const slot2 = processUrlSlot(url2);

    return {
      articleId: article.articleId,
      articleTitle: article.articleTitle,
      extraction: article.extraction,
      // Return all 3 slots
      slots: [slot0, slot1, slot2],
    };
  };

  // Process manual articles through L2-L5 (maps over cell - reactive!)
  // Now processes up to 3 URLs per article using fixed slots
  const manualUrlProcessing = manualArticleExtractions.map(processArticleUrls);

  // Process email articles through L2-L5 (maps over cell - reactive!)
  const emailUrlProcessing = emailArticleExtractions.map(processArticleUrls);

  // Combine for aggregation (derive is fine for read-only operations)
  // Note: Added defensive array checks for when email/manual might not be arrays during hydration
  const articleUrlProcessing = derive(
    { manual: manualUrlProcessing, email: emailUrlProcessing },
    ({ manual, email }) => [
      ...(Array.isArray(manual) ? manual : []),
      ...(Array.isArray(email) ? email : [])
    ]
  );

  // Flatten all URL slots from all articles into a single list for aggregation
  // Each article has up to 3 slots, each slot has the full L2-L5 pipeline results
  // Note: Added null checks for page refresh hydration safety
  const contentClassifications = derive(articleUrlProcessing, (articles) => {
    const results: any[] = [];
    for (const article of articles) {
      if (!article || !article.slots) continue;
      for (const slot of article.slots) {
        if (!slot || !slot.sourceUrl) continue;
        results.push({
          articleId: article.articleId,
          articleTitle: article.articleTitle,
          sourceUrl: slot.sourceUrl,
          webContent: slot.webContent,
          classification: slot.classification,
          originalUrl: slot.originalReportUrl,
          originalContent: slot.originalContent,
          isOriginal: slot.isOriginal,
          summary: slot.summary,
        });
      }
    }
    return results;
  });

  // Count total URL slots being processed (for L2/L3 metrics)
  // Now that we process up to 3 URLs per article, we count total slots with non-null URLs
  const urlSlotsCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.sourceUrl).length
  );

  // L2: Count web fetch progress (from contentClassifications - the flattened list)
  // DEBUG: Log cell structure for first 3 items to understand caching behavior
  const _debugL2CellStructure = derive(contentClassifications, (list) => {
    if (!DEBUG_LOGGING) return null;
    const sample = list.slice(0, 3).filter((item: any) => item).map((item: any, idx: number) => {
      const wc = item.webContent;
      return {
        idx,
        hasSourceUrl: !!item.sourceUrl,
        sourceUrl: item.sourceUrl?.slice?.(0, 50) || item.sourceUrl,
        webContent: wc ? {
          hasPendingProp: "pending" in wc,
          hasResultProp: "result" in wc,
          hasErrorProp: "error" in wc,
          pendingValue: wc.pending,
          resultIsNull: wc.result === null,
          resultIsUndefined: wc.result === undefined,
          resultType: wc.result === undefined ? "undefined" : wc.result === null ? "null" : typeof wc.result,
          hasResultContent: !!wc.result?.content,
          errorValue: wc.error,
          allKeys: Object.keys(wc),
        } : "null/undefined",
      };
    });
    console.log("[DEBUG:L2-CELL-STRUCTURE]", JSON.stringify({ totalItems: list.length, sample }, null, 2));
    return sample;
  });

  // L2 Counters: Fixed to properly detect success vs error
  // Now counts across all URL slots from all articles
  // Note: Added null checks for page refresh hydration safety
  const fetchPendingCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.sourceUrl && item.webContent?.pending).length
  );
  // Success = not pending AND has actual result content
  const fetchSuccessCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.sourceUrl && !item.webContent?.pending && item.webContent?.result).length
  );
  // Error = not pending AND no result (either .error is set OR .result is undefined)
  const fetchErrorCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.sourceUrl && !item.webContent?.pending && !item.webContent?.result).length
  );
  // Total done = success + error (for backward compatibility, kept as fetchCompletedCount)
  const fetchCompletedCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.sourceUrl && !item.webContent?.pending).length
  );

  // DEBUG: Log L2 counts
  const _debugL2Counts = derive(
    { pending: fetchPendingCount, success: fetchSuccessCount, error: fetchErrorCount, done: fetchCompletedCount },
    (counts) => {
      if (DEBUG_LOGGING) {
        console.log("[DEBUG:L2-COUNTS]", JSON.stringify(counts, null, 2));
      }
      return counts;
    }
  );

  // Count classification progress
  // DEBUG: Log L3 cell structure to compare with L2
  const _debugL3CellStructure = derive(contentClassifications, (list) => {
    if (!DEBUG_LOGGING) return null;
    const sample = list.slice(0, 3).filter((item: any) => item).map((item: any, idx: number) => {
      const cl = item.classification;
      return {
        idx,
        hasSourceUrl: !!item.sourceUrl,
        classification: cl ? {
          hasPendingProp: "pending" in cl,
          hasResultProp: "result" in cl,
          hasErrorProp: "error" in cl,
          pendingValue: cl.pending,
          resultIsNull: cl.result === null,
          resultIsUndefined: cl.result === undefined,
          resultType: cl.result === undefined ? "undefined" : cl.result === null ? "null" : typeof cl.result,
          hasIsOriginalReport: !!cl.result?.isOriginalReport !== undefined,
          allKeys: Object.keys(cl),
        } : "null/undefined",
      };
    });
    console.log("[DEBUG:L3-CELL-STRUCTURE]", JSON.stringify({ totalItems: list.length, sample }, null, 2));
    return sample;
  });

  const classifyPendingCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c && c.classification?.pending).length
  );
  const classifyCompletedCount = derive(contentClassifications, (list) => {
    const completed = list.filter((c: any) => c && !c.classification?.pending);
    // DEBUG: Log L3 completion check
    if (DEBUG_LOGGING && list.length > 0) {
      console.log("[DEBUG:L3-COMPLETED]", JSON.stringify({
        total: list.length,
        notPending: completed.length,
        // Note: L3 just checks !pending, not .result - this might be the difference!
      }, null, 2));
    }
    return completed.length;
  });

  // Count originals vs news articles
  const originalCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c && c.classification?.result?.isOriginalReport).length
  );
  const newsArticleCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c && c.classification?.result && !c.classification.result.isOriginalReport).length
  );

  // ==========================================================================
  // Collect deduplicated original report URLs
  // - If content IS an original report → use its source URL
  // - If content is news/blog → use the extracted originalReportUrl
  // Framework caching handles the rest - same URL = same cached fetch
  // ==========================================================================

  const originalReportUrls = derive(contentClassifications, (items) => {
    const seen = new Set<string>();
    const urls: Array<{ url: string; sourceUrl: string; isDirectOriginal: boolean }> = [];

    for (const item of items) {
      if (!item) continue; // Skip undefined items during hydration
      const result = item.classification?.result;
      if (!result) continue; // Still pending

      let targetUrl: string | null = null;
      let isDirectOriginal = false;

      if (result.isOriginalReport) {
        // This URL IS the original report
        targetUrl = item.sourceUrl;
        isDirectOriginal = true;
      } else if (isValidUrl(result.originalReportUrl)) {
        // This is a news article pointing to an original
        targetUrl = result.originalReportUrl;
        isDirectOriginal = false;
      }

      if (targetUrl) {
        const normalized = normalizeURL(targetUrl);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push({ url: targetUrl, sourceUrl: item.sourceUrl, isDirectOriginal });
        }
      }
    }
    return urls;
  });

  const uniqueOriginalCount = derive(originalReportUrls, (urls) => urls.length);

  // ==========================================================================
  // L4/L5 Progress Counters (now derived from contentClassifications)
  // ==========================================================================

  // L4: Count original fetches in progress (for news articles pointing to originals)
  // Note: Added `item &&` null checks for page refresh hydration safety
  const l4PendingCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => {
      if (!item) return false; // Skip undefined items during hydration
      const needsFetch = item.classification?.result &&
        !item.classification.result.isOriginalReport &&
        isValidUrl(item.classification.result.originalReportUrl);
      return needsFetch && item.originalContent?.pending;
    }).length
  );
  const l4CompletedCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => {
      if (!item) return false; // Skip undefined items during hydration
      const result = item.classification?.result;
      if (!result) return false;
      // Direct originals are "complete" (no extra fetch needed)
      if (result.isOriginalReport) return true;
      // News articles: complete when original is fetched
      if (isValidUrl(result.originalReportUrl) && item.originalContent?.result) return true;
      return false;
    }).length
  );

  // L5: Count summaries in progress (per article)
  // Note: Added `item &&` null checks for page refresh hydration safety
  const summaryPendingCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.summary?.pending).length
  );

  // Count LLM-specific reports
  const llmSpecificCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item && item.summary?.result?.isLLMSpecific).length
  );

  // ==========================================================================
  // Deduplicated Final Reports (for display)
  // Group by original URL, show each unique report once with all sources
  // ==========================================================================
  const finalReportsWithSources = derive(contentClassifications, (items) => {
    const byOriginalUrl = new Map<string, {
      url: string;
      summary: any;
      sourceRefs: string[];
    }>();

    for (const item of items) {
      if (!item) continue; // Skip undefined items during hydration
      const result = item.classification?.result;
      const sourceUrl = item.sourceUrl as string | null;
      if (!result || !sourceUrl) continue;

      // Determine the "original" URL for this item
      let originalUrl: string;
      if (result.isOriginalReport) {
        originalUrl = sourceUrl;
      } else if (isValidUrl(result.originalReportUrl)) {
        originalUrl = result.originalReportUrl;
      } else {
        continue; // No original URL to track
      }

      const normalized = normalizeURL(originalUrl);
      const existing = byOriginalUrl.get(normalized);

      if (existing) {
        // Add this source to existing group
        if (!existing.sourceRefs.includes(sourceUrl)) {
          existing.sourceRefs.push(sourceUrl);
        }
        // Use the first completed summary we find
        if (!existing.summary?.result && item.summary?.result) {
          existing.summary = item.summary;
        }
      } else {
        // New unique original URL
        byOriginalUrl.set(normalized, {
          url: originalUrl,
          summary: item.summary,
          sourceRefs: [sourceUrl],
        });
      }
    }

    // Convert to array with sourceCount
    return Array.from(byOriginalUrl.values()).map((entry) => ({
      url: entry.url,
      summary: entry.summary,
      sourceRefs: entry.sourceRefs,
      sourceCount: entry.sourceRefs.length,
    }));
  });

  // Add isRead flag to reports (computed once, not in render loop!)
  const finalReportsWithReadState = derive(
    { reports: finalReportsWithSources, read: readUrls },
    ({ reports, read }: { reports: any[]; read: string[] }) => {
      return reports.map((r: any) => ({
        ...r,
        isRead: read.includes(normalizeURL(r.url)),
      }));
    }
  );

  // Count unread reports (reports not in readUrls array)
  // Note: Added `r &&` null checks for page refresh hydration safety
  const unreadCount = derive(finalReportsWithReadState, (reports) =>
    reports.filter((r: any) => r && !r.isRead).length
  );

  const totalReportCount = derive(finalReportsWithSources, (reports) => reports.length);

  // DEBUG: Log finalReportsWithSources vs uniqueOriginalCount (controlled by flag)
  const _debugFinalReportsVerbose = derive(
    { reports: finalReportsWithSources, uniqueCount: uniqueOriginalCount, origUrls: originalReportUrls },
    ({ reports, uniqueCount, origUrls }) => {
      if (DEBUG_LOGGING) {
        console.log("[DEBUG:FINAL-REPORTS]", JSON.stringify({
          finalReportsCount: reports.length,
          uniqueOriginalCount: uniqueCount,
          originalReportUrlsCount: origUrls.length,
          sampleReport: reports[0] ? {
            url: reports[0].url?.slice?.(0, 50),
            hasSummary: !!reports[0].summary,
            summaryPending: reports[0].summary?.pending,
            summaryHasResult: !!reports[0].summary?.result,
          } : null,
        }, null, 2));
      }
      return null;
    }
  );

  // L5: Count unique reports with completed summaries (deduplicated)
  const reportsWithSummaryCount = derive(finalReportsWithSources, (reports) =>
    reports.filter((r: any) => r && r.summary?.result && !r.summary.pending).length
  );

  // ==========================================================================
  // UI
  // ==========================================================================
  return {
    [NAME]: str`Prompt Injection Tracker (${articleCount} articles)`,
    [UI]: (
      <div style={{ padding: "16px", fontFamily: "system-ui", maxWidth: "800px" }}>
        <h2>Prompt Injection Tracker v3</h2>
        <p style={{ fontSize: "12px", color: "#666", marginBottom: "16px" }}>
          Extracts URLs from security newsletters. Uses Gmail integration + LLM extraction.
        </p>

        {/* Source Stats */}
        <div style={{
          display: "flex",
          gap: "16px",
          marginBottom: "16px",
          fontSize: "13px",
          color: "#666"
        }}>
          <span>📧 {emailCount} from Gmail</span>
          <span>📝 {manualCount} manual</span>
        </div>

        {/* Gmail Settings (collapsible) */}
        <details style={{ marginBottom: "16px" }}>
          <summary style={{
            cursor: "pointer",
            padding: "8px 12px",
            background: "#f8f9fa",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            fontSize: "13px",
            fontWeight: "500"
          }}>
            ⚙️ Gmail Settings & Import
          </summary>
          <div style={{
            padding: "12px",
            marginTop: "8px",
            border: "1px solid #e0e0e0",
            borderRadius: "4px"
          }}>
            {importer}
          </div>
        </details>

        {/* Test Data Button (for development) */}
        <details style={{ marginBottom: "16px" }}>
          <summary style={{
            cursor: "pointer",
            padding: "8px 12px",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "4px",
            fontSize: "13px"
          }}>
            🧪 Test Mode (no Gmail needed)
          </summary>
          <div style={{ padding: "12px", marginTop: "8px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={loadTestArticles({ articles })}
                style={{
                  padding: "8px 16px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Load Test Articles ({TEST_ARTICLES.length})
              </button>
              <button
                onClick={addSingleArticle({ articles })}
                style={{
                  padding: "8px 16px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                + Add 1 Article
              </button>
            </div>
            <p style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
              Loads sample security newsletter content for testing without Gmail.
              Use "+ Add 1 Article" to test incremental caching.
            </p>
          </div>
        </details>

        {/* Status Card - Five-Level Pipeline with Deduplication */}
        <div style={{
          padding: "16px",
          background: "#f8fafc",
          borderRadius: "8px",
          marginBottom: "16px",
          border: "1px solid #e2e8f0",
        }}>
          {/* Pipeline Progress */}
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "12px", fontWeight: "500" }}>
            FIVE-LEVEL PIPELINE WITH REPORT DEDUPLICATION
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
            {/* Level 1: Article Extraction */}
            <div style={{
              padding: "6px 10px",
              background: pendingCount > 0 ? "#fef3c7" : "#d1fae5",
              borderRadius: "6px",
              border: `1px solid ${pendingCount > 0 ? "#fcd34d" : "#6ee7b7"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L1: Extract</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {completedCount}/{articleCount}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Level 2: Web Fetch - shows success/total with error indicator */}
            <div style={{
              padding: "6px 10px",
              background: fetchPendingCount > 0 ? "#fef3c7" : fetchErrorCount > 0 ? "#fee2e2" : "#dbeafe",
              borderRadius: "6px",
              border: `1px solid ${fetchPendingCount > 0 ? "#fcd34d" : fetchErrorCount > 0 ? "#fca5a5" : "#93c5fd"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L2: Fetch</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {fetchSuccessCount}/{urlSlotsCount}
                {fetchErrorCount > 0 && (
                  <span style={{ color: "#ef4444", fontSize: "11px", marginLeft: "4px" }} title={`${fetchErrorCount} failed - will retry`}>
                    ⚠️{fetchErrorCount}
                  </span>
                )}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Level 3: Classify */}
            <div style={{
              padding: "6px 10px",
              background: classifyPendingCount > 0 ? "#fef3c7" : "#e0e7ff",
              borderRadius: "6px",
              border: `1px solid ${classifyPendingCount > 0 ? "#fcd34d" : "#a5b4fc"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L3: Classify</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {classifyCompletedCount}/{urlSlotsCount}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Deduplication indicator */}
            <div style={{
              padding: "6px 10px",
              background: "#fef9c3",
              borderRadius: "6px",
              border: "1px solid #fde047",
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>Dedupe</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {linkCount}→{uniqueOriginalCount}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Level 4: Fetch Originals */}
            <div style={{
              padding: "6px 10px",
              background: l4PendingCount > 0 ? "#fef3c7" : "#d1fae5",
              borderRadius: "6px",
              border: `1px solid ${l4PendingCount > 0 ? "#fcd34d" : "#6ee7b7"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L4: Fetch</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {l4CompletedCount}/{uniqueOriginalCount}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Level 5: Summarize */}
            <div style={{
              padding: "6px 10px",
              background: summaryPendingCount > 0 ? "#fef3c7" : "#f3e8ff",
              borderRadius: "6px",
              border: `1px solid ${summaryPendingCount > 0 ? "#fcd34d" : "#c4b5fd"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L5: Summary</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {reportsWithSummaryCount}/{uniqueOriginalCount}
              </div>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "12px" }}>→</span>
            {/* Final: LLM-specific */}
            <div style={{
              padding: "6px 10px",
              background: "#fce7f3",
              borderRadius: "6px",
              border: "1px solid #f9a8d4",
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>LLM</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>{llmSpecificCount}</div>
            </div>
          </div>
          {/* Classification breakdown */}
          <div style={{ fontSize: "11px", color: "#666", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <span>🔬 {originalCount} direct originals</span>
            <span>📰 {newsArticleCount} news articles</span>
            <span>📊 {uniqueOriginalCount} unique reports</span>
          </div>
        </div>

        {/* Extraction Results */}
        <h3>Extraction Results</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {articleExtractions.map((item) => (
            <div style={{
              padding: "12px",
              background: item.extraction.pending ? "#fef3c7" :
                item.extraction.result?.classification === "is-original-report" ? "#dbeafe" :
                item.extraction.result?.classification === "has-security-links" ? "#d1fae5" :
                "#f3f4f6",
              borderRadius: "6px",
              border: `1px solid ${item.extraction.pending ? "#fcd34d" :
                item.extraction.result?.classification === "is-original-report" ? "#93c5fd" :
                item.extraction.result?.classification === "has-security-links" ? "#6ee7b7" :
                "#d1d5db"}`,
            }}>
              <div style={{ fontWeight: "500", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span>
                  {item.extraction.pending ? "⏳ " :
                   item.extraction.result?.classification === "is-original-report" ? "🔬 " :
                   item.extraction.result?.classification === "has-security-links" ? "✅ " :
                   "⬜ "}
                  {item.articleTitle}
                </span>
                {!item.extraction.pending && (
                  <span style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: item.extraction.result?.classification === "is-original-report" ? "#3b82f6" :
                               item.extraction.result?.classification === "has-security-links" ? "#10b981" :
                               "#6b7280",
                    color: "white",
                  }}>
                    {item.extraction.result?.classification || "unknown"}
                  </span>
                )}
                <span style={{ color: "#666", fontSize: "12px" }}>
                  {item.extraction.pending ? "processing..." : `${item.extraction.result?.urls?.length ?? 0} links`}
                </span>
              </div>
              {!item.extraction.pending && (item.extraction.result?.urls?.length ?? 0) > 0 && (
                <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: "11px" }}>
                  {item.extraction.result?.urls?.map((link: string) => (
                    <li style={{ color: "#3b82f6" }}>{link}</li>
                  ))}
                </ul>
              )}
              {item.extraction.error && (
                <div style={{ fontSize: "12px", color: "#dc2626" }}>
                  Error: {item.extraction.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Deduplicated Original Reports - Final Output */}
        {uniqueOriginalCount > 0 && (
          <div style={{ marginTop: "24px" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>Original Security Reports ({reportsWithSummaryCount}/{uniqueOriginalCount})</span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "#2563eb",
                  color: "white",
                  fontWeight: "600",
                }}>
                  {unreadCount} unread
                </span>
              )}
              {summaryPendingCount > 0 && <span style={{ color: "#f59e0b", fontSize: "14px" }}>⏳ {summaryPendingCount} processing...</span>}
            </h3>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px" }}>
              Deduplicated from {linkCount} source URLs. 🤖 {llmSpecificCount} LLM-specific.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {finalReportsWithReadState.map((item) => (
                <div style={{
                  padding: "12px",
                  background: item.summary?.pending ? "#fef3c7" :
                    item.summary?.result?.isLLMSpecific ? "#fce7f3" :
                    item.summary?.result?.severity === "critical" ? "#fee2e2" :
                    item.summary?.result?.severity === "high" ? "#ffedd5" :
                    "#f0fdf4",
                  borderRadius: "6px",
                  border: `1px solid ${item.summary?.pending ? "#fcd34d" :
                    item.summary?.result?.isLLMSpecific ? "#f9a8d4" :
                    item.summary?.result?.severity === "critical" ? "#fca5a5" :
                    item.summary?.result?.severity === "high" ? "#fdba74" :
                    "#86efac"}`,
                  opacity: item.isRead ? 0.6 : 1,
                  transition: "opacity 0.2s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                    {/* Read/Unread toggle button */}
                    <button
                      onClick={toggleRead({ readUrls, url: item.url })}
                      style={{
                        padding: "2px 6px",
                        fontSize: "14px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        opacity: 0.7,
                      }}
                      title={item.isRead ? "Mark as unread" : "Mark as read"}
                    >
                      {item.isRead ? "✓" : "○"}
                    </button>
                    {item.summary?.pending ? (
                      <span>⏳ Analyzing...</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: item.isRead ? "400" : "600" }}>{item.summary?.result?.title || "Unknown"}</span>
                        {item.summary?.result?.canonicalId && (
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#4b5563",
                            color: "white",
                            fontFamily: "monospace",
                          }}>
                            {item.summary.result.canonicalId}
                          </span>
                        )}
                        <span style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: item.summary?.result?.severity === "critical" ? "#dc2626" :
                                     item.summary?.result?.severity === "high" ? "#ea580c" :
                                     item.summary?.result?.severity === "medium" ? "#ca8a04" :
                                     "#16a34a",
                          color: "white",
                        }}>
                          {item.summary?.result?.severity?.toUpperCase()}
                        </span>
                        {item.summary?.result?.isLLMSpecific && (
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#db2777",
                            color: "white",
                          }}>
                            LLM
                          </span>
                        )}
                        {item.sourceCount > 1 && (
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#0891b2",
                            color: "white",
                          }}>
                            {item.sourceCount} refs
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {!item.summary?.pending && item.summary?.result?.summary && (
                    <div style={{ fontSize: "12px", color: "#374151", marginBottom: "4px" }}>
                      {item.summary.result.summary}
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                    <a href={item.url} target="_blank" style={{ color: "#2563eb" }}>{item.url}</a>
                  </div>
                  {/* Show sources that referenced this report */}
                  {item.sourceCount > 1 && (
                    <details style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                      <summary style={{ cursor: "pointer" }}>
                        Referenced by {item.sourceCount} source URLs
                      </summary>
                      <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                        {(item.sourceRefs || []).map((src: string, idx: number) => (
                          <li key={idx}><a href={src} target="_blank" style={{ color: "#6b7280" }}>{src}</a></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),
    articles: articleExtractions,
    extractedLinks: allExtractedLinks,
    contentClassifications,
    originalReportUrls,
    finalReportsWithSources,
    readUrls,
    emails: importer.emails,
  };
});

/**
 * Default values for creating a new PromptInjectionTracker.
 * See pattern-development skill for idiom documentation.
 */
const defaults = {
  gmailFilterQuery: 'from:"googlealerts-noreply@google.com" subject:"prompt injection"',
  limit: 50,
  articles: [] as Article[],
  authCharm: null as any,
};

/**
 * Factory function to create a PromptInjectionTracker with sensible defaults.
 * @example navigateTo(createPromptInjectionTracker());
 */
export function createPromptInjectionTracker(overrides?: Partial<typeof defaults>) {
  return PromptInjectionTracker({ ...defaults, ...overrides });
}

export default PromptInjectionTracker;
