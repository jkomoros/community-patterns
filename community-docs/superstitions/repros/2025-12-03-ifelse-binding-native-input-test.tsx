/// <cts-enable />
/**
 * Repro: ifElse Input Binding - Native <input> vs <ct-input>
 *
 * Original superstition used native <input value={cell}>.
 * Previous test used <ct-input $value={cell}> and worked.
 *
 * This test compares both to see if the bug is specific to native inputs.
 */
import { Cell, Default, handler, ifElse, NAME, pattern, UI } from "commontools";

interface Input {
  showNative: Default<boolean, true>;
  showCtInput: Default<boolean, true>;
  nativeValue: Default<string, "">;
  ctValue: Default<string, "">;
  nativeResult: Default<string, "Not submitted yet">;
  ctResult: Default<string, "Not submitted yet">;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ showNative, showCtInput, nativeValue, ctValue, nativeResult, ctResult }) => {
    const submitNative = handler<unknown, { value: Cell<string>; result: Cell<string> }>(
      (_, { value, result }) => {
        const got = value.get();
        result.set(`Got: "${got}" (length: ${got.length})`);
      }
    );

    const submitCt = handler<unknown, { value: Cell<string>; result: Cell<string> }>(
      (_, { value, result }) => {
        const got = value.get();
        result.set(`Got: "${got}" (length: ${got.length})`);
      }
    );

    const toggleNative = handler<unknown, { show: Cell<boolean> }>(
      (_, { show }) => show.set(!show.get())
    );

    const toggleCt = handler<unknown, { show: Cell<boolean> }>(
      (_, { show }) => show.set(!show.get())
    );

    return {
      [NAME]: "ifElse Native vs ct-input Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>ifElse Binding: Native input vs ct-input</h2>

          <div style={{ marginBottom: "20px", background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Purpose</h3>
            <p>Compare native &lt;input&gt; vs &lt;ct-input&gt; in ifElse branches.</p>
            <p>Original superstition used native input with value={"{cell}"}</p>
          </div>

          {/* TEST: Native <input> */}
          <div style={{ marginBottom: "30px", border: "2px solid #f44336", padding: "15px", borderRadius: "8px" }}>
            <h3>Native &lt;input value={"{cell}"}&gt;</h3>
            <button
              onClick={toggleNative({ show: showNative })}
              style={{ marginBottom: "10px", padding: "8px 16px" }}
            >
              Toggle (currently: {showNative ? "visible" : "hidden"})
            </button>

            {ifElse(
              showNative,
              <div style={{ background: "#ffebee", padding: "15px", borderRadius: "8px" }}>
                <p><strong>Native input:</strong></p>
                <input
                  type="text"
                  value={nativeValue}
                  placeholder="Type here..."
                  style={{ width: "200px", marginRight: "10px", padding: "8px" }}
                />
                <button
                  onClick={submitNative({ value: nativeValue, result: nativeResult })}
                  style={{ padding: "8px 16px" }}
                >
                  Submit Native
                </button>
                <p style={{ marginTop: "10px", color: "#666" }}>
                  Cell value: "{nativeValue}"
                </p>
              </div>,
              <div style={{ background: "#eee", padding: "15px", borderRadius: "8px" }}>
                <p>Native input is hidden</p>
              </div>
            )}

            <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
              <strong>Native Result:</strong> {nativeResult}
            </div>
          </div>

          {/* TEST: <ct-input> */}
          <div style={{ marginBottom: "30px", border: "2px solid #4caf50", padding: "15px", borderRadius: "8px" }}>
            <h3>&lt;ct-input $value={"{cell}"}&gt;</h3>
            <button
              onClick={toggleCt({ show: showCtInput })}
              style={{ marginBottom: "10px", padding: "8px 16px" }}
            >
              Toggle (currently: {showCtInput ? "visible" : "hidden"})
            </button>

            {ifElse(
              showCtInput,
              <div style={{ background: "#e8f5e9", padding: "15px", borderRadius: "8px" }}>
                <p><strong>ct-input:</strong></p>
                <ct-input
                  $value={ctValue}
                  placeholder="Type here..."
                  style={{ width: "200px", marginRight: "10px" }}
                />
                <button
                  onClick={submitCt({ value: ctValue, result: ctResult })}
                  style={{ padding: "8px 16px" }}
                >
                  Submit ct-input
                </button>
                <p style={{ marginTop: "10px", color: "#666" }}>
                  Cell value: "{ctValue}"
                </p>
              </div>,
              <div style={{ background: "#eee", padding: "15px", borderRadius: "8px" }}>
                <p>ct-input is hidden</p>
              </div>
            )}

            <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
              <strong>ct-input Result:</strong> {ctResult}
            </div>
          </div>

          {/* Interpretation */}
          <div style={{ background: "#e3f2fd", padding: "15px", borderRadius: "8px" }}>
            <h3>Interpretation</h3>
            <ul>
              <li><strong>Native fails, ct-input works:</strong> Bug is specific to native inputs in ifElse</li>
              <li><strong>Both fail:</strong> Bug affects all inputs in ifElse</li>
              <li><strong>Both work:</strong> Bug may be context-specific or fixed</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
