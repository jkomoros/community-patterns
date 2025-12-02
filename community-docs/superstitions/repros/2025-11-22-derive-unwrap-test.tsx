/// <cts-enable />
/**
 * Repro: derive() Object Parameter Cell Unwrapping
 *
 * CLAIM: Single Cell param is auto-unwrapped, object param is NOT
 */
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";

interface Input {
  flag: Default<boolean, false>;
  count: Default<number, 42>;
}

interface Output {
  [NAME]: string;
  [UI]: JSX.Element;
}

export default pattern<Input, Output>(
  ({ flag, count }) => {
    // Test 1: Single Cell - should auto-unwrap
    const singleCellResult = derive(flag, (value) => {
      // value should be boolean, not Cell
      const valueType = typeof value;
      const hasGet = value && typeof value === 'object' && 'get' in value;
      return `Single: type=${valueType}, hasGet=${hasGet}, value=${String(value)}`;
    });

    // Test 2: Object param - superstition claims this does NOT unwrap
    const objectResult = derive({ flag, count }, (values) => {
      const flagType = typeof values.flag;
      const flagHasGet = values.flag && typeof values.flag === 'object' && 'get' in values.flag;
      const countType = typeof values.count;
      const countHasGet = values.count && typeof values.count === 'object' && 'get' in values.count;

      // If superstition is correct, flagHasGet and countHasGet should be true
      // If disproved, they should be false (values auto-unwrapped)
      return `Object: flag.type=${flagType}, flag.hasGet=${flagHasGet}, count.type=${countType}, count.hasGet=${countHasGet}`;
    });

    // Handler to toggle flag
    const toggle = handler<unknown, { flag: Cell<boolean> }>(
      (_, { flag }) => {
        flag.set(!flag.get());
      }
    );

    return {
      [NAME]: "Derive Unwrap Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>derive() Cell Unwrapping Test</h2>

          <div style={{ marginBottom: "20px" }}>
            <button onClick={toggle({ flag })} style={{ padding: "10px 20px" }}>
              Toggle Flag (current: {flag ? "true" : "false"})
            </button>
          </div>

          <div style={{ background: "#f5f5f5", padding: "15px", borderRadius: "8px", marginBottom: "15px" }}>
            <h3>Test 1: Single Cell Parameter</h3>
            <p>Expected: type=boolean, hasGet=false (auto-unwrapped)</p>
            <p><strong>Result:</strong> {singleCellResult}</p>
          </div>

          <div style={{ background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Test 2: Object Parameter</h3>
            <p>Expected (if superstition true): hasGet=true (NOT unwrapped)</p>
            <p>Expected (if superstition false): hasGet=false (auto-unwrapped)</p>
            <p><strong>Result:</strong> {objectResult}</p>
          </div>

          <div style={{ marginTop: "20px", padding: "15px", background: "#d4edda", borderRadius: "8px" }}>
            <h3>Interpretation:</h3>
            <ul>
              <li>If Test 2 shows hasGet=true → Superstition CONFIRMED (must use .get())</li>
              <li>If Test 2 shows hasGet=false → Superstition DISPROVED (auto-unwraps)</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
