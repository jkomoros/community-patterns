/// <cts-enable />
/**
 * Repro: Reactive Style Objects in JSX
 *
 * Tests whether individual computed style properties update reactively
 * vs a single computed returning the entire style object.
 *
 * CLAIM: Individual computed values within style object don't update reactively
 * WORKAROUND: Use single computed returning entire style object
 */
import { cell, computed, handler, NAME, recipe, UI } from "commontools";

export default recipe(
  "reactive-style-test",
  ({ isActive }: { isActive: boolean }) => {
    // === APPROACH 1: Individual computed properties (claimed to NOT work) ===
    const bgColor1 = computed(() => isActive ? "#28a745" : "#f0f0f0");
    const textColor1 = computed(() => isActive ? "#ffffff" : "#000000");

    // === APPROACH 2: Single computed returning entire style object (claimed to work) ===
    const fullStyle = computed(() => ({
      backgroundColor: isActive ? "#dc3545" : "#e0e0e0",
      color: isActive ? "#ffffff" : "#333333",
      padding: "12px 24px",
      borderRadius: "8px",
      fontWeight: "bold",
      display: "inline-block",
      margin: "4px",
    }));

    const toggle = handler((_, { isActive }) => {
      isActive.set(!isActive.get());
    });

    return {
      [NAME]: "Reactive Style Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Reactive Style Objects Test</h2>
          <p>Click button to toggle. Both boxes should change color.</p>

          <button
            onClick={toggle({ isActive })}
            style={{ padding: "10px 20px", fontSize: "16px", marginBottom: "20px" }}
          >
            Toggle Active State (currently: {isActive ? "ACTIVE" : "INACTIVE"})
          </button>

          <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
            {/* Approach 1: Individual computed properties */}
            <div>
              <h3>Approach 1: Individual Computed</h3>
              <p style={{ fontSize: "12px", color: "#666" }}>
                (Claimed to NOT work)
              </p>
              <span style={{
                backgroundColor: bgColor1,
                color: textColor1,
                padding: "12px 24px",
                borderRadius: "8px",
                fontWeight: "bold",
                display: "inline-block",
              }}>
                GREEN when active
              </span>
            </div>

            {/* Approach 2: Single computed style object */}
            <div>
              <h3>Approach 2: Full Style Object</h3>
              <p style={{ fontSize: "12px", color: "#666" }}>
                (Claimed to work)
              </p>
              <span style={fullStyle}>
                RED when active
              </span>
            </div>
          </div>

          <div style={{ marginTop: "30px", padding: "15px", background: "#f5f5f5", borderRadius: "8px" }}>
            <h4>Expected Behavior:</h4>
            <ul>
              <li>When INACTIVE: Both boxes should be gray</li>
              <li>When ACTIVE: Left box green, Right box red</li>
              <li>If Approach 1 fails: Left box stays gray when toggled</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
