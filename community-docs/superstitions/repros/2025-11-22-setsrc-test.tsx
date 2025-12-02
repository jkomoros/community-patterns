/// <cts-enable />
/**
 * Simple pattern for testing charm setsrc behavior
 * Version 2 - UPDATED via setsrc test
 */
import { Default, NAME, pattern, UI } from "commontools";

interface Input {
  version: Default<string, "v2-setsrc">;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ version }) => ({
    [NAME]: "SetSrc Test",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h2>SetSrc Test Pattern</h2>
        <p>Current version: <strong>{version}</strong></p>
        <p>If you see "v2", the setsrc update worked.</p>
      </div>
    ),
  })
);
