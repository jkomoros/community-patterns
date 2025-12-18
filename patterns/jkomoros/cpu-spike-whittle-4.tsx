/// <cts-enable />
/**
 * CPU Spike Whittle-Down Test - STEP 4
 *
 * STEP 1 (40s, 595ms max frame): Full orchestrator with wish() + GoogleAuth
 * STEP 2 (19s, 749ms max frame): Just GoogleAuth instantiation
 * STEP 3 (17s, 70ms max frame): Simple pattern - NO CPU SPIKE!
 * STEP 4 (THIS): Pattern with computed() inside .map() like GoogleAuth
 *
 * Testing if computed() inside .map() causes the CPU spike.
 */
import {
  computed,
  Default,
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

// =============================================================================
// Pattern that mimics GoogleAuth's computed-in-map pattern
// =============================================================================

type SelectedItems = {
  item1: Default<boolean, false>;
  item2: Default<boolean, false>;
  item3: Default<boolean, false>;
  item4: Default<boolean, false>;
  item5: Default<boolean, false>;
  item6: Default<boolean, false>;
  item7: Default<boolean, false>;
  item8: Default<boolean, false>;
};

const ITEM_DESCRIPTIONS = {
  item1: "First item",
  item2: "Second item",
  item3: "Third item",
  item4: "Fourth item",
  item5: "Fifth item",
  item6: "Sixth item",
  item7: "Seventh item",
  item8: "Eighth item",
} as const;

interface ComplexInput {
  selectedItems: Default<SelectedItems, {
    item1: true;
    item2: false;
    item3: true;
    item4: false;
    item5: false;
    item6: false;
    item7: false;
    item8: false;
  }>;
}

interface ComplexOutput {
  selectedItems: SelectedItems;
  count: number;
}

const ComplexPattern = pattern<ComplexInput, ComplexOutput>(({ selectedItems }) => {
  // Multiple computed() like GoogleAuth has
  const count = computed(() =>
    Object.values(selectedItems).filter(Boolean).length
  );

  return {
    [NAME]: "Complex Test Pattern",
    [UI]: (
      <div style={{ padding: "20px" }}>
        <h2>Complex Pattern</h2>
        <p>Selected: {count}</p>

        {/* This is the suspect pattern - computed() inside .map() */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {Object.entries(ITEM_DESCRIPTIONS).map(([key, description]) => (
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={computed(() => selectedItems[key as keyof SelectedItems])}
                disabled={computed(() => false)}
              />
              <span>{description}</span>
            </label>
          ))}
        </div>
      </div>
    ),
    selectedItems,
    count,
  };
});

// =============================================================================
// Types
// =============================================================================

interface Input {
  // No inputs needed
}

/** CPU Spike Whittle Test Step 4 - computed in map. #cpuSpikeWhittle4 */
interface Output {
  testName: string;
}

// =============================================================================
// Handler
// =============================================================================

const createComplexPattern = handler<unknown, Record<string, never>>(() => {
  const charm = ComplexPattern({
    selectedItems: {
      item1: true,
      item2: false,
      item3: true,
      item4: false,
      item5: false,
      item6: true,
      item7: false,
      item8: false,
    },
  });
  return navigateTo(charm);
});

// =============================================================================
// Pattern
// =============================================================================

export default pattern<Input, Output>(
  () => {
    return {
      [NAME]: "CPU Spike Whittle 4 (Computed in Map)",
      [UI]: (
        <div style={{ padding: "20px", maxWidth: "600px" }}>
          <h2>CPU Spike Whittle - Step 4</h2>

          <p style={{ color: "#666", marginBottom: "16px" }}>
            <strong>computed() inside .map()</strong> - Like GoogleAuth's checkbox pattern.
          </p>

          <div style={{ fontSize: "13px", marginBottom: "16px" }}>
            <p>Step 1 (wish + GoogleAuth): <strong>40s, 595ms frame</strong></p>
            <p>Step 2 (just GoogleAuth): <strong>19s, 749ms frame</strong></p>
            <p>Step 3 (simple pattern): <strong>17s, 70ms frame</strong></p>
            <p>Step 4 (computed in map): <strong>???</strong></p>
          </div>

          <ct-button
            variant="primary"
            onClick={createComplexPattern({})}
          >
            Create Complex Pattern (computed in map)
          </ct-button>
        </div>
      ),
      testName: "CPU Spike Whittle 4",
    };
  }
);
