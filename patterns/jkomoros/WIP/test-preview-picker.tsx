/// <cts-enable />
/**
 * Test pattern to verify previewUI in the picker.
 * Uses wish("#googleAuth") to trigger the multi-account picker.
 */
import { NAME, pattern, UI, wish } from "commontools";

interface Input {}
interface Output {}

export default pattern<Input, Output>(() => {
  // This will show a picker when multiple #googleAuth charms are favorited
  const authWish = wish<any>({ query: "#googleAuth" });

  return {
    [NAME]: "Test Preview Picker",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2>Testing previewUI in Picker</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          This pattern uses wish("#googleAuth") to find favorited Google Auth charms.
          When multiple matches exist, a picker is shown using the previewUI.
        </p>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Auth Selection:</h3>
          {authWish}
        </div>
      </div>
    ),
  };
});
