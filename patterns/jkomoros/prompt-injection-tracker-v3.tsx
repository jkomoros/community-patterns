/// <cts-enable />
/**
 * PROMPT INJECTION TRACKER V3
 *
 * Using verified "dumb map approach" from framework author feedback.
 *
 * Architecture:
 * 1. articles.map((article) => generateObject({...})) for link extraction
 * 2. Let framework handle caching automatically
 * 3. NO custom caching layers, NO OpaqueRef casting
 *
 * Phase 2: Gmail integration - imports emails and extracts URLs
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
}

// =============================================================================
// SCHEMAS
// =============================================================================

// Simplified schema - just extract all URLs found
const LINK_EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    urls: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "All URLs found in the text",
    },
  },
  required: ["urls"] as const,
};

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
}

interface TrackerOutput {
  articles: Article[];
  extractedLinks: string[];
}

export default pattern<TrackerInput, TrackerOutput>(({ gmailFilterQuery, limit, articles }) => {
  // ==========================================================================
  // Gmail Integration
  // ==========================================================================
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery,
      limit,
      historyId: "",
    },
    authCharm: null, // Let importer wish for shared auth
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
  // CORE: Map over articles with generateObject (the "dumb map approach")
  // NOTE: We use allArticles which combines manual + email articles
  // ==========================================================================
  const articleExtractions = allArticles.map((article) => ({
    articleId: article.id,
    articleTitle: article.title,
    extraction: generateObject<ExtractedLinks>({
      system: `Extract all URLs from the text. Return them in the urls array.`,
      // Direct access like map-test-100-items.tsx
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

  // Collect all extracted links from completed extractions
  const allExtractedLinks = derive(articleExtractions, (list) => {
    const links: string[] = [];
    for (const item of list) {
      const result = item.extraction?.result;
      if (result && result.urls) {
        links.push(...result.urls);
      }
    }
    // Dedupe
    return [...new Set(links)];
  });

  const linkCount = derive(allExtractedLinks, (links) => links.length);

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
              <div style={{ fontSize: "12px", color: "#666" }}>Links Found</div>
            </div>
          </div>
        </div>

        {/* Extraction Results */}
        <h3>Extraction Results</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {articleExtractions.map((item) => (
            <div style={{
              padding: "12px",
              background: item.extraction.pending ? "#fef3c7" : "#d1fae5",
              borderRadius: "6px",
              border: `1px solid ${item.extraction.pending ? "#fcd34d" : "#6ee7b7"}`,
            }}>
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                {item.extraction.pending ? "⏳ " : "✅ "}
                {item.articleTitle}
                {" - "}
                {item.extraction.pending ? "processing..." : `${item.extraction.result?.urls?.length ?? 0} links`}
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
