/// <cts-enable />
/**
 * MAP TEST - 100 ITEMS (Simplified)
 *
 * Testing framework author's hypothesis:
 * 1. Create 100 items
 * 2. Map over with generateObject
 * 3. Verify per-item caching works
 *
 * NO manual caching, NO fetch in handlers - pure reactive map.
 * Simplified: no add button, just test the core map + generateObject.
 */
import {
  Writable,
  computed,
  Default,
  generateObject,
  handler,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";

interface Item {
  id: string;
  content: string;
}

// Use Default<> for input - framework wraps as Cell automatically
interface MapTestInput {
  items: Default<Item[], []>;
}

interface MapTestOutput {
  items: Item[];
}

// Handler to add a single item
const addItem = handler<unknown, { items: Writable<Item[]> }>((_event, { items }) => {
  const currentItems = items.get();
  const nextId = currentItems.length;
  items.push({
    id: `item-${nextId}`,
    content: `This is item number ${nextId} with exactly ten words here.`,
  });
});

export default pattern<MapTestInput, MapTestOutput>(({ items }) => {
  // Count for display
  const itemCount = computed(() => items.length);

  // THE SIMPLE MAP:
  // Just map over items with generateObject
  const extractions = items.map((item) => ({
    itemId: item.id,
    // generateObject call for each item
    extraction: generateObject({
      system: "Count the words in the content and return the count.",
      prompt: item.content,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object" as const,
        properties: {
          wordCount: { type: "number" as const },
        },
        required: ["wordCount"] as const,
      },
    }),
  }));

  // Count pending extractions
  const pendingCount = computed(() =>
    extractions.filter((e: any) => e.extraction?.pending).length
  );

  return {
    [NAME]: str`Map Test (${itemCount} items)`,
    [UI]: (
      <div style={{ padding: "16px", fontFamily: "system-ui" }}>
        <h2>Map Test - 100 Items</h2>
        <p style={{ fontSize: "12px", color: "#666" }}>
          Testing: map over items with generateObject. Reload to test cache hits.
        </p>
        <p style={{ fontSize: "12px", color: "#666" }}>
          <strong>Pending:</strong> {pendingCount} / {itemCount}
        </p>

        <button
          onClick={addItem({ items })}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          Add 1 Item (test incremental)
        </button>

        <h3>Items: {itemCount}</h3>

        <div style={{ maxHeight: "400px", overflow: "auto" }}>
          {extractions.map((e) => (
            <div style={{
              padding: "4px 8px",
              margin: "2px 0",
              background: e.extraction.pending ? "#fef3c7" : "#d1fae5",
              borderRadius: "4px",
              fontSize: "11px",
            }}>
              {e.itemId}: {e.extraction.pending ? "⏳" : `✅ ${e.extraction.result?.wordCount} words`}
            </div>
          ))}
        </div>
      </div>
    ),
    items,
  };
});
