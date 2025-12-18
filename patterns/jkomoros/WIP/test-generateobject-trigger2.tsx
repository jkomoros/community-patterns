/// <cts-enable />
/**
 * Test pattern 2: Using variables for system/schema/model like ImportReview does
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
  trigger?: Cell<Default<string, "">>;
}

const DEFAULT_SYSTEM = "Extract items from text. Return {items: [{name: string}]}";
const DEFAULT_SCHEMA = {
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
} as const;
const DEFAULT_MODEL = "anthropic:claude-sonnet-4-5";

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

const TestGenerateObjectTrigger2 = pattern<TestInput, {}>((props) => {
  const { trigger } = props;

  // Use variables like ImportReview does
  const systemVal = DEFAULT_SYSTEM;
  const schemaVal = DEFAULT_SCHEMA;
  const modelVal = DEFAULT_MODEL;

  const inputText = cell<string>("");

  // Call generateObject with VARIABLES (like ImportReview)
  const { result, pending, error } = generateObject({
    system: systemVal,
    prompt: trigger,
    schema: schemaVal,
    model: modelVal,
  });

  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  return {
    [NAME]: "Test GenerateObject Trigger 2",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>GenerateObject Trigger Test 2</h1>
          <p style={{ color: "#666" }}>
            Testing with VARIABLES for system/schema/model (like ImportReview)
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

export default TestGenerateObjectTrigger2;
