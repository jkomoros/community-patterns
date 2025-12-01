/// <cts-enable />
import { Default, NAME, recipe, str, Stream, UI } from "commontools";
import { decrement, increment, nth, previous } from "./counter-handlers.ts";

interface RecipeState {
  value: Default<number, 0>;
}

interface RecipeOutput {
  value: Default<number, 0>;
  increment: Stream<void>;
  decrement: Stream<void>;
}

/**
 * Default values for creating a new Counter.
 * See pattern-development skill for idiom documentation.
 */
const defaults = {
  value: 0,
};

/**
 * Factory function to create a Counter with sensible defaults.
 * @example navigateTo(createCounter({ value: 10 }));
 */
export function createCounter(overrides?: Partial<typeof defaults>) {
  return Counter({ ...defaults, ...overrides });
}

const Counter = recipe<RecipeState, RecipeOutput>((state) => {
  return {
    [NAME]: str`Simple counter: ${state.value}`,
    [UI]: (
      <div>
        <ct-button onClick={decrement(state)}>
          dec to {previous(state.value)}
        </ct-button>
        <span id="counter-result">
          Counter is the {nth(state.value)} number
        </span>
        <ct-button onClick={increment({ value: state.value })}>
          inc to {(state.value ?? 0) + 1}
        </ct-button>
      </div>
    ),
    value: state.value,
    increment: increment(state) as unknown as Stream<void>,
    decrement: decrement(state) as unknown as Stream<void>,
  };
});

export default Counter;
