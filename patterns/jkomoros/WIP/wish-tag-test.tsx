/// <cts-enable />
/**
 * Test Pattern: Verify wish behavior with tags
 *
 * Tests:
 * 1. Can wish() take a reactive/dynamic query?
 * 2. Do multiple tags in a description work?
 *
 * This is a diagnostic pattern - deploy and observe results.
 */
import {
  Cell,
  cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

// Test output type with MULTIPLE tags
/** Test output with multiple tags. #testTag1 #testTag2 */
interface MultiTagOutput {
  value: string;
  timestamp: number;
}

// A simple pattern that exports with multiple tags
export const MultiTagPattern = pattern<
  { value: Default<string, "test-value"> },
  MultiTagOutput
>(({ value }) => {
  return {
    [NAME]: "Multi-Tag Test",
    [UI]: (
      <div style={{ padding: "16px", background: "#f0f9ff", borderRadius: "8px" }}>
        <h3>Multi-Tag Test Pattern</h3>
        <p>Value: {value}</p>
        <p style={{ fontSize: "12px", color: "#666" }}>
          This pattern has tags: #testTag1 #testTag2
        </p>
      </div>
    ),
    value,
    timestamp: Date.now(),
  };
});

// Main test pattern
interface TestInput {
  selectedTag: Default<string, "#testTag1">;
}

const WishTagTest = pattern<TestInput>(({ selectedTag }) => {
  const testResults = cell<string[]>([]);

  // Test 1: Static wish with tag #testTag1
  const staticWish1 = wish<MultiTagOutput>({ query: "#testTag1" });

  // Test 2: Static wish with tag #testTag2
  const staticWish2 = wish<MultiTagOutput>({ query: "#testTag2" });

  // Test 3: Dynamic wish with selected tag
  // NOTE: This may or may not work - that's what we're testing
  const dynamicQuery = derive(selectedTag, (tag) => tag);
  // We can't directly pass a Cell to wish - it expects a string
  // So we need to test if there's a way to make this reactive

  // Computed results for display
  const staticResult1 = derive(staticWish1, (wr) => ({
    hasResult: !!wr?.result,
    value: wr?.result?.value || "N/A",
    error: wr?.error || null,
  }));

  const staticResult2 = derive(staticWish2, (wr) => ({
    hasResult: !!wr?.result,
    value: wr?.result?.value || "N/A",
    error: wr?.error || null,
  }));

  // Handler to change selected tag
  const setTag = handler<
    { detail: { value: string } },
    { selectedTag: Cell<string> }
  >(({ detail }, state) => {
    state.selectedTag.set(detail.value);
  });

  // Handler to run tests
  const runTests = handler<unknown, { results: Cell<string[]> }>(
    (_, { results }) => {
      results.set([
        `Test started at ${new Date().toISOString()}`,
        "Checking wish results...",
      ]);
    },
  );

  return {
    [NAME]: "Wish Tag Test",
    [UI]: (
      <div style={{ padding: "16px", maxWidth: "600px" }}>
        {/* Hidden: trigger cross-space wish startup (CT-1090 workaround) */}
        <div style={{ display: "none" }}>
          {staticWish1}
          {staticWish2}
        </div>

        <h2>Wish Tag Test</h2>
        <p style={{ color: "#666", fontSize: "14px" }}>
          Testing if wish() works with multiple tags and dynamic queries.
        </p>

        <hr />

        <h3>Test 1: Static wish for #testTag1</h3>
        <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "6px", marginBottom: "16px" }}>
          <div>Has Result: {derive(staticResult1, (r) => r.hasResult ? "Yes" : "No")}</div>
          <div>Value: {derive(staticResult1, (r) => r.value)}</div>
          <div>Error: {derive(staticResult1, (r) => r.error || "None")}</div>
        </div>

        <h3>Test 2: Static wish for #testTag2</h3>
        <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "6px", marginBottom: "16px" }}>
          <div>Has Result: {derive(staticResult2, (r) => r.hasResult ? "Yes" : "No")}</div>
          <div>Value: {derive(staticResult2, (r) => r.value)}</div>
          <div>Error: {derive(staticResult2, (r) => r.error || "None")}</div>
        </div>

        <h3>Test 3: Dynamic Tag Selection</h3>
        <div style={{ padding: "12px", background: "#fff3cd", borderRadius: "6px", marginBottom: "16px" }}>
          <p style={{ fontSize: "14px", color: "#856404" }}>
            Note: wish() doesn't accept reactive queries directly.
            The query is evaluated once at pattern instantiation.
          </p>
          <div style={{ marginTop: "8px" }}>
            Current selected tag: <code>{selectedTag}</code>
          </div>
          <ct-select
            $value={selectedTag}
            items={[
              { label: "#testTag1", value: "#testTag1" },
              { label: "#testTag2", value: "#testTag2" },
              { label: "#googleAuth", value: "#googleAuth" },
            ]}
          />
          <p style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
            Changing this won't re-evaluate wish() - need to test if there's a workaround.
          </p>
        </div>

        <hr />

        <h3>Instructions</h3>
        <ol style={{ fontSize: "14px" }}>
          <li>Deploy the MultiTagPattern first (or favorite an existing #googleAuth charm)</li>
          <li>Favorite it in the shell</li>
          <li>Deploy this test pattern</li>
          <li>Observe which tests show "Has Result: Yes"</li>
        </ol>

        <h3>Expected Results</h3>
        <ul style={{ fontSize: "14px" }}>
          <li>Test 1 & 2 should BOTH find the same MultiTagPattern if multi-tag works</li>
          <li>If only Test 1 works, multiple tags may not be supported</li>
          <li>Dynamic tag selection likely won't work reactively</li>
        </ul>
      </div>
    ),
    selectedTag,
    testResults,
  };
});

export default WishTagTest;
