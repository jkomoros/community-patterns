/// <cts-enable />
/**
 * Multi-Tag Source Pattern
 *
 * This pattern has MULTIPLE tags in its output description.
 * Used to test if wish() can find it via either tag.
 *
 * FAVORITE THIS CHARM to test multi-tag wish discovery.
 */
import { Default, NAME, pattern, UI } from "commontools";

/** Test source with multiple tags. #testTag1 #testTag2 */
interface Output {
  value: string;
  createdAt: number;
}

export default pattern<{ value: Default<string, "multi-tag-value"> }, Output>(
  ({ value }) => {
    return {
      [NAME]: "Multi-Tag Source",
      [UI]: (
        <div style={{
          padding: "20px",
          background: "#d1fae5",
          borderRadius: "8px",
          maxWidth: "400px"
        }}>
          <h2 style={{ margin: "0 0 12px 0" }}>Multi-Tag Source</h2>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Value:</strong> {value}
          </p>
          <p style={{
            margin: "0",
            fontSize: "12px",
            color: "#065f46",
            background: "#a7f3d0",
            padding: "8px",
            borderRadius: "4px"
          }}>
            This pattern has tags: <code>#testTag1</code> and <code>#testTag2</code>
            <br/><br/>
            <strong>Favorite this charm</strong> to test if wish() can find it via either tag!
          </p>
        </div>
      ),
      value,
      createdAt: Date.now(),
    };
  }
);
