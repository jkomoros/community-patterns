/// <cts-enable />
import {
  _ifElse,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  NAME,
  pattern,
  safeDateNow,
  str,
  UI,
  Writable,
} from "commonfabric";

/**
 * Performance Test: computed() with closures vs derive() with explicit params
 *
 * This pattern tests the reactive overhead difference between:
 * - Version A: computed() that closes over 14 cells
 * - Version B: derive() with 14 explicitly listed parameters
 *
 * Both versions call the same generateObject() API, so LLM time is constant.
 * We're measuring only the reactive system overhead.
 */

type Input = {
  // 14 input fields to match person.tsx complexity
  field1: Default<string, "">;
  field2: Default<string, "">;
  field3: Default<string, "">;
  field4: Default<string, "">;
  field5: Default<string, "">;
  field6: Default<string, "">;
  field7: Default<string, "">;
  field8: Default<string, "">;
  field9: Default<string, "">;
  field10: Default<string, "">;
  field11: Default<string, "">;
  field12: Default<string, "">;
  field13: Default<string, "">;
  field14: Default<string, "">;

  // Mode selector
  useDerive: Default<boolean, false>;

  // Trigger for computation
  computeTrigger: Default<number, 0>;
};

type Output = Input & {
  result: string;
};

// Handler to trigger computation
const triggerCompute = handler<
  Record<string, never>,
  { computeTrigger: Writable<number> }
>(
  (_, { computeTrigger }) => {
    computeTrigger.set(computeTrigger.get() + 1);
  },
);

// Handler to toggle mode
const toggleMode = handler<
  Record<string, never>,
  { useDerive: Writable<boolean> }
>(
  (_, { useDerive }) => {
    useDerive.set(!useDerive.get());
  },
);

// Handler to update field
const updateField = handler<
  { detail: { value: string } },
  { field: Writable<string> }
>(
  ({ detail }, { field }) => {
    field.set(detail?.value ?? "");
  },
);

