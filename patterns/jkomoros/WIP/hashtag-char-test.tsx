/// <cts-enable />
/**
 * Test Pattern: Verify which characters work in hashtags
 *
 * Tests: #test+plus, #testPlusCamel, #test_underscore, #test-dash
 */
import { Default, NAME, pattern, UI, wish } from "commontools";

// Source patterns with different tag characters

/** Test with plus sign. #testPlus+Sign */
interface PlusOutput { marker: "plus" }

/** Test with underscore. #test_underscore */
interface UnderscoreOutput { marker: "underscore" }

/** Test with dash. #test-dash */
interface DashOutput { marker: "dash" }

/** Test with camelCase. #testGmailCalendar */
interface CamelOutput { marker: "camel" }

// Simple source pattern
export const PlusSource = pattern<{}, PlusOutput>(() => ({
  [NAME]: "Plus Tag Source",
  [UI]: <div>Plus tag: #testPlus+Sign</div>,
  marker: "plus",
}));

export const UnderscoreSource = pattern<{}, UnderscoreOutput>(() => ({
  [NAME]: "Underscore Tag Source",
  [UI]: <div>Underscore tag: #test_underscore</div>,
  marker: "underscore",
}));

export const DashSource = pattern<{}, DashOutput>(() => ({
  [NAME]: "Dash Tag Source",
  [UI]: <div>Dash tag: #test-dash</div>,
  marker: "dash",
}));

export const CamelSource = pattern<{}, CamelOutput>(() => ({
  [NAME]: "Camel Tag Source",
  [UI]: <div>Camel tag: #testGmailCalendar</div>,
  marker: "camel",
}));

// Test pattern that wishes for each
const HashtagCharTest = pattern<{}>(() => {
  const plusWish = wish<PlusOutput>({ query: "#testPlus+Sign" });
  const underscoreWish = wish<UnderscoreOutput>({ query: "#test_underscore" });
  const dashWish = wish<DashOutput>({ query: "#test-dash" });
  const camelWish = wish<CamelOutput>({ query: "#testGmailCalendar" });

  return {
    [NAME]: "Hashtag Char Test",
    [UI]: (
      <div style={{ padding: "16px" }}>
        {/* Hidden: trigger startup */}
        <div style={{ display: "none" }}>
          {plusWish}{underscoreWish}{dashWish}{camelWish}
        </div>

        <h2>Hashtag Character Test</h2>
        <p>Testing which characters work in hashtags for wish queries.</p>

        <h3>Results</h3>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Tag</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Found?</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Error</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}><code>#testPlus+Sign</code></td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{plusWish.result ? "Yes" : "No"}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{plusWish.error || "None"}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}><code>#test_underscore</code></td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{underscoreWish.result ? "Yes" : "No"}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{underscoreWish.error || "None"}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}><code>#test-dash</code></td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{dashWish.result ? "Yes" : "No"}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{dashWish.error || "None"}</td>
            </tr>
            <tr>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}><code>#testGmailCalendar</code></td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{camelWish.result ? "Yes" : "No"}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{camelWish.error || "None"}</td>
            </tr>
          </tbody>
        </table>

        <h3>Instructions</h3>
        <ol>
          <li>Deploy each source pattern (Plus, Underscore, Dash, Camel)</li>
          <li>Favorite each one</li>
          <li>Check which ones show "Found: Yes"</li>
        </ol>

        <h3>Recommendation</h3>
        <p>Based on results, use the safest character for scope combinations like:</p>
        <ul>
          <li><code>#googleAuthGmailCalendar</code> (camelCase - likely safest)</li>
          <li><code>#googleAuth_Gmail_Calendar</code> (underscores)</li>
          <li><code>#googleAuthGmail+Calendar</code> (plus sign - if it works)</li>
        </ul>
      </div>
    ),
  };
});

export default HashtagCharTest;
