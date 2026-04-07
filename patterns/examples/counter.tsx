/// <cts-enable />
import {
  action,
  computed,
  Default,
  handler,
  NAME,
  pattern,
  Stream,
  UI,
  type VNode,
  Writable,
} from "commonfabric";

/**
 * Example: Simple Counter Pattern
 *
 * This demonstrates:
 * - Basic pattern structure
 * - Using Default<> for state with default values
 * - Using a module-scope handler for one button
 * - Using a pattern-body action() for another (preferred for single-use)
 * - Computed values
 * - Built-in cf-* components
 */

interface CounterInput {
  value?: Writable<Default<number, 0>>;
}

interface CounterOutput {
  [NAME]: string;
  [UI]: VNode;
  value: number;
  increment: Stream<void>;
  decrement: Stream<void>;
}

const increment = handler<void, { value: Writable<number> }>(
  (_, { value }) => {
    value.set(value.get() + 1);
  },
);

const Counter = pattern<CounterInput, CounterOutput>(({ value }) => {
  const boundIncrement = increment({ value });

  const decrement = action(() => {
    value.set(value.get() - 1);
  });

  const displayName = computed(() => `Counter: ${value.get()}`);

  return {
    [NAME]: displayName,
    [UI]: (
      <cf-screen>
        <cf-vstack slot="header" gap="1">
          <cf-heading level={4}>Simple Counter</cf-heading>
        </cf-vstack>

        <cf-vstack gap="3" style="padding: 2rem; align-items: center;">
          <div
            style={{
              fontSize: "3rem",
              fontWeight: "bold",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </div>

          <cf-hstack gap="2">
            <cf-button
              id="counter-decrement"
              variant="secondary"
              onClick={decrement}
            >
              - Decrement
            </cf-button>
            <cf-button
              id="counter-increment"
              variant="primary"
              onClick={() => boundIncrement.send()}
            >
              + Increment
            </cf-button>
          </cf-hstack>
        </cf-vstack>
      </cf-screen>
    ),
    value,
    increment: boundIncrement,
    decrement,
  };
});

export default Counter;
