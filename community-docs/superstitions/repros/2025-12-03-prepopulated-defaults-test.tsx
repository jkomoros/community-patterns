/// <cts-enable />
/**
 * Repro: Pre-populated Defaults + generateObject in map()
 *
 * Q6 from PR #93: generateObject in map() fails with pre-populated defaults
 *
 * Berni: "default propagation bug, hopefully Robin's bug fixes it"
 *
 * Test A: Pre-populated default (reported broken)
 * Test B: Empty default + handler (reported working)
 */
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";
import { generateObject } from "commontools";

interface Sentiment {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
}

interface TestItem {
  id: number;
  text: string;
}

// Pre-populated test data
const TEST_ITEMS: TestItem[] = [
  { id: 1, text: "I love this product!" },
  { id: 2, text: "This is terrible." },
  { id: 3, text: "It's okay I guess." },
] as const;

interface Input {
  // Test A: Pre-populated default (reported broken)
  prepopItems: Default<TestItem[], typeof TEST_ITEMS>;

  // Test B: Empty default (reported working)
  handlerItems: Default<TestItem[], []>;

  log: Default<string[], []>;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ prepopItems, handlerItems, log }) => {
    const SYSTEM = "Analyze sentiment. Return positive/negative/neutral with confidence 0-1.";

    // Test A: Map over pre-populated default
    const prepopResults = prepopItems.map((item) => ({
      id: item.id,
      text: item.text,
      result: generateObject<Sentiment>({
        model: "anthropic:claude-haiku-4-5",
        system: SYSTEM,
        prompt: item.text,
      }),
    }));

    // Test B: Map over handler-loaded items
    const handlerResults = handlerItems.map((item) => ({
      id: item.id,
      text: item.text,
      result: generateObject<Sentiment>({
        model: "anthropic:claude-haiku-4-5",
        system: SYSTEM,
        prompt: item.text,
      }),
    }));

    const loadItems = handler<unknown, { items: Cell<TestItem[]>; log: Cell<string[]> }>(
      (_, { items, log }) => {
        log.push("Loading items via handler...");
        for (const item of TEST_ITEMS) {
          items.push(item);
        }
        log.push(`Loaded ${TEST_ITEMS.length} items`);
      }
    );

    const clearLog = handler<unknown, { log: Cell<string[]> }>(
      (_, { log }) => log.set([])
    );

    return {
      [NAME]: "Pre-populated Defaults Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Pre-populated Defaults + generateObject in map()</h2>

          <div style={{ marginBottom: "20px", background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Q6 from PR #93</h3>
            <p><strong>Superstition:</strong> Pre-populated defaults fail, empty + handler works</p>
            <p><strong>Berni:</strong> "default propagation bug, hopefully Robin's bug fixes it"</p>
          </div>

          {/* Test A: Pre-populated */}
          <div style={{ marginBottom: "30px", border: "2px solid #f44336", padding: "15px", borderRadius: "8px" }}>
            <h3>Test A: Pre-populated Default</h3>
            <p>Items exist at pattern initialization time</p>
            <p>Item count: {prepopResults.length}</p>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
              <thead>
                <tr style={{ background: "#ffebee" }}>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>ID</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Text</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Pending</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {prepopResults.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: "1px solid #ccc", padding: "8px" }}>{item.id}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px", fontSize: "12px" }}>{item.text}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px" }}>{item.result.pending ? "T" : "F"}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px", fontSize: "12px" }}>
                      {JSON.stringify(item.result.result)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Test B: Handler-loaded */}
          <div style={{ marginBottom: "30px", border: "2px solid #4caf50", padding: "15px", borderRadius: "8px" }}>
            <h3>Test B: Empty Default + Handler</h3>
            <p>Items added via handler.push()</p>
            <button
              onClick={loadItems({ items: handlerItems, log })}
              style={{ padding: "8px 16px", marginBottom: "10px" }}
            >
              Load Items via Handler
            </button>
            <p>Item count: {handlerResults.length}</p>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
              <thead>
                <tr style={{ background: "#e8f5e9" }}>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>ID</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Text</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Pending</th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {handlerResults.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: "1px solid #ccc", padding: "8px" }}>{item.id}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px", fontSize: "12px" }}>{item.text}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px" }}>{item.result.pending ? "T" : "F"}</td>
                    <td style={{ border: "1px solid #ccc", padding: "8px", fontSize: "12px" }}>
                      {JSON.stringify(item.result.result)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Log */}
          <div style={{ background: "#f5f5f5", padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Log</h3>
              <button onClick={clearLog({ log })} style={{ padding: "4px 8px" }}>Clear</button>
            </div>
            <pre style={{ fontSize: "12px", maxHeight: "100px", overflow: "auto" }}>
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </div>

          {/* Interpretation */}
          <div style={{ background: "#e3f2fd", padding: "15px", borderRadius: "8px" }}>
            <h3>Interpretation</h3>
            <ul>
              <li><strong>Test A works:</strong> Robin's fix landed! Pre-populated defaults now work.</li>
              <li><strong>Test A fails:</strong> Bug still exists. Use empty default + handler workaround.</li>
              <li><strong>Both fail:</strong> Deeper issue with generateObject in map().</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
