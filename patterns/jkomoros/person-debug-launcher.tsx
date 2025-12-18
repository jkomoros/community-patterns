/// <cts-enable />
/**
 * @title Person Debug Launcher
 * @description Launcher for debugging person.tsx CPU spike - whittle down approach
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import PersonDebug from "./person-debug.tsx";

const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03

Biotech researcher at GeneTech Labs.`;

const launchDebug = handler<void, void>(() =>
  navigateTo(PersonDebug({ notes: DEMO_NOTES }))
);

const launchDebugEmpty = handler<void, void>(() =>
  navigateTo(PersonDebug({}))
);

export default pattern(() => {
  return {
    [NAME]: "Person Debug Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Person Debug Launcher</h1>

        <div style={{ backgroundColor: "#fee2e2", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>Strategy:</strong> Start with full person.tsx, remove chunks until FAST
        </div>

        <h2>person-debug.tsx (copy of person.tsx)</h2>
        <p>Should be SLOW (~90s) - confirms bug exists in copy</p>

        <ct-button onClick={launchDebug()}>
          Launch Debug (with notes)
        </ct-button>

        <div style={{ marginTop: "0.5rem" }}>
          <ct-button onClick={launchDebugEmpty()}>
            Launch Debug (empty)
          </ct-button>
        </div>
      </div>
    ),
  };
});
