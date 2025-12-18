/// <cts-enable />
/**
 * @title Extract Launcher
 * @description Minimal repro launcher - triggers the ~90s CPU spike bug
 *
 * BUG REPRO: Click the button to create a new ExtractTarget charm via navigateTo.
 * When you then run extraction in that target, it will take ~90 seconds instead
 * of being instant.
 *
 * Compare to deploying ExtractTarget directly via `deno task ct charm new` -
 * that works correctly and extraction is nearly instant.
 *
 * See: patterns/jkomoros/issues/ISSUE-navigateTo-generateObject-cpu-spike.md
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import ExtractTarget from "./navigateto-generateobject-target.tsx";

const launchTarget = handler<void, void>(() =>
  navigateTo(ExtractTarget({ notes: "Created via navigateTo - extraction will be slow!" }))
);

export default pattern(() => {
  return {
    [NAME]: "Extract Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Extract Launcher (Bug Repro)</h1>

        <div style={{ backgroundColor: "#fee2e2", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>This reproduces a bug:</strong> Click the button below, then run extraction
          in the target charm. It will take ~90 seconds instead of being instant.
        </div>

        <h2>Reproduction Steps</h2>
        <ol>
          <li>Click "Launch Extract Target" below</li>
          <li>In the target charm, click "Run Extraction"</li>
          <li>Observe: ~90 second CPU freeze</li>
        </ol>

        <h2>Expected vs Actual</h2>
        <ul>
          <li><strong>Expected:</strong> Extraction completes in ~2-3 seconds</li>
          <li><strong>Actual:</strong> ~90 second CPU spike, then completes</li>
        </ul>

        <h2>Control Test</h2>
        <p>Deploy ExtractTarget directly via:</p>
        <code style={{ display: "block", backgroundColor: "#f3f4f6", padding: "0.5rem", marginBottom: "1rem" }}>
          deno task ct charm new patterns/jkomoros/WIP/navigateto-generateobject-target.tsx
        </code>
        <p>Extraction in directly-deployed charm is nearly instant.</p>

        <ct-button onClick={launchTarget()}>
          Launch Extract Target
        </ct-button>
      </div>
    ),
  };
});
