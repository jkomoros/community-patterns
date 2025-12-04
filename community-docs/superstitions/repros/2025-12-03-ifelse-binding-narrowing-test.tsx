/// <cts-enable />
/**
 * Repro: ifElse Input Binding Narrowing Test
 *
 * Framework author (seefeldb) requested this test to narrow down
 * if the transformer is doing something unexpected.
 *
 * Test A: UI inline in ifElse (reported broken)
 * Test B: UI pulled out to variable (Berni's suggestion)
 *
 * If Test B works but Test A doesn't → transformer issue
 * If both fail → deeper runtime issue
 */
import { Cell, Default, handler, ifElse, NAME, pattern, UI } from "commontools";

interface Input {
  showInputA: Default<boolean, true>;
  showInputB: Default<boolean, true>;
  inputValueA: Default<string, "">;
  inputValueB: Default<string, "">;
  resultA: Default<string, "Not submitted yet">;
  resultB: Default<string, "Not submitted yet">;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ showInputA, showInputB, inputValueA, inputValueB, resultA, resultB }) => {
    // Handler to submit and show what value we got
    const submitA = handler<unknown, { value: Cell<string>; result: Cell<string> }>(
      (_, { value, result }) => {
        const got = value.get();
        result.set(`Got: "${got}" (length: ${got.length})`);
      }
    );

    const submitB = handler<unknown, { value: Cell<string>; result: Cell<string> }>(
      (_, { value, result }) => {
        const got = value.get();
        result.set(`Got: "${got}" (length: ${got.length})`);
      }
    );

    const toggleA = handler<unknown, { show: Cell<boolean> }>(
      (_, { show }) => show.set(!show.get())
    );

    const toggleB = handler<unknown, { show: Cell<boolean> }>(
      (_, { show }) => show.set(!show.get())
    );

    // TEST B: Pull UI out to variable (Berni's suggestion)
    const inputUIB = (
      <div style={{ background: "#e8f5e9", padding: "15px", borderRadius: "8px" }}>
        <p><strong>Input B (pulled out):</strong></p>
        <ct-input
          $value={inputValueB}
          placeholder="Type here..."
          style={{ width: "200px", marginRight: "10px" }}
        />
        <button
          onClick={submitB({ value: inputValueB, result: resultB })}
          style={{ padding: "8px 16px" }}
        >
          Submit B
        </button>
        <p style={{ marginTop: "10px", color: "#666" }}>
          Current cell value: "{inputValueB}"
        </p>
      </div>
    );

    return {
      [NAME]: "ifElse Binding Narrowing Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>ifElse Input Binding Narrowing Test</h2>

          <div style={{ marginBottom: "20px", background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Purpose</h3>
            <p>Test if pulling UI out of ifElse changes binding behavior.</p>
            <ul>
              <li><strong>Test A:</strong> UI inline in ifElse (reported broken)</li>
              <li><strong>Test B:</strong> UI pulled out to variable first</li>
            </ul>
          </div>

          {/* TEST A: Inline UI in ifElse */}
          <div style={{ marginBottom: "30px", border: "2px solid #f44336", padding: "15px", borderRadius: "8px" }}>
            <h3>Test A: UI Inline in ifElse</h3>
            <button
              onClick={toggleA({ show: showInputA })}
              style={{ marginBottom: "10px", padding: "8px 16px" }}
            >
              Toggle A (currently: {showInputA ? "visible" : "hidden"})
            </button>

            {ifElse(
              showInputA,
              // INLINE UI - this is the pattern that's reported broken
              <div style={{ background: "#ffebee", padding: "15px", borderRadius: "8px" }}>
                <p><strong>Input A (inline):</strong></p>
                <ct-input
                  $value={inputValueA}
                  placeholder="Type here..."
                  style={{ width: "200px", marginRight: "10px" }}
                />
                <button
                  onClick={submitA({ value: inputValueA, result: resultA })}
                  style={{ padding: "8px 16px" }}
                >
                  Submit A
                </button>
                <p style={{ marginTop: "10px", color: "#666" }}>
                  Current cell value: "{inputValueA}"
                </p>
              </div>,
              <div style={{ background: "#eee", padding: "15px", borderRadius: "8px" }}>
                <p>Input A is hidden</p>
              </div>
            )}

            <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
              <strong>Result A:</strong> {resultA}
            </div>
          </div>

          {/* TEST B: UI pulled out to variable */}
          <div style={{ marginBottom: "30px", border: "2px solid #4caf50", padding: "15px", borderRadius: "8px" }}>
            <h3>Test B: UI Pulled Out to Variable</h3>
            <button
              onClick={toggleB({ show: showInputB })}
              style={{ marginBottom: "10px", padding: "8px 16px" }}
            >
              Toggle B (currently: {showInputB ? "visible" : "hidden"})
            </button>

            {ifElse(
              showInputB,
              // PULLED OUT UI - Berni's suggestion
              inputUIB,
              <div style={{ background: "#eee", padding: "15px", borderRadius: "8px" }}>
                <p>Input B is hidden</p>
              </div>
            )}

            <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
              <strong>Result B:</strong> {resultB}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ background: "#e3f2fd", padding: "15px", borderRadius: "8px" }}>
            <h3>How to Test</h3>
            <ol>
              <li>Type something in Input A, click Submit A</li>
              <li>Type something in Input B, click Submit B</li>
              <li>Compare results:</li>
            </ol>
            <ul>
              <li><strong>If A fails but B works:</strong> Transformer issue (inline JSX)</li>
              <li><strong>If both fail:</strong> Deeper runtime issue with ifElse</li>
              <li><strong>If both work:</strong> Bug may be fixed or context-specific</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
