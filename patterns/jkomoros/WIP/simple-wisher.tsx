/// <cts-enable />
import { NAME, pattern, UI, wish } from "commontools";

/** Wishes for simple target and shows link. */
export default pattern<{}, {}>(
  () => {
    const wishResult = wish<{ message: string }>({ query: "#simpleTarget" });

    return {
      [NAME]: "Simple Wisher",
      [UI]: <div style={{ padding: "20px" }}>
        <h2>Simple Wisher</h2>
        <p>Click the link below to test cross-space navigation:</p>
        <div style={{ padding: "10px", border: "1px solid #ccc", margin: "10px 0" }}>
          {wishResult.result}
        </div>
        {wishResult}
      </div>,
    };
  },
);
