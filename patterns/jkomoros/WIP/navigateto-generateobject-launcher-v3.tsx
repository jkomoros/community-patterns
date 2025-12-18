/// <cts-enable />
/**
 * @title Extract Launcher V3
 * @description Launcher for changesPreview test (Test 2)
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import ExtractTargetV3 from "./navigateto-generateobject-target-v3.tsx";

const launchTarget = handler<void, void>(() =>
  navigateTo(ExtractTargetV3({ notes: "Created via navigateTo - testing changesPreview!" }))
);

export default pattern(() => {
  return {
    [NAME]: "Extract Launcher V3",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Extract Launcher V3</h1>

        <div style={{ backgroundColor: "#dbeafe", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>TEST 2:</strong> Target uses recipe() + changesPreview + notesDiffChunks
        </div>

        <h2>Reproduction Steps</h2>
        <ol>
          <li>Click "Launch Extract Target V3" below</li>
          <li>In the target charm, click "Run Extraction"</li>
          <li>If ~90 second freeze: changesPreview is the cause</li>
          <li>If ~4 seconds: Need to add more complexity</li>
        </ol>

        <ct-button onClick={launchTarget()}>
          Launch Extract Target V3
        </ct-button>
      </div>
    ),
  };
});
