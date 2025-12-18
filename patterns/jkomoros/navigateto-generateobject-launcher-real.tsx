/// <cts-enable />
/**
 * @title Real Person Launcher
 * @description Launcher that creates REAL person.tsx via navigateTo
 *
 * This tests if the bug is in person.tsx specifically, not our minimal repros.
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

import Person from "./person.tsx";
import { DEMO_PERSON_NOTES } from "./demo-constants.ts";

const launchPerson = handler<void, void>(() =>
  navigateTo(Person({ notes: DEMO_PERSON_NOTES }))
);

const launchPersonEmpty = handler<void, void>(() =>
  navigateTo(Person({}))
);

export default pattern(() => {
  return {
    [NAME]: "Real Person Launcher",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Real Person Launcher</h1>

        <div style={{ backgroundColor: "#fee2e2", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>TEST:</strong> This launches the REAL person.tsx pattern via navigateTo
        </div>

        <h2>Reproduction Steps</h2>
        <ol>
          <li>Click "Launch Real Person (with demo notes)" below</li>
          <li>In the person charm, click "Extract Data from Notes"</li>
          <li>If ~90 second freeze: person.tsx + navigateTo is the trigger</li>
          <li>If fast: Bug may be environment/state dependent</li>
        </ol>

        <ct-button onClick={launchPerson()}>
          Launch Real Person (with demo notes)
        </ct-button>

        <div style={{ marginTop: "1rem" }}>
          <ct-button onClick={launchPersonEmpty()}>
            Launch Real Person (empty)
          </ct-button>
        </div>
      </div>
    ),
  };
});
