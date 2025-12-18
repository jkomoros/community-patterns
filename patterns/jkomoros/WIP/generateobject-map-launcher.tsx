/// <cts-enable />
/**
 * @title generateObject Map Perf Launcher
 * @description Launcher for the generateObject + map performance repro
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import GenerateObjectMapRepro from "./generateobject-map-perf-repro.tsx";

// Long notes with many extractable fields (same as person-test-launcher.tsx)
const LONG_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing. Lead scientist at GeneTech Labs. Published 25+ peer-reviewed papers. Avid rock climber. Speaks Spanish and English. MIT PhD 2015.`;

// Short notes with fewer extractable fields
const SHORT_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890

Biotech researcher at GeneTech Labs.`;

const launchWithLongNotes = handler<void, void>(() =>
  navigateTo(GenerateObjectMapRepro({ notes: LONG_NOTES }))
);

const launchWithShortNotes = handler<void, void>(() =>
  navigateTo(GenerateObjectMapRepro({ notes: SHORT_NOTES }))
);

export default pattern(() => {
  return {
    [NAME]: "generateObject Map Perf Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>generateObject + Map Perf Launcher</h1>

        <div
          style={{
            backgroundColor: "#fef3c7",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "4px",
          }}
        >
          <strong>Test:</strong> Does navigateTo() + generateObject() + ifElse()
          + nested map cause the ~30s CPU spike?
        </div>

        <h2>Test Cases</h2>

        <div style={{ marginBottom: "1rem" }}>
          <h3>Case 1: Long Notes (9+ extractable fields)</h3>
          <p style={{ fontSize: "0.875rem", color: "#666" }}>
            Should trigger the bug if the issue is field count + nested maps
          </p>
          <ct-button onClick={launchWithLongNotes()}>
            Launch with Long Notes
          </ct-button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h3>Case 2: Short Notes (4 extractable fields)</h3>
          <p style={{ fontSize: "0.875rem", color: "#666" }}>
            Should be fast (below threshold)
          </p>
          <ct-button onClick={launchWithShortNotes()}>
            Launch with Short Notes
          </ct-button>
        </div>

        <h2>What to Test</h2>
        <ol style={{ fontSize: "0.875rem" }}>
          <li>Click "Launch with Long Notes"</li>
          <li>Wait for charm to load</li>
          <li>Click "Extract Data"</li>
          <li>Time how long until the results modal appears</li>
          <li>Expected: instant. Actual (if bug exists): ~30 seconds</li>
        </ol>

        <h2>Notes Content</h2>
        <h3>Long Notes:</h3>
        <pre
          style={{
            backgroundColor: "#f3f4f6",
            padding: "0.5rem",
            fontSize: "0.625rem",
            overflow: "auto",
            maxHeight: "150px",
          }}
        >
          {LONG_NOTES}
        </pre>

        <h3>Short Notes:</h3>
        <pre
          style={{
            backgroundColor: "#f3f4f6",
            padding: "0.5rem",
            fontSize: "0.625rem",
            overflow: "auto",
            maxHeight: "100px",
          }}
        >
          {SHORT_NOTES}
        </pre>
      </div>
    ),
  };
});
