/// <cts-enable />
/**
 * Test pattern for ct-render variant="preview" support.
 * Exports both [UI] (full) and previewUI (compact) to test that
 * ct-picker correctly uses previewUI when available.
 */
import { UI, NAME, recipe, Default, str } from "commontools";

interface Input {
  title: Default<string, "Default Title">;
  content: Default<string, "Default content goes here.">;
}

export default recipe<Input>(
  "preview-test",
  ({ title, content }) => {
    return {
      [NAME]: str`Preview Test: ${title}`,

      // Full UI - complex layout with multiple sections
      [UI]: (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <h2 style={{ margin: "0 0 8px 0" }}>Full UI View</h2>
            <p style={{ margin: 0, color: "var(--ct-color-muted)" }}>
              This is the complete UI that shows when viewing the charm directly.
            </p>
          </div>

          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: "8px" }}>Title</label>
            <ct-input $value={title} placeholder="Enter title..." />
          </div>

          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: "8px" }}>Content</label>
            <ct-textarea $value={content} placeholder="Enter content..." />
          </div>

          <div style={{
            padding: "16px",
            background: "var(--ct-color-surface-container)",
            borderRadius: "8px"
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Extra Section</h3>
            <p style={{ margin: 0, color: "var(--ct-color-muted)" }}>
              This section only appears in the full UI, not in preview.
            </p>
          </div>
        </div>
      ),

      // Preview UI - compact summary for ct-picker
      previewUI: (
        <div style={{ padding: "16px", textAlign: "center" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>{title}</h3>
          <p style={{ margin: "0 0 12px 0", color: "var(--ct-color-muted)", fontSize: "14px" }}>
            {content}
          </p>
          <span style={{
            background: "var(--ct-color-primary)",
            color: "white",
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "12px"
          }}>
            Preview Mode
          </span>
        </div>
      ),
    };
  },
);
