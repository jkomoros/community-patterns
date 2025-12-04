/// <cts-enable />
/**
 * Test Pattern: Verify if wish() can take a reactive/Cell query
 *
 * This test actually passes a Cell<string> to wish({ query: ... })
 * to see if changing the query re-evaluates the wish.
 */
import {
  Cell,
  Default,
  derive,
  handler,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

interface TestInput {
  selectedTag: Default<string, "#testTag1">;
}

// Type for what we expect from the multi-tag-source pattern
type MultiTagOutput = {
  value: string;
  createdAt: number;
};

const ReactiveWishTest = pattern<TestInput>(({ selectedTag }) => {
  // TEST: Pass the Cell directly to wish query
  // If reactive wishes work, changing selectedTag should find different charms
  const wishResult = wish<MultiTagOutput>({ query: selectedTag });

  // Extract result info
  const wishInfo = derive(wishResult, (wr) => ({
    hasResult: !!wr?.result,
    value: wr?.result?.value || "N/A",
    error: wr?.error || null,
  }));

  // Handler to change the selected tag
  const setTag1 = handler<unknown, { tag: Cell<string> }>((_, { tag }) => {
    tag.set("#testTag1");
  });

  const setTag2 = handler<unknown, { tag: Cell<string> }>((_, { tag }) => {
    tag.set("#testTag2");
  });

  const setGoogleAuth = handler<unknown, { tag: Cell<string> }>((_, { tag }) => {
    tag.set("#googleAuth");
  });

  const setPlusTag = handler<unknown, { tag: Cell<string> }>((_, { tag }) => {
    tag.set("#testGmail+Calendar");
  });

  return {
    [NAME]: "Reactive Wish Test",
    [UI]: (
      <div style={{ padding: "16px", maxWidth: "600px" }}>
        {/* Hidden: trigger cross-space wish startup (CT-1090 workaround) */}
        <div style={{ display: "none" }}>{wishResult}</div>

        <h2>Reactive Wish Test</h2>
        <p style={{ color: "#666", fontSize: "14px" }}>
          Testing if wish() re-evaluates when query Cell changes.
        </p>

        <div style={{
          padding: "16px",
          background: "#f0f9ff",
          borderRadius: "8px",
          marginBottom: "16px"
        }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Current Query</h3>
          <div style={{ marginBottom: "12px" }}>
            <strong>Selected Tag:</strong> <code>{selectedTag}</code>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <button onClick={setTag1({ tag: selectedTag })}>#testTag1</button>
            <button onClick={setTag2({ tag: selectedTag })}>#testTag2</button>
            <button onClick={setGoogleAuth({ tag: selectedTag })}>#googleAuth</button>
            <button onClick={setPlusTag({ tag: selectedTag })}>#testGmail+Calendar</button>
          </div>

          <h3 style={{ margin: "0 0 12px 0" }}>Wish Result</h3>
          <div style={{
            padding: "12px",
            background: "white",
            borderRadius: "6px",
            border: "1px solid #e2e8f0"
          }}>
            <div>Has Result: <strong>{derive(wishInfo, (i) => i.hasResult ? "Yes" : "No")}</strong></div>
            <div>Value: <strong>{derive(wishInfo, (i) => i.value)}</strong></div>
            <div>Error: <strong>{derive(wishInfo, (i) => i.error || "None")}</strong></div>
          </div>
        </div>

        <div style={{
          padding: "16px",
          background: "#fef3c7",
          borderRadius: "8px",
          fontSize: "14px"
        }}>
          <h3 style={{ margin: "0 0 8px 0" }}>How to Test</h3>
          <ol style={{ margin: "0", paddingLeft: "20px" }}>
            <li>Make sure multi-tag-source charm is favorited (has #testTag1 and #testTag2)</li>
            <li>Click the buttons above to change the query tag</li>
            <li>Watch if "Has Result" changes when switching tags</li>
            <li>If result updates reactively, reactive wishes WORK</li>
            <li>If result stays the same, reactive wishes DON'T work</li>
          </ol>
        </div>

        <div style={{
          marginTop: "16px",
          padding: "12px",
          background: "#f8f9fa",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#666"
        }}>
          <strong>Technical Note:</strong> This test passes <code>selectedTag</code> (a Cell)
          directly to <code>wish(&#123; query: selectedTag &#125;)</code>. If the framework
          unwraps cells in wish parameters reactively, changing the tag should re-evaluate the wish.
        </div>
      </div>
    ),
    selectedTag,
    wishResult,
  };
});

export default ReactiveWishTest;
