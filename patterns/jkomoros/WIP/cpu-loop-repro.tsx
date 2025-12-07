/// <cts-enable />
/**
 * Minimal repro: CPU loop when computed() calls .set()
 *
 * Issue: Calling .set() inside a computed() causes 100% CPU loop.
 * Expected: .set() should silently fail (computed is read-only)
 * Actual: CPU spikes to 100%, pattern becomes unresponsive
 *
 * To reproduce:
 * 1. Deploy this pattern
 * 2. Type a message and press Enter
 * 3. Observe CPU spike when generateObject returns a result
 */
import {
  Cell,
  computed,
  Default,
  generateObject,
  handler,
  NAME,
  pattern,
  Stream,
  UI,
} from "commontools";

interface Item {
  id: string;
  value: string;
}

interface GeneratedResult {
  items: Array<{ value: string }>;
}

interface ReproInput {
  prompt?: Cell<Default<string, "">>;
  items?: Cell<Default<Item[], []>>;
}

interface ReproOutput {
  prompt: string;
  items: Item[];
}

const setPrompt = handler<
  { detail: { text: string } },
  { prompt: Cell<string> }
>((event, { prompt }) => {
  prompt.set(event.detail.text);
});

export default pattern<ReproInput, ReproOutput>(({ prompt, items }) => {
  // Build prompt - only generate when we have input
  const generationPrompt = computed(() => {
    const p = prompt.get();
    // Return a non-empty prompt always to avoid 400 errors
    return p ? `Generate 3 items about: ${p}` : "Generate 3 random items";
  });

  // generateObject that returns items
  const generated = generateObject<GeneratedResult>({
    prompt: generationPrompt,
    system:
      "Return a JSON object with an 'items' array containing objects with 'value' strings.",
    model: "anthropic:claude-haiku-4-5",
  });

  // ❌ BUG: This computed calls .set() which causes CPU loop
  // Expected: .set() silently fails (computed is read-only per docs)
  // Actual: 100% CPU, pattern freezes
  const _copyToCell = computed(() => {
    const result = generated.result;
    if (!result || !result.items) return;

    // This .set() call causes the CPU loop
    const newItems: Item[] = result.items.map((item, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      value: item.value,
    }));

    items.set(newItems); // <-- THIS CAUSES CPU LOOP
  });

  const itemCount = computed(() => items.get().length);

  return {
    [NAME]: "CPU Loop Repro",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h2>CPU Loop Repro: computed() + .set()</h2>
        <p>
          <strong>Bug:</strong> Calling .set() inside computed() causes 100% CPU loop.
        </p>
        <p>
          <strong>To reproduce:</strong> Type something and press Enter. When generateObject
          returns, CPU will spike.
        </p>
        <hr />
        <p>Prompt: {prompt}</p>
        <p>Items in cell: {itemCount}</p>
        <ct-prompt-input
          placeholder="Type something to trigger generateObject..."
          onct-send={setPrompt({ prompt })}
        />
        {generated.pending && <p>Generating...</p>}
      </div>
    ),
    prompt,
    items,
  };
});
