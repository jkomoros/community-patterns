/// <cts-enable />
import { Default, handler, NAME, recipe, str, UI, Writable } from "commontools";

/**
 * Example: Simple Counter Pattern
 *
 * This demonstrates:
 * - Basic recipe structure
 * - Using Default<> for state with default values
 * - Using handlers for button clicks
 * - Simple styling with object syntax
 */

interface CounterInput {
  count: Default<number, 0>;
}

interface CounterOutput {
  count: Default<number, 0>;
}

const decrement = handler<unknown, { count: Writable<number> }>(
  (_, { count }) => {
    count.set(count.get() - 1);
  }
);

const reset = handler<unknown, { count: Writable<number> }>(
  (_, { count }) => {
    count.set(0);
  }
);

const increment = handler<unknown, { count: Writable<number> }>(
  (_, { count }) => {
    count.set(count.get() + 1);
  }
);

export default recipe<CounterInput, CounterOutput>(({ count }) => {
  return {
    [NAME]: str`Counter: ${count}`,
    [UI]: (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>Count: {count}</h1>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <ct-button onClick={decrement({ count })}>
            Decrement
          </ct-button>
          <ct-button onClick={reset({ count })}>
            Reset
          </ct-button>
          <ct-button onClick={increment({ count })}>
            Increment
          </ct-button>
        </div>
      </div>
    ),
    count,
  };
});
