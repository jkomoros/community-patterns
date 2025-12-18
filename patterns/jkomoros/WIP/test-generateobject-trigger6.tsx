/// <cts-enable />
/**
 * Test pattern 6: Add just ONE optional non-Cell input
 *
 * Testing if a SINGLE optional non-Cell input breaks generateObject reactivity
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
  schema?: object;  // <-- Just ONE optional non-Cell input
}

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

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

const TestGenerateObjectTrigger6 = pattern<TestInput, {}>((props) => {
  const { trigger, schema } = props;

  // Apply default
  const schemaVal = schema ?? DEFAULT_SCHEMA;

  const inputText = cell<string>("");

  const { result, pending, error } = generateObject({
    system: "Extract items from text. Return {items: [{name: string}]}",
    prompt: trigger,
    schema: schemaVal,
    model: "anthropic:claude-sonnet-4-5",
  });

  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  return {
    [NAME]: "Test 6: One Optional Non-Cell Input",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>Test 6: One Optional Non-Cell</h1>
          <p style={{ color: "#666" }}>
            Testing if a SINGLE optional non-Cell input breaks reactivity
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

export default TestGenerateObjectTrigger6;
