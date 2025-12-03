/// <cts-enable />
import { NAME, pattern, UI } from "commontools";

/** Simplest possible charm. #simpleTarget */
export default pattern<{}, { message: string }>(
  () => ({
    [NAME]: "Simple Target",
    [UI]: <div style={{ padding: "20px", background: "#e8f5e9", border: "2px solid green" }}>
      <h2>Simple Target Charm</h2>
      <p>If you see this, navigation worked!</p>
    </div>,
    message: "Hello from simple target",
  }),
);
