/// <cts-enable />
/**
 * Minimal ImportReview - stripped down to find the breaking point
 *
 * This is a copy of ImportReview with most features removed to isolate
 * what's causing generateObject to not fire.
 */
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES (simplified)
// ═══════════════════════════════════════════════════════════════════════════

interface ImportReviewMinimalInput {
  trigger?: Cell<Default<string, "">>;
  schema?: object;
  systemPrompt?: string;
  model?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG (same as ImportReview)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `You are a data extraction assistant. Extract structured data from the provided text.
Return all items found in the text according to the schema provided.
If no items are found, return an empty items array.`;

const DEFAULT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
          description: { type: "string", description: "Item description" },
        },
        required: ["name"],
      },
    },
  },
  required: ["items"],
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const demoExtract = handler<
  unknown,
  { trigger: Cell<string>; inputText: Cell<string> }
>((_, { trigger, inputText }) => {
  if (!trigger || !inputText) return;
  const text = inputText.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---EXTRACT-${Date.now()}---`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN
// ═══════════════════════════════════════════════════════════════════════════

const ImportReviewMinimal = pattern<ImportReviewMinimalInput, {}>((props) => {
  const {
    trigger: triggerInput,
    schema,
    systemPrompt,
    model,
  } = props;

  // Defaults - EXACTLY like ImportReview
  const schemaVal = schema ?? DEFAULT_SCHEMA;
  const systemPromptVal = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const modelVal = model ?? "anthropic:claude-sonnet-4-5";

  // Use triggerInput directly - EXACTLY like ImportReview
  const trigger = triggerInput;

  // Demo input
  const demoInputText = cell<string>("");

  // generateObject at TOP LEVEL - EXACTLY like ImportReview
  const {
    result: extractionResult,
    pending: extractionPending,
    error: extractionError,
  } = generateObject({
    system: systemPromptVal,
    prompt: trigger,
    schema: schemaVal,
    model: modelVal,
  });

  // Simple computed for items
  const items = computed(() => {
    const result = extractionResult;
    if (!result || typeof result !== "object") return [];
    if ("items" in result && Array.isArray((result as { items: unknown[] }).items)) {
      return (result as { items: unknown[] }).items;
    }
    return [];
  });

  const hasTriggered = computed(() => (trigger?.get()?.trim() ?? "").length > 0);
  const itemCount = computed(() => items.length);

  return {
    [NAME]: "ImportReview Minimal",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
          <h1>ImportReview Minimal</h1>
          <p style={{ color: "#666" }}>
            Stripped down ImportReview to isolate the bug
          </p>

          <div style={{ marginBottom: "16px" }}>
            <ct-textarea
              $value={demoInputText}
              placeholder="Paste text here (e.g., 'Shopping list: apples, bananas, milk')"
              rows={4}
              style={{ width: "100%", marginBottom: "8px" }}
            />
            <ct-button
              variant="primary"
              onClick={demoExtract({ trigger, inputText: demoInputText })}
            >
              Extract Items
            </ct-button>
          </div>

          {/* Debug display */}
          <div
            style={{
              padding: "16px",
              background: "#f5f5f5",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Debug State:</h3>
            <div style={{ fontSize: "12px" }}>
              <div>Pending: {derive(extractionPending, (p) => String(p))}</div>
              <div>Error: {derive(extractionError, (e) => e ? "Yes" : "No")}</div>
              <div>Triggered: {derive(hasTriggered, (t) => String(t))}</div>
              <div>Trigger Length: {derive(trigger, (t: string) => String(t?.length ?? 0))}</div>
              <div>Item Count: {itemCount}</div>
              <div>
                Result:{" "}
                {derive(extractionResult, (r) =>
                  r ? JSON.stringify(r).substring(0, 100) : "(none)"
                )}
              </div>
            </div>
          </div>

          {/* Show items if any */}
          <div style={{ marginTop: "16px" }}>
            <h3>Extracted Items:</h3>
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: "8px",
                  background: "#eee",
                  marginBottom: "4px",
                  borderRadius: "4px",
                }}
              >
                {JSON.stringify(item)}
              </div>
            ))}
          </div>
        </div>
      </ct-screen>
    ),
  };
});

export default ImportReviewMinimal;
