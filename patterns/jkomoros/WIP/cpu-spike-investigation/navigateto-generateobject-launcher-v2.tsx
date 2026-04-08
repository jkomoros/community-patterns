/// <cts-enable />
/**
 * @title Extract Launcher V2
 * @description Launcher for pattern() wrapper test
 */
import { handler, NAME, navigateTo, pattern, UI } from "commonfabric";

import ExtractTargetV2 from "./navigateto-generateobject-target-v2.tsx";

const launchTarget = handler<void, void>(() =>
  navigateTo(
    ExtractTargetV2({
      notes: "Created via navigateTo - testing pattern() wrapper!",
    }),
  )
);

export default pattern(() => {
  return {
    [NAME]: "Extract Launcher V2",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Extract Launcher V2</h1>

        <div
          style={{
            backgroundColor: "#dbeafe",
            padding: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <strong>TEST 1:</strong>{" "}
          Target uses pattern() wrapper instead of pattern()
        </div>

        <h2>Reproduction Steps</h2>
        <ol>
          <li>Click "Launch Extract Target V2" below</li>
          <li>In the target charm, click "Run Extraction"</li>
          <li>If ~90 second freeze: pattern() is the cause</li>
          <li>If ~4 seconds: Need to add more complexity</li>
        </ol>

        <cf-button onClick={launchTarget()}>
          Launch Extract Target V2
        </cf-button>
      </div>
    ),
  };
});
