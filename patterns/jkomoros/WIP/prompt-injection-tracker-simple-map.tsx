/// <cts-enable />
/**
 * SIMPLIFIED PROMPT INJECTION TRACKER - "Dumb Map Approach"
 *
 * Based on framework author feedback:
 * - The "dumb looking approach where it's just a map should work"
 * - "You can call generateObject from handlers and lift as well"
 * - "This includes call map over what is being returned!"
 * - DON'T manually cast away from OpaqueRef
 * - DON'T manually add OpaqueRef casts in handlers
 *
 * This version:
 * 1. Uses simple .map() with generateObject
 * 2. Maps over the results without explicit type casts
 * 3. Lets the framework handle reactivity naturally
 */
import {
  cell,
  derive,
  generateObject,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// Simple schema for link extraction
const EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    links: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["links"] as const,
};

// Test articles (hardcoded for simplicity)
const TEST_ARTICLES = [
  {
    id: "1",
    title: "Test Article 1",
    content: "This article mentions https://example.com/security-report as a source.",
  },
  {
    id: "2",
    title: "Test Article 2",
    content: "Another article with https://security.blog/vuln-123 link.",
  },
  {
    id: "3",
    title: "Test Article 3",
    content: "No security links in this one, just general AI discussion.",
  },
];

interface Input {
  // Empty for now
}

interface Output {
  extractedLinks: string[];
}

export default pattern<Input, Output>(() => {
  // Simple cell to hold articles (could be from Gmail in real version)
  const articles = cell(TEST_ARTICLES);

  // THE "DUMB MAP APPROACH":
  // Just map over articles with generateObject - no fancy types, no derives wrapping
  const extractions = articles.map((article) =>
    generateObject({
      system: "Extract any security-related URLs from the article content. Return an array of links.",
      // Use template literal for prompt - reactive to article content
      prompt: `Article: ${article.title}\n\nContent: ${article.content}`,
      model: "anthropic:claude-sonnet-4-5",
      schema: EXTRACTION_SCHEMA,
    })
  );

  // Now map over the extractions to display them
  // The framework handles the opaque refs - we just access properties
  const extractionItems = extractions.map((extraction, index) => ({
    index,
    extraction,
  }));

  // Handler to log current state (for debugging)
  const logState = handler(() => {
    console.log("Articles:", articles);
    console.log("Extractions:", extractions);
  });

  return {
    [NAME]: "Simple Map Test",
    [UI]: (
      <div style={{ padding: "16px" }}>
        <h2>Simple Map Approach Test</h2>
        <p style={{ fontSize: "12px", color: "#666" }}>
          Testing the "dumb map approach" where we just use .map() with generateObject
          and map over the results without manual type casts.
        </p>

        <button onclick={logState({})}>Log State</button>

        <h3>Articles ({derive(articles, a => a.length)})</h3>
        {articles.map((article) => (
          <div style={{
            padding: "8px",
            margin: "8px 0",
            background: "#f0f0f0",
            borderRadius: "4px",
          }}>
            <strong>{article.title}</strong>
            <div style={{ fontSize: "11px", color: "#666" }}>{article.content}</div>
          </div>
        ))}

        <h3>Extractions</h3>
        {/* Map over extractions - accessing .pending and .result directly in JSX */}
        {extractions.map((extraction, idx) => (
          <div style={{
            padding: "8px",
            margin: "8px 0",
            background: extraction.pending ? "#fef3c7" : "#d1fae5",
            borderRadius: "4px",
          }}>
            <div>
              <strong>Article {idx + 1}:</strong>
              {extraction.pending ? (
                <span> Loading...</span>
              ) : extraction.error ? (
                <span style={{ color: "red" }}> Error: {extraction.error}</span>
              ) : (
                <span> {extraction.result?.links?.length || 0} links found</span>
              )}
            </div>
            {!extraction.pending && extraction.result?.links?.length > 0 && (
              <div style={{ fontSize: "11px", marginTop: "4px" }}>
                Links: {extraction.result.links.join(", ")}
              </div>
            )}
          </div>
        ))}

        <h3>All Extracted Links (from map)</h3>
        {/* Map over extractions again to collect all links */}
        {extractions.map((extraction) => (
          extraction.pending ? null : (
            extraction.result?.links?.map((link: string) => (
              <div style={{ fontSize: "11px", padding: "2px 0" }}>
                {link}
              </div>
            ))
          )
        ))}
      </div>
    ),
    extractedLinks: [],  // TODO: aggregate from extractions
  };
});
