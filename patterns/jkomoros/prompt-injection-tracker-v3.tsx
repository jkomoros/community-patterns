/// <cts-enable />
/**
 * PROMPT INJECTION TRACKER V3
 *
 * Extracts URLs from security newsletters using Gmail integration + LLM extraction.
 *
 * =============================================================================
 * KEY INSIGHT: THE "DUMB MAP APPROACH"
 * =============================================================================
 *
 * This pattern demonstrates the correct way to do LLM extraction over arrays
 * in Common Tools. The key insight from the framework author:
 *
 *   "Just use array.map() with generateObject. The framework handles caching."
 *
 * HOW IT WORKS:
 * -------------
 * ```typescript
 * const extractions = articles.map((article) => ({
 *   extraction: generateObject({
 *     prompt: article.content,
 *     schema: SCHEMA,
 *   }),
 * }));
 * ```
 *
 * 1. `array.map()` creates a new reactive array
 * 2. Each item contains a `generateObject` call
 * 3. The framework automatically memoizes/caches results based on inputs
 * 4. Same inputs (prompt + schema) = cached result (no re-calling LLM)
 * 5. New articles only trigger LLM calls for those new items
 *
 * WHY THIS WORKS:
 * ---------------
 * - The framework tracks dependencies reactively
 * - generateObject results are cached by their inputs
 * - When an article's content doesn't change, the extraction is reused
 * - No need for manual cache management or state tracking
 *
 * WHAT NOT TO DO:
 * ---------------
 * ❌ Don't build custom caching layers (framework does this)
 * ❌ Don't cast to OpaqueRef<> in map callbacks (causes type issues)
 * ❌ Don't use complex state machines for "processing" states
 * ❌ Don't try to batch/queue LLM calls manually
 *
 * REFERENCE:
 * ----------
 * See `patterns/examples/map-test-100-items.tsx` for the canonical example
 * that demonstrates this pattern working with 100 items.
 *
 * =============================================================================
 * ARCHITECTURE
 * =============================================================================
 *
 * 1. Gmail Integration: Fetch emails via GmailImporter composition pattern
 * 2. Article Conversion: Convert emails to Article format via derive()
 * 3. LLM Extraction: Map over articles with generateObject (the core pattern)
 * 4. Results Aggregation: Derive collected links from extraction results
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

// Schema for report summarization
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
  },
  required: ["title", "summary", "severity", "isLLMSpecific", "discoveryDate"] as const,
};

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
  // Gmail filter query - default to security newsletters
  gmailFilterQuery: Default<string, "label:security OR from:security">;
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

  // Convert Gmail emails to our Article format
  const emailArticles = derive(importer.emails, (emails: any[]) => {
    return emails.map((email: any) => ({
      id: email.id,
      title: email.subject || "No Subject",
      source: email.from || "Unknown",
      content: email.markdownContent || email.snippet || "",
    }));
  });

  // Combine manual articles with email articles
  // Manual articles take precedence (shown first)
  const allArticles = derive(
    { manual: articles, fromEmail: emailArticles },
    ({ manual, fromEmail }) => [...manual, ...fromEmail]
  );

  // Count for display
  const articleCount = derive(allArticles, (list) => list.length);
  const emailCount = derive(emailArticles, (list) => list.length);
  const manualCount = derive(articles, (list) => list.length);

  // ==========================================================================
  // Reports storage
  // ==========================================================================
  const reports = cell<PromptInjectionReport[]>([]);

  // ==========================================================================
  // LEVEL 1: Extract security links from articles (the "dumb map approach")
  // ==========================================================================
  const articleExtractions = allArticles.map((article) => ({
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

  // Collect all extracted links from completed extractions (normalized & deduped)
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
            links.push(url); // Keep original URL for display
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

        {/* Status Card */}
        <div style={{
          padding: "16px",
          background: "#f8fafc",
          borderRadius: "8px",
          marginBottom: "16px",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>{articleCount}</div>
              <div style={{ fontSize: "12px", color: "#666" }}>Articles</div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: pendingCount > 0 ? "#f59e0b" : "#10b981" }}>
                {pendingCount > 0 ? pendingCount : completedCount}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {pendingCount > 0 ? "Processing..." : "Completed"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#3b82f6" }}>{linkCount}</div>
              <div style={{ fontSize: "12px", color: "#666" }}>Security Links</div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#8b5cf6" }}>{reportCount}</div>
              <div style={{ fontSize: "12px", color: "#666" }}>Reports</div>
            </div>
          </div>
          {/* Classification breakdown */}
          <div style={{ marginTop: "12px", fontSize: "11px", color: "#666", display: "flex", gap: "12px" }}>
            <span>🔬 {derive(classificationCounts, c => c["is-original-report"])} original</span>
            <span>🔗 {derive(classificationCounts, c => c["has-security-links"])} with links</span>
            <span>⬜ {derive(classificationCounts, c => c["no-security-links"])} no links</span>
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

        {/* All Extracted Links */}
        {linkCount > 0 && (
          <div style={{ marginTop: "24px" }}>
            <h3>All Security Report Links ({linkCount})</h3>
            <div style={{
              padding: "12px",
              background: "#eff6ff",
              borderRadius: "6px",
              border: "1px solid #bfdbfe",
            }}>
              {allExtractedLinks.map((link: string) => (
                <div style={{ fontSize: "13px", padding: "4px 0" }}>
                  <a href={link} target="_blank" style={{ color: "#2563eb" }}>{link}</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),
    articles: allArticles,
    extractedLinks: allExtractedLinks,
    emails: importer.emails,
  };
});
