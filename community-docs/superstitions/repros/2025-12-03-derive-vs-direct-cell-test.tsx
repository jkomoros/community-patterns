/// <cts-enable />
/**
 * Repro: derive() vs Direct Cell Access in generateObject
 *
 * Two conflicting superstitions:
 * - 2025-11-25: DON'T use derive() - causes race conditions
 * - 2025-11-29: USE derive() - direct access leaves .result undefined
 *
 * This test compares both approaches in two contexts:
 * 1. User input (typing in real-time)
 * 2. Static data in map()
 */
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";
import { generateObject } from "commontools";

// Simple schema for testing
interface Sentiment {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
}

interface TestItem {
  id: number;
  text: string;
}

const TEST_ITEMS: TestItem[] = [
  { id: 1, text: "I love this product!" },
  { id: 2, text: "This is terrible." },
  { id: 3, text: "It's okay I guess." },
];

interface Input {
  // User input test
  userInput: Default<string, "Hello world">;

  // Static data test
  items: Default<TestItem[], []>;

  // Results tracking
  log: Default<string[], []>;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ userInput, items, log }) => {
    const SYSTEM = "Analyze the sentiment of the text. Return positive, negative, or neutral with confidence 0-1.";

    // Test A: Direct Cell access for user input
    const directUserResult = generateObject<Sentiment>({
      model: "anthropic:claude-haiku-4-5",
      system: SYSTEM,
      prompt: userInput, // Direct Cell
    });

    // Test B: derive() wrapper for user input
    const deriveUserResult = generateObject<Sentiment>({
      model: "anthropic:claude-haiku-4-5",
      system: SYSTEM,
      prompt: derive(userInput, (text) => text ?? ""),
    });

    // Test C: Direct property access in map
    const directMapResults = items.map((item) => ({
      id: item.id,
      result: generateObject<Sentiment>({
        model: "anthropic:claude-haiku-4-5",
        system: SYSTEM,
        prompt: item.text, // Direct property access
      }),
    }));

    // Test D: derive() wrapper in map
    const deriveMapResults = items.map((item) => ({
      id: item.id,
      result: generateObject<Sentiment>({
        model: "anthropic:claude-haiku-4-5",
        system: SYSTEM,
        prompt: derive(item, (i) => i?.text ?? ""),
      }),
    }));

    const loadItems = handler<unknown, { items: Cell<TestItem[]>; log: Cell<string[]> }>(
      (_, { items, log }) => {
        log.push("Loading items...");
        for (const item of TEST_ITEMS) {
          items.push(item);
        }
        log.push(`Loaded ${TEST_ITEMS.length} items`);
      }
    );

    const logMessage = handler<unknown, { msg: string; log: Cell<string[]> }>(
      (_, { msg, log }) => log.push(msg)
    );

    const clearLog = handler<unknown, { log: Cell<string[]> }>(
      (_, { log }) => log.set([])
    );

    return {
      [NAME]: "derive vs Direct Cell Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>derive() vs Direct Cell Access in generateObject</h2>

          <div style={{ marginBottom: "20px", background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Conflicting Superstitions</h3>
            <ul>
              <li><strong>2025-11-25:</strong> DON'T use derive() - causes race conditions</li>
              <li><strong>2025-11-29:</strong> USE derive() - direct access leaves .result undefined</li>
            </ul>
          </div>

          {/* User Input Tests */}
          <div style={{ marginBottom: "30px", border: "2px solid #2196f3", padding: "15px", borderRadius: "8px" }}>
            <h3>User Input Tests</h3>
            <p>Type below and watch both results:</p>
            <ct-input
              $value={userInput}
              placeholder="Type something..."
              style={{ width: "300px", marginBottom: "10px" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "10px" }}>
              <div style={{ background: "#ffebee", padding: "10px", borderRadius: "8px" }}>
                <h4>A: Direct Cell</h4>
                <p>pending: {directUserResult.pending ? "true" : "false"}</p>
                <p>result: {JSON.stringify(directUserResult.result)}</p>
              </div>
              <div style={{ background: "#e8f5e9", padding: "10px", borderRadius: "8px" }}>
                <h4>B: derive() Wrapper</h4>
                <p>pending: {deriveUserResult.pending ? "true" : "false"}</p>
                <p>result: {JSON.stringify(deriveUserResult.result)}</p>
              </div>
            </div>
          </div>

          {/* Map Tests */}
          <div style={{ marginBottom: "30px", border: "2px solid #9c27b0", padding: "15px", borderRadius: "8px" }}>
            <h3>Map Tests (Static Data)</h3>
            <button
              onClick={loadItems({ items, log })}
              style={{ padding: "8px 16px" }}
            >
              Load Test Items
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "15px" }}>
              <div style={{ background: "#ffebee", padding: "10px", borderRadius: "8px" }}>
                <h4>C: Direct Property in map()</h4>
                {directMapResults.map((item) => (
                  <div key={item.id} style={{ marginBottom: "5px", fontSize: "12px" }}>
                    [{item.id}] pending={item.result.pending ? "T" : "F"}, result={JSON.stringify(item.result.result)}
                  </div>
                ))}
              </div>
              <div style={{ background: "#e8f5e9", padding: "10px", borderRadius: "8px" }}>
                <h4>D: derive() in map()</h4>
                {deriveMapResults.map((item) => (
                  <div key={item.id} style={{ marginBottom: "5px", fontSize: "12px" }}>
                    [{item.id}] pending={item.result.pending ? "T" : "F"}, result={JSON.stringify(item.result.result)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Log Output */}
          <div style={{ background: "#f5f5f5", padding: "15px", borderRadius: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Log</h3>
              <button onClick={clearLog({ log })} style={{ padding: "4px 8px" }}>Clear</button>
            </div>
            <pre style={{ fontSize: "12px", maxHeight: "200px", overflow: "auto" }}>
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </div>

          {/* Interpretation */}
          <div style={{ marginTop: "20px", background: "#e3f2fd", padding: "15px", borderRadius: "8px" }}>
            <h3>What to Look For</h3>
            <ul>
              <li><strong>Race condition:</strong> Result stays "pending" forever despite typing</li>
              <li><strong>Undefined result:</strong> pending=false but result=undefined</li>
              <li><strong>Working:</strong> pending=false and result has sentiment data</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
