/// <cts-enable />
/**
 * Minimal repro for Frame mismatch error
 *
 * This pattern attempts to isolate the "Frame mismatch" error that occurs
 * when using generateObject with computed values that read from input cells.
 */
import {
  Cell,
  computed,
  Default,
  generateObject,
  NAME,
  pattern,
  UI,
} from "commontools";

// Simple type for the array items
interface Item {
  id: string;
  label: string;
}

// Analysis result type
interface AnalysisResult {
  items: Array<{ label: string }>;
}

interface ReproInput {
  items?: Cell<Default<Item[], []>>;
}

interface ReproOutput {
  items: Item[];
}

export default pattern<ReproInput, ReproOutput>(({ items }) => {
  // Track analyzed count
  const analyzedCount = Cell.of<number>(0);

  // Build prompt from items
  const analysisPrompt = computed(() => {
    const itemList = items.get();
    const analyzed = analyzedCount.get();

    if (itemList.length === 0 || itemList.length <= analyzed) {
      return "";
    }

    return `Analyze these items: ${itemList.map((i) => i.label).join(", ")}`;
  });

  // Run analysis when there's a prompt
  const analysisResult = generateObject<AnalysisResult>({
    prompt: analysisPrompt,
    system: "Return the items with labels",
  });

  // Update when analysis completes
  const _update = computed(() => {
    const prompt = analysisPrompt;
    if (!prompt) return;

    const result = analysisResult.result;
    if (analysisResult.pending || analysisResult.error || !result) return;

    const itemList = items.get();
    analyzedCount.set(itemList.length);

    // This mutation might be causing the frame mismatch
    if (result.items.length > 0) {
      const current = items.get();
      items.set([
        ...current,
        { id: `new-${Date.now()}`, label: result.items[0].label },
      ]);
    }
  });

  const hasItems = computed(() => items.get().length > 0);

  return {
    [NAME]: "Frame Mismatch Repro",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h2>Frame Mismatch Repro</h2>
        <p>
          This pattern tries to reproduce the Frame mismatch error by using
          generateObject with computed prompts that read from input cells.
        </p>
        {hasItems ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        ) : (
          <p>No items yet</p>
        )}
        <ct-button
          onClick={() => {
            items.push({ id: `item-${Date.now()}`, label: "Test Item" });
          }}
        >
          Add Item
        </ct-button>
      </div>
    ),
    items,
  };
});
