/// <cts-enable />
/**
 * Test pattern 4: Add multiple module-level handlers like ImportReview
 *
 * Testing if many handler definitions break generateObject reactivity
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
  hiddenItemIds?: Cell<Default<string[], []>>;
}

interface ExtractedItem {
  name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS (like ImportReview has many at module level)
// ═══════════════════════════════════════════════════════════════════════════

const simpleExtract = handler<
  unknown,
  { trigger: Cell<string>; input: Cell<string> }
>((_, { trigger, input }) => {
  const text = input.get() ?? "";
  if (!text.trim()) return;
  trigger.set(`${text}\n---TEST-${Date.now()}---`);
});

// Toggle selection handler
const toggleSelection = handler<
  unknown,
  { selectedIds: Cell<string[]>; itemKey: string }
>((_, { selectedIds, itemKey }) => {
  if (!itemKey || typeof itemKey !== "string") return;
  if (!selectedIds) return;
  const current = selectedIds.get() ?? [];
  if (current.includes(itemKey)) {
    selectedIds.set(current.filter((id) => id !== itemKey));
  } else {
    selectedIds.push(itemKey);
  }
});

// Select all handler
const selectAllItems = handler<
  unknown,
  { selectedIds: Cell<string[]>; allVisibleKeys: string[] }
>((_, { selectedIds, allVisibleKeys }) => {
  if (!selectedIds) return;
  if (!Array.isArray(allVisibleKeys)) return;
  selectedIds.set([...allVisibleKeys]);
});

// Select none handler
const selectNoneItems = handler<
  unknown,
  { selectedIds: Cell<string[]> }
>((_, { selectedIds }) => {
  if (!selectedIds) return;
  selectedIds.set([]);
});

// Dismiss item handler
const dismissItem = handler<
  unknown,
  { hiddenItemIds: Cell<string[]>; itemKey: string }
>((_, { hiddenItemIds, itemKey }) => {
  if (!itemKey || typeof itemKey !== "string") return;
  if (!hiddenItemIds) return;
  const hidden = hiddenItemIds.get() ?? [];
  if (hidden.includes(itemKey)) return;
  hiddenItemIds.push(itemKey);
});

// Dismiss all handler
const dismissAllItems = handler<
  unknown,
  { hiddenItemIds: Cell<string[]>; allVisibleKeys: string[] }
>((_, { hiddenItemIds, allVisibleKeys }) => {
  if (!hiddenItemIds) return;
  if (!Array.isArray(allVisibleKeys)) return;
  const hidden = hiddenItemIds.get() ?? [];
  allVisibleKeys.forEach((key) => {
    if (!hidden.includes(key)) {
      hiddenItemIds.push(key);
    }
  });
});

// Clear trigger handler
const clearTrigger = handler<
  unknown,
  { trigger: Cell<string> }
>((_, { trigger }) => {
  if (!trigger) return;
  trigger.set("");
});

// ═══════════════════════════════════════════════════════════════════════════
// LIFTED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN
// ═══════════════════════════════════════════════════════════════════════════

const TestGenerateObjectTrigger4 = pattern<TestInput, {}>((props) => {
  const { trigger, hiddenItemIds } = props;
  const inputText = cell<string>("");
  const selectedIds = cell<string[]>([]);

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

  // Process results with lift (like ImportReview)
  const processedItems = computed(() => {
    if (!result || typeof result !== "object") return [];
    const hidden = hiddenItemIds?.get() ?? [];
    const items = (result as { items?: ExtractedItem[] }).items ?? [];
    const processed = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const key = liftedGetKey({ item, index });
      if (hidden.includes(key)) continue;
      processed.push({
        key,
        label: liftedGetLabel({ item, index }),
        item,
      });
    }
    return processed;
  });

  const hasTriggered = computed(() => {
    const val = trigger?.get() ?? "";
    return val.trim().length > 0;
  });

  const itemCount = computed(() => processedItems.length);
  const allVisibleKeys = computed(() => processedItems.map((item) => item.key));

  // Pre-bind handlers like ImportReview does
  const boundSelectAll = selectAllItems({ selectedIds, allVisibleKeys });
  const boundSelectNone = selectNoneItems({ selectedIds });
  const boundDismissAll = dismissAllItems({ hiddenItemIds, allVisibleKeys });
  const boundClearTrigger = clearTrigger({ trigger });

  return {
    [NAME]: "Test GenerateObject Trigger 4 (with handlers)",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui" }}>
        <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
          <h1>Test 4: With Module-Level Handlers</h1>
          <p style={{ color: "#666" }}>
            Testing if many handlers break generateObject reactivity
          </p>

          <ct-textarea
            $value={inputText}
            placeholder="Type items: apples, bananas, milk"
            rows={3}
            style={{ width: "100%", marginBottom: "8px" }}
          />

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <ct-button
              variant="primary"
              onClick={simpleExtract({ trigger, input: inputText })}
            >
              Extract
            </ct-button>
            <ct-button variant="secondary" onClick={boundSelectAll}>
              Select All
            </ct-button>
            <ct-button variant="secondary" onClick={boundSelectNone}>
              Select None
            </ct-button>
            <ct-button variant="secondary" onClick={boundClearTrigger}>
              Clear
            </ct-button>
          </div>

          <div
            style={{
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
            <h3>Processed Items:</h3>
            {processedItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px",
                  background: "#eee",
                  marginBottom: "4px",
                  borderRadius: "4px",
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                <ct-button
                  variant="secondary"
                  size="sm"
                  onClick={dismissItem({ hiddenItemIds, itemKey: item.key })}
                >
                  Dismiss
                </ct-button>
              </div>
            ))}
          </div>
        </div>
      </ct-screen>
    ),
  };
});

export default TestGenerateObjectTrigger4;
