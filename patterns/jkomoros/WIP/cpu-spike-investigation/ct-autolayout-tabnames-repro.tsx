/// <cts-enable />
/**
 * @title CTAutoLayout TabNames Bug Repro
 * @description Minimal test for ct-autolayout tabNames undefined issue
 */
import {
  handler,
  ifElse,
  NAME,
  recipe,
  UI,
  Writable,
} from "commontools";

type Props = {
  notes?: string;
};

// Handlers defined OUTSIDE the recipe
const showModalHandler = handler<void, { showModal: Writable<boolean> }>(
  (_, { showModal }) => {
    console.log("[TEST] Showing modal...");
    showModal.set(true);
  }
);

const hideModalHandler = handler<void, { showModal: Writable<boolean> }>(
  (_, { showModal }) => {
    console.log("[TEST] Hiding modal...");
    showModal.set(false);
  }
);

export default recipe<Props>(({ notes }) => {
  const showModal = Writable.of(false);

  return {
    [NAME]: "CTAutoLayout TabNames Test",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <h2>TabNames Bug Test</h2>
        </div>

        {ifElse(
          showModal,
          // Modal view with ct-autolayout
          <ct-autolayout tabNames={["Modal Content"]}>
            <ct-vstack style={{ padding: "16px", gap: "12px" }}>
              <h3>Modal is Open</h3>
              <p>If this appeared without freezing, tabNames was defined.</p>
              <p>Notes: {notes}</p>
              <ct-button onClick={hideModalHandler({ showModal })}>
                Close Modal
              </ct-button>
            </ct-vstack>
          </ct-autolayout>,
          // Form view
          <ct-autolayout tabNames={["Form"]}>
            <ct-vstack style={{ padding: "16px", gap: "12px" }}>
              <div style={{ backgroundColor: "#fee2e2", padding: "12px", borderRadius: "4px" }}>
                <strong>Bug Test:</strong> Click button to show modal with ct-autolayout.
              </div>
              <p>Notes: {notes}</p>
              <ct-button onClick={showModalHandler({ showModal })}>
                Show Modal (test tabNames)
              </ct-button>
            </ct-vstack>
          </ct-autolayout>
        )}
      </ct-screen>
    ),
    notes,
  };
});
