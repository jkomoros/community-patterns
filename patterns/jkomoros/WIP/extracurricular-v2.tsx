/// <cts-enable />
/**
 * Extracurricular Selector v2
 *
 * An idiomatic rewrite following framework author guidance:
 * - State lives ON objects (no separate ID maps)
 * - No local ID generation (use Cell.equals())
 * - Embed references (location: Location, not locationId)
 * - Fewer top-level Default<> inputs
 *
 * Phase 2: Classes with embedded state
 */
import { cell, Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";

// ============================================================================
// TYPES
// ============================================================================

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

interface Location {
  name: string;
  type: "afterschool-onsite" | "afterschool-offsite" | "external";
  address: string;
}

interface TimeSlot {
  day: DayOfWeek;
  startTime: string;  // "15:00"
  endTime: string;    // "16:30"
}

interface StatusFlags {
  registered: boolean;
  confirmed: boolean;
  waitlisted: boolean;
  paid: boolean;
  onCalendar: boolean;
}

// The main Class entity - ALL state embedded on the object
interface Class {
  name: string;
  description: string;
  location: Location;           // EMBEDDED reference, not ID
  timeSlots: TimeSlot[];
  cost: number;
  // STATE ON OBJECT (not in separate maps)
  pinnedInSets: string[];       // Which sets this class is pinned to
  statuses: StatusFlags;        // Registration status tracking
}

// ============================================================================
// PATTERN INPUT - Phase 2
// ============================================================================

interface ExtracurricularInput {
  locations: Cell<Location[]>;
  classes: Cell<Class[]>;
}

interface ExtracurricularOutput extends ExtracurricularInput {
  [NAME]: string;
  [UI]: JSX.Element;
}

// ============================================================================
// PATTERN
// ============================================================================

export default pattern<ExtracurricularInput, ExtracurricularOutput>(
  ({ locations, classes }) => {
    // Local cell for selected location when adding a class
    const selectedLocationIndex = cell<number>(-1);

    // Handler to update selected location index
    const setLocationIndex = handler<
      { target: { value: string } },
      { idx: Cell<number> }
    >((event, state) => {
      state.idx.set(parseInt(event.target.value, 10));
    });

    // Helper to toggle a status - takes classList explicitly to avoid closure issues
    const toggleStatus = (
      classList: Cell<Class[]>,
      cls: Class,
      statusKey: keyof StatusFlags
    ) => {
      const current = classList.get();
      const index = current.findIndex((el) => Cell.equals(cls, el));
      if (index >= 0) {
        const updated = {
          ...current[index],
          statuses: {
            ...current[index].statuses,
            [statusKey]: !current[index].statuses[statusKey],
          },
        };
        classList.set(current.toSpliced(index, 1, updated));
      }
    };

    return {
      [NAME]: "Extracurricular Selector v2",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Extracurricular Selector v2</h1>

          {/* Locations Section */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Locations</h2>

            {/* List locations */}
            <div style={{ marginBottom: "1rem" }}>
              {locations.map((loc) => (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.5rem",
                    background: "#f5f5f5",
                    borderRadius: "4px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: "bold" }}>{loc.name}</span>
                  <span style={{ color: "#666", fontSize: "0.9em" }}>
                    ({loc.type})
                  </span>
                  {loc.address && (
                    <span style={{ color: "#888", fontSize: "0.8em" }}>
                      - {loc.address}
                    </span>
                  )}
                  <button
                    style={{ marginLeft: "auto" }}
                    onClick={() => {
                      const current = locations.get();
                      const index = current.findIndex((el) =>
                        Cell.equals(loc, el)
                      );
                      if (index >= 0) {
                        locations.set(current.toSpliced(index, 1));
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {/* Add location */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h3 style={{ marginBottom: "0.5rem" }}>Add Location</h3>
              <ct-message-input
                placeholder="Location name (e.g., TBS, BAM)"
                onct-send={(e: { detail: { message: string } }) => {
                  const name = e.detail?.message?.trim();
                  if (name) {
                    locations.push({
                      name,
                      type: "afterschool-onsite",
                      address: "",
                    });
                  }
                }}
              />
            </div>
          </div>

          {/* Classes Section */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Classes</h2>

            {/* List classes - use derive() to avoid closure issues */}
            <div style={{ marginBottom: "1rem" }}>
              {derive({ classes }, ({ classes: classList }) =>
                classList.map((cls) => (
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "#f9f9f9",
                      border: "1px solid #e0e0e0",
                      borderRadius: "4px",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontWeight: "bold", fontSize: "1.1em" }}>{cls.name}</span>
                        <span style={{ marginLeft: "0.5rem", color: "#666", fontSize: "0.9em" }}>
                          @ {cls.location.name}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const current = classList.get();
                          const index = current.findIndex((el) => Cell.equals(cls, el));
                          if (index >= 0) {
                            classList.set(current.toSpliced(index, 1));
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {cls.description && (
                      <p style={{ margin: "0.5rem 0", color: "#555", fontSize: "0.9em" }}>
                        {cls.description}
                      </p>
                    )}
                    {/* Status checkboxes - embedded state */}
                    <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                        <input
                          type="checkbox"
                          checked={cls.statuses.registered}
                          onChange={() => toggleStatus(classList, cls, "registered")}
                        />
                        Registered
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                        <input
                          type="checkbox"
                          checked={cls.statuses.confirmed}
                          onChange={() => toggleStatus(classList, cls, "confirmed")}
                        />
                        Confirmed
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                        <input
                          type="checkbox"
                          checked={cls.statuses.paid}
                          onChange={() => toggleStatus(classList, cls, "paid")}
                        />
                        Paid
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                        <input
                          type="checkbox"
                          checked={cls.statuses.onCalendar}
                          onChange={() => toggleStatus(classList, cls, "onCalendar")}
                        />
                        On Calendar
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add class form */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h3 style={{ marginBottom: "0.5rem" }}>Add Class</h3>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Location:
                </label>
                <select
                  style={{ width: "100%", padding: "0.5rem" }}
                  onChange={setLocationIndex({ idx: selectedLocationIndex })}
                >
                  <option value="-1">-- Select a location --</option>
                  {locations.map((loc, idx) => (
                    <option value={idx}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <ct-message-input
                placeholder="Class name (e.g., Robotics, Dance)"
                onct-send={(e: { detail: { message: string } }) => {
                  const name = e.detail?.message?.trim();
                  const locIdx = selectedLocationIndex.get();
                  const locs = locations.get();
                  if (name && locIdx >= 0 && locIdx < locs.length) {
                    classes.push({
                      name,
                      description: "",
                      location: locs[locIdx],  // EMBED the actual location object
                      timeSlots: [],
                      cost: 0,
                      pinnedInSets: [],
                      statuses: {
                        registered: false,
                        confirmed: false,
                        waitlisted: false,
                        paid: false,
                        onCalendar: false,
                      },
                    });
                  }
                }}
              />
            </div>
          </div>

          {/* Debug info */}
          <div style={{ marginTop: "2rem", padding: "1rem", background: "#f0f0f0", borderRadius: "4px" }}>
            <h3>Debug Info</h3>
            <p style={{ fontSize: "0.8em", color: "#666" }}>
              Phase 2: Classes with embedded state - verify location reference and status toggles
            </p>
          </div>
        </div>
      ),
      locations,
      classes,
    };
  }
);
