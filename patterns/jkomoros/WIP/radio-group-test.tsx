/// <cts-enable />
/**
 * Test pattern for ct-radio-group with items prop
 */
import { Default, NAME, pattern, UI } from "commontools";

interface RadioTestInput {
  selectedSize: Default<string, "medium">;
  selectedPriority: Default<string, "normal">;
}

export default pattern<RadioTestInput>(({ selectedSize, selectedPriority }) => {
  return {
    [NAME]: "Radio Group Test",
    [UI]: (
      <ct-vstack gap="4" style="padding: 1rem;">
        <ct-heading level={2}>Radio Group Test</ct-heading>

        {/* Vertical radio group (default) */}
        <ct-vstack gap="2">
          <div style={{ fontWeight: "500" }}>Size (Vertical)</div>
          <ct-radio-group
            $value={selectedSize}
            items={[
              { label: "Small", value: "small" },
              { label: "Medium", value: "medium" },
              { label: "Large", value: "large" },
              { label: "Extra Large", value: "xl" },
            ]}
          />
          <div style={{ fontSize: "0.875rem", color: "#666" }}>
            Selected: {selectedSize}
          </div>
        </ct-vstack>

        <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "1rem 0" }} />

        {/* Horizontal radio group */}
        <ct-vstack gap="2">
          <div style={{ fontWeight: "500" }}>Priority (Horizontal)</div>
          <ct-radio-group
            $value={selectedPriority}
            orientation="horizontal"
            items={[
              { label: "Low", value: "low" },
              { label: "Normal", value: "normal" },
              { label: "High", value: "high" },
              { label: "Urgent", value: "urgent", disabled: true },
            ]}
          />
          <div style={{ fontSize: "0.875rem", color: "#666" }}>
            Selected: {selectedPriority}
          </div>
        </ct-vstack>
      </ct-vstack>
    ),
    selectedSize,
    selectedPriority,
  };
});
