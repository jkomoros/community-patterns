/// <cts-enable />
/**
 * Simple config pattern - used as imported dependency for repro testing
 */

import { Writable, computed, Default, NAME, pattern, UI } from "commontools";

interface Input {
  multiplier?: Default<number, 1>;
}

interface Output {
  multiplier: Writable<number>;
  doubled: Writable<number>;
}

export default pattern<Input, Output>(({ multiplier }) => {
  const doubled = computed(() => multiplier * 2);

  return {
    [NAME]: "Simple Config",
    [UI]: (
      <div style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}>
        <strong>Config:</strong> multiplier = {multiplier}, doubled = {doubled}
      </div>
    ),
    multiplier,
    doubled,
  };
});
