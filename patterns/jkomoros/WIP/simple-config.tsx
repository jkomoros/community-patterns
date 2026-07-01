/**
 * Simple config pattern - used as imported dependency for repro testing
 */

import { computed, Default, NAME, pattern, UI, type VNode } from "commonfabric";

interface Input {
  multiplier?: Default<number, 1>;
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  multiplier: number;
  doubled: number;
}

export default pattern<Input, Output>(({ multiplier }) => {
  const doubled = computed(() => multiplier * 2);

  return {
    [NAME]: "Simple Config",
    [UI]: (
      <div
        style={{
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
        }}
      >
        <strong>Config:</strong> multiplier = {multiplier}, doubled = {doubled}
      </div>
    ),
    multiplier,
    doubled,
  };
});