const TestPattern = pattern<Input, Output>(
  "TestPattern",
  ({
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8,
    field9,
    field10,
    field11,
    field12,
    field13,
    field14,
    useDerive,
    computeTrigger,
  }) => {
    // Create a prompt that depends on the trigger (to force re-computation)
    const promptBase = Writable.of<string>(
      "Summarize the following fields concisely in one sentence:",
    );

    // Construct the full prompt in a computed cell
    const fullPrompt = computed(() => {
      const trigger = computeTrigger; // Force dependency
      return `${promptBase.get()}\n- Field 1: ${field1}\n- Field 2: ${field2}\n- Field 3: ${field3}\n- Field 4: ${field4}\n- Field 5: ${field5}\n- Field 6: ${field6}\n- Field 7: ${field7}\n- Field 8: ${field8}\n- Field 9: ${field9}\n- Field 10: ${field10}\n- Field 11: ${field11}\n- Field 12: ${field12}\n- Field 13: ${field13}\n- Field 14: ${field14}\n(Trigger: ${trigger})`;
    });

    // VERSION A: computed() with closures (reads 14 cells via closure)
    const resultWithComputed = computed(() => {
      if (useDerive) return null;

      const startTime = safeDateNow();
      console.log(
        "[Version A - computed()] Starting computation with closures...",
      );

      // This computed() closes over all 14 field cells
      // The reactive system must track dependencies for each closed-over cell
      const result = generateObject({
        model: "anthropic:claude-sonnet-4-5",
        prompt: fullPrompt,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            computationTime: { type: "number" },
          },
        },
      });

      const reactiveOverhead = safeDateNow() - startTime;
      console.log(
        `[Version A - computed()] Reactive overhead: ${
          reactiveOverhead.toFixed(2)
        }ms`,
      );

      return result.result;
    });

    // VERSION B: derive() with explicit parameters (14 explicit deps)
    const resultWithDerive = derive(
      {
        field1,
        field2,
        field3,
        field4,
        field5,
        field6,
        field7,
        field8,
        field9,
        field10,
        field11,
        field12,
        field13,
        field14,
        prompt: fullPrompt,
        shouldCompute: computed(() => useDerive),
      },
      (params) => {
        if (!params.shouldCompute) return null;

        const startTime = safeDateNow();
        console.log(
          "[Version B - derive()] Starting computation with explicit params...",
        );

        // This derive() has explicit dependencies listed
        // The reactive system knows exactly what to track
        const result = generateObject({
          model: "anthropic:claude-sonnet-4-5",
          prompt: params.prompt,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              computationTime: { type: "number" },
            },
          },
        });

        const reactiveOverhead = safeDateNow() - startTime;
        console.log(
          `[Version B - derive()] Reactive overhead: ${
            reactiveOverhead.toFixed(2)
          }ms`,
        );

        return result.result;
      },
    );

    // Select which result to display based on mode
    const activeResult = computed(() => {
      if (useDerive) {
        return resultWithDerive;
      } else {
        return resultWithComputed;
      }
    });

    // Format the result for display
    const displayResult = computed(() => {
      const result = activeResult;
      if (!result) {
        return "Click 'Run Test' to start computation";
      }
      if (typeof result === "object" && result !== null) {
        return `Summary: ${
          // deno-lint-ignore no-explicit-any
          (result as any).summary || "(pending)"
          // deno-lint-ignore no-explicit-any
        }\nComputation Time: ${(result as any).computationTime || "?"} ms`;
      }
      return JSON.stringify(result);
    });

    return {
      [NAME]: str`Performance Test: ${
        computed(() => useDerive ? "derive()" : "computed()")
      }`,
      [UI]: (
        <cf-screen>
          <div slot="header">
            <h2>computed() vs derive() Performance Test</h2>
          </div>

          <cf-vscroll flex showScrollbar>
            <cf-vstack
              style={{
                padding: "20px",
                gap: "16px",
                maxWidth: "800px",
                margin: "0 auto",
              }}
            >
              {/* Mode Toggle */}
              <cf-vstack
                style={{
                  gap: "8px",
                  padding: "16px",
                  background: "#f3f4f6",
                  borderRadius: "8px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "16px" }}>Test Mode</h3>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useDerive}
                    onChange={toggleMode({ useDerive })}
                  />
                  <span style={{ fontSize: "14px" }}>
                    {computed(() =>
                      useDerive
                        ? "Using derive() with explicit parameters"
                        : "Using computed() with closures"
                    )}
                  </span>
                </label>
                <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
                  Toggle to compare the two approaches. Check the browser
                  console for timing details.
                </p>
              </cf-vstack>

              {/* Input Fields */}
              <cf-vstack style={{ gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "16px" }}>
                  Input Fields (14 total)
                </h3>
                <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
                  Fill in some values to test with. Both versions will process
                  the same data.
                </p>

                <cf-vstack style={{ gap: "6px" }}>
                  <label style={{ fontSize: "13px" }}>
                    Field 1
                    <cf-input
                      value={field1}
                      oncf-input={updateField({ field: field1 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 2
                    <cf-input
                      value={field2}
                      oncf-input={updateField({ field: field2 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 3
                    <cf-input
                      value={field3}
                      oncf-input={updateField({ field: field3 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 4
                    <cf-input
                      value={field4}
                      oncf-input={updateField({ field: field4 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 5
                    <cf-input
                      value={field5}
                      oncf-input={updateField({ field: field5 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 6
                    <cf-input
                      value={field6}
                      oncf-input={updateField({ field: field6 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 7
                    <cf-input
                      value={field7}
                      oncf-input={updateField({ field: field7 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 8
                    <cf-input
                      value={field8}
                      oncf-input={updateField({ field: field8 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 9
                    <cf-input
                      value={field9}
                      oncf-input={updateField({ field: field9 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 10
                    <cf-input
                      value={field10}
                      oncf-input={updateField({ field: field10 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 11
                    <cf-input
                      value={field11}
                      oncf-input={updateField({ field: field11 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 12
                    <cf-input
                      value={field12}
                      oncf-input={updateField({ field: field12 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 13
                    <cf-input
                      value={field13}
                      oncf-input={updateField({ field: field13 })}
                      placeholder="Enter value..."
                    />
                  </label>
                  <label style={{ fontSize: "13px" }}>
                    Field 14
                    <cf-input
                      value={field14}
                      oncf-input={updateField({ field: field14 })}
                      placeholder="Enter value..."
                    />
                  </label>
                </cf-vstack>
              </cf-vstack>

              {/* Trigger Button */}
              <cf-button
                onClick={triggerCompute({ computeTrigger })}
                style={{ padding: "12px 24px", fontSize: "16px" }}
              >
                Run Test
              </cf-button>

              {/* Results */}
              <cf-vstack
                style={{
                  gap: "8px",
                  padding: "16px",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "16px" }}>Result</h3>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "monospace",
                  }}
                >
                  {displayResult}
                </pre>
                <p
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "12px",
                    color: "#666",
                  }}
                >
                  Check the browser console for detailed timing measurements.
                </p>
              </cf-vstack>

              {/* Explanation */}
              <cf-vstack
                style={{
                  gap: "8px",
                  padding: "16px",
                  background: "#fef3c7",
                  borderRadius: "8px",
                  border: "1px solid #fbbf24",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "16px" }}>
                  How This Test Works
                </h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  <li>
                    <strong>Version A (computed with closures):</strong>{" "}
                    Uses computed() that closes over all 14 field cells. The
                    reactive system must track each closure dependency
                    individually.
                  </li>
                  <li>
                    <strong>Version B (derive with explicit params):</strong>
                    {" "}
                    Uses derive() with all 14 fields explicitly listed as
                    parameters. The reactive system knows the exact dependency
                    graph upfront.
                  </li>
                  <li>
                    Both versions call the same generateObject() API, so LLM
                    time is identical.
                  </li>
                  <li>
                    The timing measurements show only the reactive system
                    overhead before the LLM call starts.
                  </li>
                  <li>
                    Expected result: derive() should show ~40-50% less blocking
                    time than computed().
                  </li>
                </ul>
              </cf-vstack>
            </cf-vstack>
          </cf-vscroll>
        </cf-screen>
      ),

      field1,
      field2,
      field3,
      field4,
      field5,
      field6,
      field7,
      field8,
      field9,
      field10,
      field11,
      field12,
      field13,
      field14,
      useDerive,
      computeTrigger,
      result: displayResult,
    };
  },
);

export default TestPattern;
