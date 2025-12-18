/// <cts-enable />
/**
 * @title CTAutoLayout TabNames Launcher
 * @description Launcher to test ct-autolayout via navigateTo
 *
 * ## Purpose
 *
 * This launcher tests if navigateTo causes the tabNames bug:
 * 1. Click "Launch Test" to navigateTo the ct-autolayout test pattern
 * 2. In that pattern, click "Show Modal"
 * 3. If it freezes for ~40 seconds, the bug is in navigateTo + ct-autolayout
 * 4. If it's instant, the bug is NOT in ct-autolayout's tabNames
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import CTAutoLayoutTest from "./ct-autolayout-tabnames-repro.tsx";

// Same demo notes that trigger the bug in person.tsx
const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing at GeneTech Labs. Previously at MIT. Published 15+ papers on genetic modification.`;

const launchTest = handler<void, void>(() => {
  console.log("[LAUNCHER] Navigating to ct-autolayout test...");
  navigateTo(CTAutoLayoutTest({ notes: DEMO_NOTES }));
});

export default pattern(() => {
  return {
    [NAME]: "CTAutoLayout TabNames Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>CTAutoLayout TabNames Bug Test</h1>

        <div style={{ backgroundColor: "#dbeafe", padding: "0.75rem", marginBottom: "1rem", borderRadius: "4px" }}>
          <strong>Test Hypothesis:</strong>
          <br />
          The ~40s freeze is caused by <code>ct-autolayout</code> having undefined <code>tabNames</code>
          during certain render cycles when using navigateTo.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Test Steps:</strong>
          <ol>
            <li>Click "Launch Test" below</li>
            <li>In the new charm, click "Show Modal"</li>
            <li>If it freezes ~40 seconds → tabNames bug confirmed</li>
            <li>If instant → bug is NOT in ct-autolayout tabNames</li>
          </ol>
        </div>

        <ct-button onClick={launchTest()}>
          Launch Test (via navigateTo)
        </ct-button>
      </div>
    ),
  };
});
