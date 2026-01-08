/// <cts-enable />
/**
 * @title generateObject Performance Repro
 * @description Minimal repro for CPU spike during LLM extraction
 *
 * PROBLEM: generateObject with 14+ field schema causes ~60 second CPU freeze
 * AFTER the LLM responds. This pattern tests a 14-field schema to reproduce.
 *
 * HOW TO REPRODUCE:
 * 1. Deploy this pattern
 * 2. Click "Run Extraction" button
 * 3. Watch console for timing logs
 * 4. Note: UI will freeze during the spike
 *
 * SUSPECTED ROOT CAUSE:
 * - `intern()` in memory/reference.ts - JSON.stringify on every nested object
 * - `claim()` - called excessively during LLM result processing
 */
import {
  generateObject,
  pattern,
  UI,
  NAME,
  toSchema,
  Writable,
  computed,
  handler,
} from "commontools";

// Handler to trigger extraction
const triggerExtraction = handler<
  Record<string, never>,
  { trigger: Writable<string>; startTimeMs: Writable<number>; elapsedMs: Writable<number | null> }
>(
  (_, { trigger, startTimeMs, elapsedMs }) => {
    console.log("[PERF] Starting 14-field extraction...");
    console.log("[PERF] Start time:", Date.now());
    startTimeMs.set(Date.now());
    elapsedMs.set(null);
    trigger.set(`---EXTRACT-${Date.now()}---`);
  },
);

// 14-field schema (matches person.tsx extraction - should cause ~60s spike)
interface ExtractionResult {
  field1: string;
  field2: string;
  field3: string;
  field4: string;
  field5: string;
  field6: string;
  field7: string;
  field8: string;
  field9: string;
  field10: string;
  field11: string;
  field12: string;
  field13: string;
  field14: string;
}

export default pattern(() => {
  // Trigger for extraction
  const trigger = Writable.of<string>("");
  const startTimeMs = Writable.of<number>(0);
  const elapsedMs = Writable.of<number | null>(null);

  // Guarded prompt - only triggers when explicitly set
  const guardedPrompt = computed(() => {
    const t = trigger.get();
    if (t && t.includes("---EXTRACT-")) {
      return t;
    }
    return undefined;
  });

  // The extraction call
  const result = generateObject({
    system:
      "You are a test assistant. Generate exactly 14 fields with short sentences.",
    prompt: guardedPrompt,
    model: "anthropic:claude-sonnet-4-5",
    schema: toSchema<ExtractionResult>(),
  });

  // Track when result arrives
  const timingCheck = computed(() => {
    const start = startTimeMs.get();
    if (!start) return null;

    if (!result.pending && result.result) {
      const elapsed = Date.now() - start;
      console.log(`[PERF] 14 fields extraction completed in ${elapsed}ms`);
      // Only update if we haven't recorded yet
      if (elapsedMs.get() === null) {
        elapsedMs.set(elapsed);
      }
      return elapsed;
    }
    return null;
  });

  return {
    [NAME]: "generateObject Perf Repro",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>generateObject Performance Repro</h1>

        <div
          style={{
            backgroundColor: "#fef3c7",
            padding: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <strong>⚠️ PROBLEM:</strong> generateObject with 14+ field schema
          causes ~60 second CPU freeze AFTER the LLM responds.
        </div>

        <ct-button
          onClick={triggerExtraction({ trigger, startTimeMs, elapsedMs })}
        >
          Run 14-Field Extraction
        </ct-button>

        <h2>Status</h2>
        {!trigger.get() ? (
          <p>Click the button to start extraction</p>
        ) : result.pending ? (
          <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem" }}>
            ⏳ Extracting... (check console for timing)
          </div>
        ) : result.error ? (
          <div style={{ backgroundColor: "#fee2e2", padding: "0.5rem" }}>
            ❌ Error: {String(result.error)}
          </div>
        ) : result.result ? (
          <div style={{ backgroundColor: "#d1fae5", padding: "0.5rem" }}>
            <p>
              <strong>✅ Completed!</strong>
            </p>
            {elapsedMs.get() !== null && (
              <p>
                <strong>Time:</strong> {elapsedMs.get()}ms (
                {((elapsedMs.get() ?? 0) / 1000).toFixed(1)}s)
              </p>
            )}
            <pre style={{ fontSize: "0.8rem", overflow: "auto" }}>
              {JSON.stringify(result.result, null, 2)}
            </pre>
          </div>
        ) : null}

        <h2>Debugging Steps</h2>
        <ol>
          <li>Open Chrome DevTools Console (F12)</li>
          <li>Click the extraction button</li>
          <li>
            Watch for <code>[PERF]</code> log messages
          </li>
          <li>Note: UI will freeze during the CPU spike</li>
          <li>
            Run Performance profiler to see <code>intern()</code> and{" "}
            <code>claim()</code> calls
          </li>
        </ol>

        <h2>Expected Behavior</h2>
        <ul>
          <li>
            <strong>LLM response:</strong> ~5 seconds (fast)
          </li>
          <li>
            <strong>Framework processing:</strong> ~60 seconds (the bug)
          </li>
          <li>
            <strong>Total time:</strong> ~65 seconds
          </li>
        </ul>

        <h2>Technical Details</h2>
        <p>
          The CPU spike happens AFTER the LLM response arrives, during framework
          processing in <code>intern()</code> and <code>claim()</code> functions
          in <code>memory/reference.ts</code>.
        </p>
        <p>
          DERIVE DEBUG SUMMARY will show <code>total=0</code> because the
          blocking is NOT in the reactive system.
        </p>
      </div>
    ),
  };
});
