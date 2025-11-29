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

export default pattern<TrackerInput, TrackerOutput>(({ gmailFilterQuery, limit, articles, authCharm }) => {
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
  // Reports storage
  // ==========================================================================
  const reports = cell<PromptInjectionReport[]>([]);

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
  const articleExtractions = derive(
    { manual: manualArticleExtractions, email: emailArticleExtractions },
    ({ manual, email }) => [...manual, ...email]
  );

  // ==========================================================================
  // Progress tracking
  // ==========================================================================
  const pendingCount = derive(articleExtractions, (list) =>
    list.filter((e: any) => e.extraction?.pending).length
  );

  // Completed = not pending (matches what the UI checkmarks show)
  const completedCount = derive(articleExtractions, (list) =>
    list.filter((e: any) => !e.extraction?.pending).length
  );

  // Collect all extracted links for counting (derive is fine for read-only aggregation)
  const allExtractedLinks = derive(articleExtractions, (list) => {
    const links: string[] = [];
    const seen = new Set<string>();
    for (const item of list) {
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
      const classification = item.extraction?.result?.classification as string | undefined;
      if (classification && counts[classification] !== undefined) {
        counts[classification]++;
      }
    }
    return counts;
  });

  // ==========================================================================
  // LEVELS 2-5: Process first URL from each article through the pipeline
  // CRITICAL: Must map over cell arrays, not derive results!
  // We map over manualArticleExtractions and emailArticleExtractions separately
  // ==========================================================================

  // Helper: Process L2-L5 for an article extraction
  // This is applied via .map() to both manual and email extractions
  const processArticleUrl = (article: any) => {
    // Get first URL from this article's extraction
    const firstUrl = derive(article.extraction, (ext: any) => {
      const urls = ext?.result?.urls || [];
      return urls[0] || null;
    });

    // L2: Fetch web content for first URL
    const webContent = ifElse(
      firstUrl,
      fetchData<{ content: string; title?: string }>({
        url: "/api/agent-tools/web-read",
        mode: "json",
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: derive(firstUrl, (u: any) => ({ url: u, max_tokens: 4000, include_code: false })),
        },
      }),
      null
    );

    // L3: Classify content
    const classification = ifElse(
      firstUrl,
      generateObject<{
        isOriginalReport: boolean;
        originalReportUrl: string | null;
        confidence: "high" | "medium" | "low";
        briefDescription: string;
      }>({
        system: CONTENT_CLASSIFICATION_SYSTEM,
        prompt: derive(
          { url: firstUrl, content: webContent },
          ({ url, content }: any) => {
            const pageContent = content?.result?.content;
            if (pageContent) {
              return `URL: ${url}\n\nPage Content:\n${pageContent.slice(0, 8000)}\n\nClassify this content and extract original report URL if applicable.`;
            }
            return `URL: ${url}\n\nClassify based on URL pattern only.`;
          }
        ),
        model: "anthropic:claude-sonnet-4-5",
        schema: CONTENT_CLASSIFICATION_SCHEMA,
      }),
      null
    );

    // L4: Fetch original report if this is a news article pointing to one
    const needsOriginalFetch = derive(classification, (c: any) =>
      c?.result && !c.result.isOriginalReport && c.result.originalReportUrl
    );
    const originalReportUrl = derive(classification, (c: any) => c?.result?.originalReportUrl);

    const originalContent = ifElse(
      needsOriginalFetch,
      fetchData<{ content: string; title?: string }>({
        url: "/api/agent-tools/web-read",
        mode: "json",
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: derive(originalReportUrl, (u: any) => ({ url: u, max_tokens: 4000, include_code: false })),
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

    const summary = ifElse(
      firstUrl,
      generateObject<{
        title: string;
        summary: string;
        severity: "low" | "medium" | "high" | "critical";
        isLLMSpecific: boolean;
        discoveryDate: string;
        canonicalId: string;
      }>({
        system: REPORT_SUMMARY_SYSTEM,
        prompt: derive(
          { url: firstUrl, originalReportUrl, content: reportContent, isOriginal },
          ({ url, originalReportUrl, content, isOriginal }: any) => {
            const targetUrl = isOriginal ? url : (originalReportUrl || url);
            const pageContent = content?.result?.content;
            if (pageContent) {
              return `URL: ${targetUrl}\n\nPage Content:\n${pageContent.slice(0, 8000)}\n\nSummarize this security report.`;
            }
            return `URL: ${targetUrl}\n\nSummarize based on URL pattern.`;
          }
        ),
        model: "anthropic:claude-sonnet-4-5",
        schema: REPORT_SUMMARY_SCHEMA,
      }),
      null
    );

    return {
      articleId: article.articleId,
      articleTitle: article.articleTitle,
      extraction: article.extraction,
      sourceUrl: firstUrl,
      webContent,
      classification,
      originalReportUrl,
      originalContent,
      isOriginal,
      summary,
    };
  };

  // Process manual articles through L2-L5 (maps over cell - reactive!)
  const manualUrlProcessing = manualArticleExtractions.map(processArticleUrl);

  // Process email articles through L2-L5 (maps over cell - reactive!)
  const emailUrlProcessing = emailArticleExtractions.map(processArticleUrl);

  // Combine for aggregation (derive is fine for read-only operations)
  const articleFirstUrlProcessing = derive(
    { manual: manualUrlProcessing, email: emailUrlProcessing },
    ({ manual, email }) => [...manual, ...email]
  );

  // Filter to only articles that have URLs for aggregation
  const contentClassifications = derive(articleFirstUrlProcessing, (articles) => {
    return articles.filter((a: any) => a.sourceUrl).map((a: any) => ({
      sourceUrl: a.sourceUrl,
      webContent: a.webContent,
      classification: a.classification,
      originalUrl: a.originalReportUrl,
      originalContent: a.originalContent,
      isOriginal: a.isOriginal,
      summary: a.summary,
    }));
  });

  // L2: Count web fetch progress (from articleFirstUrlProcessing)
  const fetchPendingCount = derive(articleFirstUrlProcessing, (list) =>
    list.filter((item: any) => item.sourceUrl && item.webContent?.pending).length
  );
  const fetchCompletedCount = derive(articleFirstUrlProcessing, (list) =>
    list.filter((item: any) => item.sourceUrl && !item.webContent?.pending && item.webContent?.result).length
  );
  const fetchErrorCount = derive(articleFirstUrlProcessing, (list) =>
    list.filter((item: any) => item.sourceUrl && !item.webContent?.pending && item.webContent?.error).length
  );

  // Count classification progress
  const classifyPendingCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c.classification?.pending).length
  );
  const classifyCompletedCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => !c.classification?.pending).length
  );

  // Count originals vs news articles
  const originalCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c.classification?.result?.isOriginalReport).length
  );
  const newsArticleCount = derive(contentClassifications, (list) =>
    list.filter((c: any) => c.classification?.result && !c.classification.result.isOriginalReport).length
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
      const result = item.classification?.result;
      if (!result) continue; // Still pending

      let targetUrl: string | null = null;
      let isDirectOriginal = false;

      if (result.isOriginalReport) {
        // This URL IS the original report
        targetUrl = item.sourceUrl;
        isDirectOriginal = true;
      } else if (result.originalReportUrl) {
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
  const l4PendingCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => {
      const needsFetch = item.classification?.result &&
        !item.classification.result.isOriginalReport &&
        item.classification.result.originalReportUrl;
      return needsFetch && item.originalContent?.pending;
    }).length
  );
  const l4CompletedCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => {
      const result = item.classification?.result;
      if (!result) return false;
      // Direct originals are "complete" (no extra fetch needed)
      if (result.isOriginalReport) return true;
      // News articles: complete when original is fetched
      if (result.originalReportUrl && item.originalContent?.result) return true;
      return false;
    }).length
  );

  // L5: Count summaries in progress
  const summaryPendingCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item.summary?.pending).length
  );
  const summaryCompletedCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => !item.summary?.pending && item.summary?.result).length
  );

  // Count LLM-specific reports
  const llmSpecificCount = derive(contentClassifications, (list) =>
    list.filter((item: any) => item.summary?.result?.isLLMSpecific).length
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
      const result = item.classification?.result;
      if (!result) continue;

      // Determine the "original" URL for this item
      let originalUrl: string;
      if (result.isOriginalReport) {
        originalUrl = item.sourceUrl;
      } else if (result.originalReportUrl) {
        originalUrl = result.originalReportUrl;
      } else {
        continue; // No original URL to track
      }

      const normalized = normalizeURL(originalUrl);
      const existing = byOriginalUrl.get(normalized);

      if (existing) {
        // Add this source to existing group
        if (!existing.sourceRefs.includes(item.sourceUrl)) {
          existing.sourceRefs.push(item.sourceUrl);
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
          sourceRefs: [item.sourceUrl],
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
            <p style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
              Loads sample security newsletter content for testing without Gmail.
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
            {/* Level 2: Web Fetch */}
            <div style={{
              padding: "6px 10px",
              background: fetchPendingCount > 0 ? "#fef3c7" : fetchErrorCount > 0 ? "#fee2e2" : "#dbeafe",
              borderRadius: "6px",
              border: `1px solid ${fetchPendingCount > 0 ? "#fcd34d" : fetchErrorCount > 0 ? "#fca5a5" : "#93c5fd"}`,
            }}>
              <div style={{ fontSize: "10px", color: "#666" }}>L2: Fetch</div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {fetchCompletedCount}/{linkCount}
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
                {classifyCompletedCount}/{linkCount}
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
                {summaryCompletedCount}/{uniqueOriginalCount}
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
            <h3>
              Original Security Reports ({summaryCompletedCount}/{uniqueOriginalCount})
              {summaryPendingCount > 0 && <span style={{ color: "#f59e0b", marginLeft: "8px" }}>⏳ {summaryPendingCount} processing...</span>}
            </h3>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px" }}>
              Deduplicated from {linkCount} source URLs. 🤖 {llmSpecificCount} LLM-specific.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {finalReportsWithSources.map((item) => (
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
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                    {item.summary?.pending ? (
                      <span>⏳ Analyzing...</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: "600" }}>{item.summary?.result?.title || "Unknown"}</span>
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
                        {item.sourceRefs?.map((src: string) => (
                          <li><a href={src} target="_blank" style={{ color: "#6b7280" }}>{src}</a></li>
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
    emails: importer.emails,
  };
});
