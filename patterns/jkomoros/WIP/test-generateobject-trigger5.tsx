/// <cts-enable />
/**
 * Test pattern 5: Add optional schema/systemPrompt/model inputs like ImportReview
 *
 * Testing if optional inputs with defaults break generateObject reactivity
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
// INTERFACES - Same as ImportReview minimal
// ═══════════════════════════════════════════════════════════════════════════

interface TestInput {
  trigger?: Cell<Default<string, "">>;
  schema?: object;           // <-- Added like ImportReview
  systemPrompt?: string;     // <-- Added like ImportReview
  model?: string;            // <-- Added like ImportReview
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG - Same as ImportReview
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

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN
// ═══════════════════════════════════════════════════════════════════════════

const TestGenerateObjectTrigger5 = pattern<TestInput, {}>((props) => {
  const {
    trigger,
    schema,        // <-- Destructure like ImportReview
    systemPrompt,  // <-- Destructure like ImportReview
    model,         // <-- Destructure like ImportReview
  } = props;

  // Apply defaults EXACTLY like ImportReview does
  const schemaVal = schema ?? DEFAULT_SCHEMA;
  const systemPromptVal = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const modelVal = model ?? "anthropic:claude-sonnet-4-5";

  const inputText = cell<string>("");

  // Call generateObject at TOP LEVEL with variables
  const { result, pending, error } = generateObject({
    system: systemPromptVal,
    prompt: trigger,
    schema: schemaVal,
    model: modelVal,
  });

  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  const items = computed(() => {
    if (!result || typeof result !== "object") return [];
    if ("items" in result && Array.isArray((result as { items: unknown[] }).items)) {
      return (result as { items: unknown[] }).items;
    }
    return [];
  });

  const itemCount = computed(() => items.length);

  return {
    [NAME]: "Test GenerateObject Trigger 5 (with optional inputs)",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>Test 5: With Optional Inputs</h1>
          <p style={{ color: "#666" }}>
            Testing if optional schema/systemPrompt/model break reactivity
          </p>

          <ct-textarea
            $value={inputText}
            placeholder="Type items: apples, bananas, milk"
            rows={3}
            style={{ width: "100%", marginBottom: "8px" }}
          />

          <ct-button
            variant="primary"
            onClick={simpleExtract({ trigger, input: inputText })}
          >
            Extract
          </ct-button>

          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "#f5f5f5",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <div>Triggered: {derive(hasTriggered, (t) => String(t))}</div>
            <div>Pending: {derive(pending, (p) => String(p))}</div>
            <div>Error: {derive(error, (e) => (e ? String(e) : "none"))}</div>
            <div>
              Trigger Length:{" "}
              {derive(trigger, (t: string) => String(t?.length ?? 0))}
            </div>
            <div>Item Count: {itemCount}</div>
            <div>
              Result:{" "}
              {derive(result, (r) =>
                r ? JSON.stringify(r).substring(0, 100) : "(none)"
              )}
            </div>
          </div>

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

export default TestGenerateObjectTrigger5;
