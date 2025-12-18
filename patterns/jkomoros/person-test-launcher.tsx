/// <cts-enable />
/**
 * @title Person Test Launcher
 * @description Fresh launcher to test person.tsx via navigateTo
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import Person from "./person.tsx";

// Using the SAME demo notes as navigateto-generateobject-launcher-real.tsx
const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing. Lead scientist at GeneTech Labs. Published 25+ peer-reviewed papers. Avid rock climber. Speaks Spanish and English. MIT PhD 2015.`;

const launchPerson = handler<void, void>(() =>
  navigateTo(Person({ notes: DEMO_NOTES }))
);

export default pattern(() => {
  return {
    [NAME]: "Person Test Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Person Test Launcher</h1>

        <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>TEST:</strong> Fresh launcher importing person.tsx (not a copy)
        </div>

        <ct-button onClick={launchPerson()}>
          Launch Person (with notes)
        </ct-button>
      </div>
    ),
  };
});
