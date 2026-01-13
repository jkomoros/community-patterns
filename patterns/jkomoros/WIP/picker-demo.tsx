/// <cts-enable />
/**
 * Demo pattern to test ct-render variant="preview" support.
 * Creates multiple instances and displays them in a ct-picker.
 */
import { Cell, NAME, recipe, UI } from "commontools";
import PreviewTest from "./preview-test.tsx";

type Input = Record<string, never>;

export default recipe<Input>(
  "picker-preview-demo",
  (_) => {
    // Create preview-test instances with different titles
    const item1 = PreviewTest({
      title: "First Item",
      content: "This is the first item with preview support.",
    });
    const item2 = PreviewTest({
      title: "Second Item",
      content: "This is the second item - check the picker!",
    });
    const item3 = PreviewTest({
      title: "Third Item",
      content: "Third item shows preview in picker too.",
    });

    const selectedIndex = Cell.of(0);
    const items = [item1, item2, item3];

    return {
      [NAME]: "Picker Preview Demo",
      [UI]: (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ margin: 0 }}>ct-picker Preview Demo</h2>
          <p style={{ margin: 0, color: "var(--ct-color-muted)" }}>
            The picker below should show "Preview Mode" badge (previewUI) instead of the full UI.
          </p>

          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <h3 style={{ margin: "0 0 16px 0" }}>Picker (should use previewUI)</h3>
            <ct-picker $items={items as any} $selectedIndex={selectedIndex} />
          </div>

          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Selected Index</h3>
            <p style={{ margin: 0 }}>{selectedIndex}</p>
          </div>
        </div>
      ),
    };
  },
);
