/// <cts-enable />
/**
 * @title Person No-AutoLayout Launcher
 * @description Test if ct-autolayout is the cause of the ~40s freeze
 *
 * ## Purpose
 *
 * This launcher tests the hypothesis that ct-autolayout causes the freeze:
 * - Uses navigateTo to create person-no-autolayout.tsx (ct-autolayout removed)
 * - If freeze STILL happens → ct-autolayout is NOT the cause
 * - If freeze is GONE → ct-autolayout IS the cause
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import Person from "./person-no-autolayout.tsx";

// Same demo notes that trigger the bug in person.tsx
const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing. Lead scientist at GeneTech Labs. Published 25+ peer-reviewed papers. Avid rock climber. Speaks Spanish and English. MIT PhD 2015.`;

const launchPerson = handler<unknown, Record<string, never>>(() => {
  console.log("[NO-AUTOLAYOUT LAUNCHER] Navigating to person WITHOUT ct-autolayout...");
  navigateTo(Person({ notes: DEMO_NOTES }));
});

export default pattern(() => {
  return {
    [NAME]: "Person No-AutoLayout Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Person No-AutoLayout Test</h1>

        <div style={{ backgroundColor: "#fef3c7", padding: "0.75rem", marginBottom: "1rem", borderRadius: "4px" }}>
          <strong>Hypothesis:</strong>
          <br />
          ct-autolayout causes the ~40s freeze. This test removes ct-autolayout from person.tsx.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Test Steps:</strong>
          <ol>
            <li>Click "Launch Person" below</li>
            <li>In the person charm, click "Extract Data from Notes"</li>
            <li>If freeze still happens → ct-autolayout is NOT the cause</li>
            <li>If instant → ct-autolayout IS the cause</li>
          </ol>
        </div>

        <ct-button onClick={launchPerson({})}>
          Launch Person (WITHOUT ct-autolayout)
        </ct-button>
      </div>
    ),
  };
});
