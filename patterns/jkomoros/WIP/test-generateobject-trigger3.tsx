/// <cts-enable />
/**
 * Test pattern 3: Add lift() calls like ImportReview uses
 *
 * Testing if lift() breaks generateObject reactivity
 */
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  lift,
  NAME,
  pattern,
  UI,
} from "commontools";

interface TestInput {
  trigger?: Cell<Default<string, "">>;
}

interface ExtractedItem {
  name: string;
}

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

// Lifted functions like ImportReview uses
const liftedGetKey = lift(({ item, index }: {
  item: ExtractedItem;
  index: number;
}): string => {
  return item?.name ?? `item-${index}`;
});

const liftedGetLabel = lift(({ item, index }: {
  item: ExtractedItem;
  index: number;
}): string => {
  return item?.name ?? `Item ${index}`;
});

const TestGenerateObjectTrigger3 = pattern<TestInput, {}>((props) => {
  const { trigger } = props;
  const inputText = cell<string>("");

  // Call generateObject at TOP LEVEL
  const { result, pending, error } = generateObject({
    system: "Extract items from text. Return {items: [{name: string}]}",
    prompt: trigger,
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

  // Use the lifted functions in a computed (like ImportReview does)
  const processedItems = computed(() => {
    if (!result || typeof result !== "object") return [];
    const items = (result as { items?: ExtractedItem[] }).items ?? [];
    return items.map((item, index) => ({
      key: liftedGetKey({ item, index }),
      label: liftedGetLabel({ item, index }),
      item,
    }));
  });

  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  const itemCount = computed(() => processedItems.length);

  return {
    [NAME]: "Test GenerateObject Trigger 3 (with lift)",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>Test 3: With lift() Calls</h1>
          <p style={{ color: "#666" }}>
            Testing if lift() breaks generateObject reactivity
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

          {/* Show processed items */}
          <div style={{ marginTop: "16px" }}>
            <h3>Processed Items:</h3>
            {processedItems.map((item, idx) => (
              <div key={idx} style={{ padding: "4px", background: "#eee", marginBottom: "4px" }}>
                {item.label} (key: {item.key})
              </div>
            ))}
          </div>
        </div>
      </ct-screen>
    ),
  };
});

export default TestGenerateObjectTrigger3;
