/// <cts-enable />
/**
 * Minimal repro v2: CPU loop when computed() calls .set()
 *
 * Hypothesis: The bug is simply computed() calling .set(),
 * not related to generateObject specifically.
 */
import {
  Cell,
  computed,
  Default,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

interface ReproInput {
  source?: Cell<Default<number, 0>>;
  target?: Cell<Default<number, 0>>;
}

interface ReproOutput {
  source: number;
  target: number;
}

const increment = handler<unknown, { source: Cell<number> }>(
  (_, { source }) => {
    source.set(source.get() + 1);
  }
);

export default pattern<ReproInput, ReproOutput>(({ source, target }) => {
  // ❌ BUG: This computed calls .set() - does it cause CPU loop?
  const _copyToTarget = computed(() => {
    const val = source.get();
    if (val > 0) {
      target.set(val * 2); // Copy source * 2 to target
    }
  });

  return {
    [NAME]: "CPU Loop Minimal",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h2>CPU Loop Minimal Repro</h2>
        <p>Click increment, see if CPU spikes.</p>
        <p>Source: {source}</p>
        <p>Target: {target}</p>
        <button onClick={increment({ source })}>Increment Source</button>
      </div>
    ),
    source,
    target,
  };
});
