/// <cts-enable />
/**
 * Repro: derive() Object Parameter - Types vs Runtime
 *
 * Q2 from PR #93: Does runtime auto-unwrap Cells when TypeScript says Cell?
 *
 * The superstition says object params DON'T auto-unwrap (need .get()).
 * But PR showed runtime DOES auto-unwrap (no .get() needed).
 *
 * This test verifies current behavior.
 */
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";

interface Input {
  flag: Default<boolean, true>;
  count: Default<number, 42>;
  log: Default<string[], []>;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ flag, count, log }) => {
    // Test A: Single Cell derive - should auto-unwrap
    const singleResult = derive(flag, (value) => {
      return {
        type: typeof value,
        hasGet: typeof (value as any)?.get === "function",
        value: String(value),
      };
    });

    // Test B: Object param derive - does it auto-unwrap?
    const objectResult = derive({ flag, count }, (values) => {
      const flagType = typeof values.flag;
      const countType = typeof values.count;
      const flagHasGet = typeof (values.flag as any)?.get === "function";
      const countHasGet = typeof (values.count as any)?.get === "function";

      // Try to use values directly (without .get())
      let directWorks = false;
      let directValue = "";
      try {
        // If auto-unwrapped, this should work without errors
        // @ts-ignore - intentionally ignoring type error to test runtime
        const result = values.flag ? values.count * 2 : 0;
        directWorks = true;
        directValue = String(result);
      } catch (e) {
        directWorks = false;
        directValue = String(e);
      }

      return {
        flagType,
        countType,
        flagHasGet,
        countHasGet,
        directWorks,
        directValue,
      };
    });

    const addLog = handler<unknown, { msg: string; log: Cell<string[]> }>(
      (_, { msg, log }) => log.push(msg)
    );

    const clearLog = handler<unknown, { log: Cell<string[]> }>(
      (_, { log }) => log.set([])
    );

    const toggleFlag = handler<unknown, { flag: Cell<boolean> }>(
      (_, { flag }) => flag.set(!flag.get())
    );

    const incrementCount = handler<unknown, { count: Cell<number> }>(
      (_, { count }) => count.set(count.get() + 1)
    );

    return {
      [NAME]: "derive() Types vs Runtime Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>derive() Object Parameter: Types vs Runtime</h2>

          <div style={{ marginBottom: "20px", background: "#fff3cd", padding: "15px", borderRadius: "8px" }}>
            <h3>Q2 from PR #93</h3>
            <p><strong>Superstition:</strong> Object params DON'T auto-unwrap (need .get())</p>
            <p><strong>PR showed:</strong> Runtime DOES auto-unwrap (no .get() needed)</p>
            <p><strong>Berni:</strong> "If they're Cell, bug that they get unwrapped... TS and runtime shouldn't disagree"</p>
          </div>

          {/* Current values */}
          <div style={{ marginBottom: "20px", padding: "15px", border: "1px solid #ccc", borderRadius: "8px" }}>
            <h3>Current Values</h3>
            <p>flag: {flag ? "true" : "false"}</p>
            <p>count: {count}</p>
            <button onClick={toggleFlag({ flag })} style={{ marginRight: "10px", padding: "8px 16px" }}>
              Toggle Flag
            </button>
            <button onClick={incrementCount({ count })} style={{ padding: "8px 16px" }}>
              Increment Count
            </button>
          </div>

          {/* Test A: Single Cell */}
          <div style={{ marginBottom: "20px", border: "2px solid #2196f3", padding: "15px", borderRadius: "8px" }}>
            <h3>Test A: Single Cell derive(flag, ...)</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>typeof value</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{singleResult.type}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>hasGet()</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{singleResult.hasGet ? "YES (Cell)" : "NO (unwrapped)"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>value</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{singleResult.value}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Test B: Object param */}
          <div style={{ marginBottom: "20px", border: "2px solid #9c27b0", padding: "15px", borderRadius: "8px" }}>
            <h3>Test B: Object param derive({"{"} flag, count {"}"}, ...)</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>flag typeof</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{objectResult.flagType}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>flag hasGet()</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{objectResult.flagHasGet ? "YES (Cell)" : "NO (unwrapped)"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>count typeof</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{objectResult.countType}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>count hasGet()</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{objectResult.countHasGet ? "YES (Cell)" : "NO (unwrapped)"}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>Direct use works?</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px", background: objectResult.directWorks ? "#c8e6c9" : "#ffcdd2" }}>
                    {objectResult.directWorks ? "YES" : "NO"}
                  </td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>Result (flag ? count*2 : 0)</td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>{objectResult.directValue}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Interpretation */}
          <div style={{ background: "#e3f2fd", padding: "15px", borderRadius: "8px" }}>
            <h3>Interpretation</h3>
            <ul>
              <li><strong>hasGet = NO:</strong> Values are auto-unwrapped (runtime disagrees with TS types)</li>
              <li><strong>hasGet = YES:</strong> Values are Cells (runtime agrees with TS types)</li>
              <li><strong>Direct use works = YES:</strong> Can use values without .get() (auto-unwrapped)</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
