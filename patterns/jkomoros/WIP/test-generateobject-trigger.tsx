/// <cts-enable />
/**
 * Minimal test pattern to isolate generateObject trigger behavior
 *
 * Goal: Determine if the issue is:
 * a) Optional pattern inputs with defaults not triggering reactivity
 * b) generateObject not re-evaluating when its prompt Cell changes
 * c) Something specific to how the trigger Cell is created/used
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

interface TestInput {
  // Test 1: Optional with Default (like ImportReview uses)
  optionalTrigger?: Cell<Default<string, "">>;
}

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  // Format with timestamp to bust cache
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

const TestGenerateObjectTrigger = pattern<TestInput, {}>((props) => {
  const { optionalTrigger } = props;

  // Test approach: Use the optional trigger directly
  // This mirrors what ImportReview does
  const trigger = optionalTrigger;

  // Internal cell for user input
  const inputText = cell<string>("");

  // Call generateObject at TOP LEVEL
  const { result, pending, error } = generateObject({
    system: "Extract items from text. Return {items: [{name: string}]}",
    prompt: trigger, // Pass the optional trigger directly
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
    model: "anthropic:claude-sonnet-4-5",
  });

  // Computed to check if triggered
  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  return {
    [NAME]: "Test GenerateObject Trigger",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>GenerateObject Trigger Test</h1>
          <p style={{ color: "#666" }}>
            Testing if generateObject fires when optional input trigger changes
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

          {/* Debug display */}
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
            <div>
              Result:{" "}
              {derive(result, (r) =>
                r ? JSON.stringify(r).substring(0, 100) : "(none)"
              )}
            </div>
          </div>
        </div>
      </ct-screen>
    ),
  };
});

export default TestGenerateObjectTrigger;
