/// <cts-enable />
/**
 * Repro: Default<> in Nested Interface Properties
 *
 * CLAIM: Default<> should only be at array level, not nested properties
 * If the claim is correct, this pattern should have TypeScript errors.
 */
import { Cell, Default, handler, NAME, pattern, UI } from "commontools";

// CLAIMED PROBLEMATIC: Default in nested properties
interface DimensionNested {
  name: string;
  multiplier: Default<number, 1>;  // CLAIMED: This causes push errors
}

// CLAIMED WORKING: Plain types in nested, Default at array level
interface DimensionPlain {
  name: string;
  multiplier: number;  // Plain type
}

interface Input {
  nestedDefaults: Default<DimensionNested[], []>;  // Nested Default<> in items
  plainNested: Default<DimensionPlain[], []>;      // Plain types in items
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ nestedDefaults, plainNested }) => {
    // Try to push to array with nested Default<> properties
    const pushNested = handler<unknown, { arr: Cell<DimensionNested[]> }>(
      (_, { arr }) => {
        // CLAIMED: This should cause TypeScript errors!
        arr.push({
          name: "Test",
          multiplier: 1,  // Plain number - claimed to fail
        });
      }
    );

    // Try to push to array with plain nested types
    const pushPlain = handler<unknown, { arr: Cell<DimensionPlain[]> }>(
      (_, { arr }) => {
        // CLAIMED: This should work fine
        arr.push({
          name: "Test",
          multiplier: 1,
        });
      }
    );

    return {
      [NAME]: "Nested Default Test",
      [UI]: (
        <div style={{ padding: "20px" }}>
          <h2>Nested Default Test</h2>
          <p>If this compiles and deploys, the superstition may need revision.</p>
          <p>Nested defaults count: {nestedDefaults.length}</p>
          <p>Plain nested count: {plainNested.length}</p>
          <button onClick={pushNested({ arr: nestedDefaults })}>
            Push to Nested Defaults
          </button>
          <button onClick={pushPlain({ arr: plainNested })}>
            Push to Plain Nested
          </button>
        </div>
      ),
    };
  }
);
