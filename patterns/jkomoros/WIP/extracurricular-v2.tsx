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
 * Phase 3: LLM Import Flow
 */
import { cell, Cell, computed, Default, derive, generateObject, handler, ifElse, NAME, pattern, UI } from "commontools";

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
  gradeMin: string;
  gradeMax: string;
  // STATE ON OBJECT (not in separate maps)
  pinnedInSets: string[];       // Which sets this class is pinned to
  statuses: StatusFlags;        // Registration status tracking
}

// ============================================================================
// LLM EXTRACTION TYPES - Phase 3
// ============================================================================

// What the LLM extracts from schedule text
interface ExtractedClassInfo {
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  gradeMin: string;
  gradeMax: string;
  cost: number;
  notes: string;
}

// Full extraction response from LLM
interface ExtractionResponse {
  classes: ExtractedClassInfo[];
}

// Staged class for import preview - selection state ON object
interface StagedClass extends ExtractedClassInfo {
  selected: boolean;  // STATE ON OBJECT
}

// ============================================================================
// PATTERN INPUT - Phase 3
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

    // =========================================================================
    // PHASE 3: IMPORT FLOW
    // =========================================================================

    // Import state
    const importText = cell<string>("");
    const importLocationIndex = cell<number>(-1);
    const extractionTriggerText = cell<string>(""); // Triggers LLM when set

    // NOTE: For Phase 3, we skip individual selection and just import all extracted classes
    // Selection state can be added in a later phase if needed

    // Build extraction prompt from trigger text
    const extractionPrompt = computed(() => {
      const text = extractionTriggerText.get();
      if (!text || text.length < 50) return "";
      return `Extract class information from this schedule text:

${text}

For each class found, extract: name, dayOfWeek (lowercase), startTime (24h format), endTime (24h format), gradeMin, gradeMax, cost (number), and notes.`;
    });

    // Run LLM extraction - destructure result/pending like food-recipe.tsx
    const { result: extractionResponse, pending: extractionPending } = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: extractionPrompt,
      system: "You are a precise data extraction assistant. Extract class information exactly as found. Do not invent information.",
      schema: {
        type: "object",
        properties: {
          classes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                dayOfWeek: { type: "string" },
                startTime: { type: "string" },
                endTime: { type: "string" },
                gradeMin: { type: "string" },
                gradeMax: { type: "string" },
                cost: { type: "number" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
    });

    // Compute staged classes directly from extraction response (avoids closure issues)
    const computedStagedClasses = computed(() => {
      const response = extractionResponse as any;
      if (!response?.classes) return [] as StagedClass[];
      return response.classes.map((cls: ExtractedClassInfo) => ({
        ...cls,
        selected: true, // Default to selected
      }));
    });

    // Import all extracted classes (simplified for Phase 3 - no individual selection)
    // Uses handler pattern to avoid closure issues
    const doImportAll = handler<
      unknown,
      { locIdx: Cell<number>; locs: Cell<Location[]>; classList: Cell<Class[]>; extracted: any; trigger: Cell<string>; text: Cell<string> }
    >((_, { locIdx, locs, classList, extracted, trigger, text }) => {
      const locationIndex = locIdx.get();
      const locationList = locs.get();
      if (locationIndex < 0 || locationIndex >= locationList.length) return;

      const location = locationList[locationIndex];
      const response = extracted as any;
      if (!response?.classes) return;

      for (const cls of response.classes) {
        classList.push({
          name: cls.name || "",
          description: cls.notes || "",
          location,
          timeSlots: [{
            day: (cls.dayOfWeek || "monday") as DayOfWeek,
            startTime: cls.startTime || "",
            endTime: cls.endTime || "",
          }],
          cost: cls.cost || 0,
          gradeMin: cls.gradeMin || "",
          gradeMax: cls.gradeMax || "",
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

      // Clear import state
      trigger.set("");
      text.set("");
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
                      gradeMin: "",
                      gradeMax: "",
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

          {/* Import Section - Phase 3 */}
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Import Classes</h2>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              {/* Location selector for import */}
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Import to Location:
                </label>
                <select
                  style={{ width: "100%", padding: "0.5rem" }}
                  onChange={setLocationIndex({ idx: importLocationIndex })}
                >
                  <option value="-1">-- Select a location --</option>
                  {locations.map((loc, idx) => (
                    <option value={idx}>{loc.name}</option>
                  ))}
                </select>
              </div>

              {/* Text input for schedule */}
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                  Paste schedule text:
                </label>
                <ct-textarea
                  style={{ width: "100%", minHeight: "150px" }}
                  placeholder="Paste schedule HTML or text here..."
                  $value={importText}
                />
              </div>

              {/* Extract button */}
              <button
                style={{ padding: "0.5rem 1rem", marginBottom: "1rem" }}
                onClick={() => {
                  const text = importText.get();
                  if (text && text.length >= 50) {
                    extractionTriggerText.set(text);
                  }
                }}
              >
                Extract Classes
              </button>

              {/* Extraction status */}
              {ifElse(
                extractionPending,
                <p style={{ color: "#666", fontStyle: "italic" }}>Extracting classes...</p>,
                null
              )}

              {/* Show extracted classes and import button */}
              {derive({ computedStagedClasses }, ({ computedStagedClasses: staged }) => {
                  // In derive, values are already unwrapped - no .get() needed
                  const list = staged as StagedClass[];
                  if (!list || list.length === 0) return null;
                  return (
                    <div style={{ marginTop: "1rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
                      <h4 style={{ marginBottom: "0.5rem" }}>Extracted Classes ({list.length})</h4>
                      {list.map((s: StagedClass) => (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.5rem",
                            background: "#fff",
                            borderRadius: "4px",
                            marginBottom: "0.25rem",
                          }}
                        >
                          <span style={{ fontWeight: "bold" }}>{s.name}</span>
                          <span style={{ color: "#666", fontSize: "0.85em" }}>
                            {s.dayOfWeek} {s.startTime}-{s.endTime}
                          </span>
                          {s.gradeMin && s.gradeMax && (
                            <span style={{ color: "#888", fontSize: "0.8em" }}>
                              Gr {s.gradeMin}-{s.gradeMax}
                            </span>
                          )}
                          {s.cost > 0 && (
                            <span style={{ color: "#2e7d32", fontSize: "0.8em" }}>
                              ${s.cost}
                            </span>
                          )}
                        </div>
                      ))}

                      {/* Import all button - pass original Cell references via handler pattern */}
                      <button
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.5rem 1rem",
                          background: "#1976d2",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                        }}
                        onClick={doImportAll({
                          locIdx: importLocationIndex,
                          locs: locations,
                          classList: classes,
                          extracted: extractionResponse,
                          trigger: extractionTriggerText,
                          text: importText,
                        })}
                      >
                        Import All {list.length} Classes
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* Debug info */}
          <div style={{ marginTop: "2rem", padding: "1rem", background: "#f0f0f0", borderRadius: "4px" }}>
            <h3>Debug Info</h3>
            <p style={{ fontSize: "0.8em", color: "#666" }}>
              Phase 3: LLM Import Flow - paste schedule text, extract, review, confirm
            </p>
          </div>
        </div>
      ),
      locations,
      classes,
    };
  }
);
