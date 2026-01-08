/// <cts-enable />
/**
 * @title generateObject + Map Performance Repro
 * @description Minimal repro for CPU spike when generateObject result triggers nested map render
 *
 * ## Bug Summary
 *
 * When `generateObject()` completes and the result triggers a nested `.map()` render
 * via `ifElse()`, there's a ~30 second CPU spike. The same nested map renders
 * instantly when triggered by a simple cell update (see nested-map-perf-repro.tsx).
 *
 * ## Hypothesis
 *
 * The bug is in the **reactive cascade** when:
 * 1. generateObject result cell updates
 * 2. computed() cells derived from result update
 * 3. ifElse() switches branches based on result
 * 4. The new branch contains nested .map() that renders
 *
 * The combination of async result + ifElse + nested maps creates a perfect storm
 * of O(n²) scheduler operations.
 */
import {
  computed,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  Writable,
} from "commontools";

type Props = {
  notes: string;
};

// Type for nested data (must be outside pattern for JSX access)
type ChangeWithChunks = {
  field: string;
  value: string;
  chunks: Array<{ id: number; text: string }>;
};

// Trigger extraction
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Writable<string> }
>((_, { notes, extractTrigger }) => {
  extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
});

// Clear extraction
const clearExtraction = handler<
  Record<string, never>,
  { extractedData: Writable<any> }
>((_, { extractedData }) => {
  extractedData.set(null);
});

export default pattern<Props>(({ notes }) => {
  // Trigger cell for extraction
  const extractTrigger = Writable.of<string>("");

  // Guard the prompt (same pattern as person.tsx)
  const guardedPrompt = computed(() => {
    const trigger = extractTrigger.get();
    if (trigger && trigger.includes("---EXTRACT-")) {
      return trigger;
    }
    return undefined;
  });

  // Use generateObject to extract data (mimics person.tsx)
  const { result: extractionResult, pending: extractionPending } =
    generateObject({
      system: `Extract fields from the text. Return all fields you can find.`,
      prompt: guardedPrompt,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          field1: { type: "string" },
          field2: { type: "string" },
          field3: { type: "string" },
          field4: { type: "string" },
          field5: { type: "string" },
          field6: { type: "string" },
          field7: { type: "string" },
          field8: { type: "string" },
          field9: { type: "string" },
        },
      },
    });

  // Computed that transforms the result (like changesPreview in person.tsx)
  const changesPreview = computed(() => {
    const result = extractionResult;
    if (!result) return [];

    // Create change items for each field (mimics compareFields)
    const changes: Array<{ field: string; value: string }> = [];
    for (const [key, value] of Object.entries(result)) {
      if (value) {
        changes.push({ field: key, value: String(value) });
      }
    }
    return changes;
  });

  // Boolean for ifElse condition
  const hasResults = computed(() => {
    return changesPreview.length > 0;
  });

  // Simulate nested data for nested map (like notesDiffChunks)
  const nestedData = computed((): ChangeWithChunks[] => {
    const result = extractionResult;
    if (!result) return [];

    const changes: ChangeWithChunks[] = [];
    for (const [key, value] of Object.entries(result)) {
      if (value) {
        changes.push({
          field: key,
          value: String(value),
          // Add nested children to simulate notesDiffChunks.map() inside changesPreview.map()
          chunks: Array.from({ length: 5 }, (_, i) => ({
            id: i,
            text: `${String(value).slice(0, 10)}-chunk-${i}`,
          })),
        });
      }
    }
    return changes;
  });

  // Status message
  const status = computed(() => {
    if (extractionPending) return "Extracting...";
    if (hasResults) return `Found ${changesPreview.length} fields`;
    return "No extraction yet";
  });

  return {
    [NAME]: "generateObject Map Perf Repro",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>generateObject + Map Perf Repro</h1>

        <div
          style={{
            backgroundColor: "#fee2e2",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "4px",
          }}
        >
          <strong>⚠️ BUG TEST:</strong> This pattern tests if the CPU spike is
          caused by the combination of generateObject + ifElse + nested maps.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Status:</strong> {status}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Notes to extract:</strong>
          <pre
            style={{
              backgroundColor: "#f3f4f6",
              padding: "0.5rem",
              fontSize: "0.75rem",
              maxHeight: "100px",
              overflow: "auto",
            }}
          >
            {notes}
          </pre>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <ct-button
            onClick={triggerExtraction({ notes, extractTrigger })}
            disabled={extractionPending}
          >
            {extractionPending ? "Extracting..." : "Extract Data"}
          </ct-button>
          <ct-button onClick={clearExtraction({ extractedData: extractionResult })}>
            Clear Results
          </ct-button>
        </div>

        {/* This is the key pattern: ifElse switching to a branch with nested maps */}
        {ifElse(
          hasResults,
          // TRUE BRANCH: Modal with nested maps (like person.tsx extraction modal)
          <div
            style={{
              border: "2px solid #22c55e",
              padding: "1rem",
              borderRadius: "4px",
            }}
          >
            <h2>Extraction Results (nested map)</h2>
            <p>Found {changesPreview.length} fields with nested chunks:</p>

            {/* Outer map over changes */}
            {nestedData.map((change: ChangeWithChunks) => (
              <div
                style={{
                  padding: "0.5rem",
                  marginBottom: "0.5rem",
                  backgroundColor: "#f0fdf4",
                  borderRadius: "4px",
                }}
              >
                <strong>{change.field}:</strong> {change.value}
                {/* Inner nested map (like notesDiffChunks.map) */}
                <div style={{ paddingLeft: "1rem", fontSize: "0.75rem" }}>
                  {change.chunks.map((chunk: { id: number; text: string }) => (
                    <div style={{ color: "#666" }}>└ {chunk.text}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          // FALSE BRANCH: Simple form (like person.tsx form view)
          <div
            style={{
              border: "2px solid #3b82f6",
              padding: "1rem",
              borderRadius: "4px",
            }}
          >
            <h2>Form View</h2>
            <p>Click "Extract Data" to trigger the bug.</p>
            <p>
              When extraction completes, ifElse will switch to the results
              branch which has nested maps.
            </p>
          </div>
        )}

        <h2 style={{ marginTop: "1rem" }}>Debug Info</h2>
        <pre
          style={{
            backgroundColor: "#f3f4f6",
            padding: "0.5rem",
            fontSize: "0.75rem",
            overflow: "auto",
          }}
        >
          {`This pattern mimics person.tsx:
- generateObject() for extraction
- guardedPrompt computed (prevents spurious calls)
- changesPreview computed (transforms result)
- ifElse() switching form ↔ results modal
- Nested .map() inside results branch

If this triggers the bug, it confirms the cascade:
generateObject result → computed update → ifElse switch → nested map render`}
        </pre>
      </div>
    ),
    notes,
    extractTrigger,
    extractionResult,
    extractionPending,
    changesPreview,
    hasResults,
    nestedData,
  };
});
