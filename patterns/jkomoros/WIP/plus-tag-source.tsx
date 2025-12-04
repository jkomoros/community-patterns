/// <cts-enable />
/**
 * Test source with plus sign in tag
 */
import { NAME, pattern, UI } from "commontools";

/** Test with plus. #testGmail+Calendar */
interface Output { marker: string }

export default pattern<{}, Output>(() => ({
  [NAME]: "Plus Tag Source",
  [UI]: (
    <div style={{ padding: "16px", background: "#d1fae5", borderRadius: "8px" }}>
      <h3>Plus Tag Source</h3>
      <p>Tag: <code>#testGmail+Calendar</code></p>
      <p><strong>Favorite this</strong> to test if + works in tags</p>
    </div>
  ),
  marker: "gmail+calendar",
}));
