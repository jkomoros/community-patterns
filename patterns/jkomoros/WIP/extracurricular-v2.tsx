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
 * Phase 6: Conflict Detection
 */
import { cell, Cell, computed, Default, derive, generateObject, handler, ifElse, NAME, pattern, UI } from "commontools";

// ============================================================================
// TYPES
// ============================================================================

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

// Grade levels for eligibility filtering
type Grade = "TK" | "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

// Child profile for triage logic
interface ChildProfile {
  name: string;
  grade: Grade;
  birthDate: string;
  eligibilityNotes: string;
}

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

// Triage status for eligibility filtering
type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review";

// ============================================================================
// PHASE 5.5: FILE/IMAGE UPLOAD TYPES
// ============================================================================

// File/Image data type for unified upload
type FileData = {
  id: string;
  name: string;
  url: string;
  data: string;  // base64 encoded
  timestamp: number;
  size: number;
  type: string;  // MIME type
  width?: number;
  height?: number;
};

// Processing state for uploaded file
type ProcessingStatus = "idle" | "processing" | "complete" | "error";

// Staged class for import preview - selection state ON object
interface StagedClass extends ExtractedClassInfo {
  selected: boolean;  // STATE ON OBJECT
  triageStatus: TriageStatus;
  triageReason: string;
}

// ============================================================================
// PATTERN INPUT - Phase 5
// ============================================================================

interface ExtracurricularInput {
  locations: Cell<Location[]>;
  classes: Cell<Class[]>;
  child: Cell<ChildProfile>;  // Cell<> for write access, not Default<>
  // Phase 5: Pinned sets
  pinnedSetNames: Cell<string[]>;  // Available set names
  activeSetName: Cell<string>;     // Currently active set
}

interface ExtracurricularOutput extends ExtracurricularInput {
  [NAME]: string;
  [UI]: JSX.Element;
}

// ============================================================================
// PATTERN
// ============================================================================

// ============================================================================
// TRIAGE LOGIC - Phase 4
// ============================================================================

// Grade order for comparison
const GRADE_ORDER: Grade[] = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8"];

function gradeToIndex(grade: string): number {
  const normalized = grade.toUpperCase().trim();
  const idx = GRADE_ORDER.indexOf(normalized as Grade);
  return idx >= 0 ? idx : -1;
}

function isGradeInRange(childGrade: Grade, gradeMin: string, gradeMax: string): { eligible: boolean; reason: string } {
  const childIdx = gradeToIndex(childGrade);
  const minIdx = gradeToIndex(gradeMin);
  const maxIdx = gradeToIndex(gradeMax);

  // If we can't parse the grades, needs review
  if (childIdx < 0) return { eligible: false, reason: "Unknown child grade" };
  if (minIdx < 0 || maxIdx < 0) return { eligible: false, reason: "Unknown class grade range" };

  if (childIdx >= minIdx && childIdx <= maxIdx) {
    return { eligible: true, reason: `Grade ${childGrade} is within ${gradeMin}-${gradeMax}` };
  } else if (childIdx < minIdx) {
    return { eligible: false, reason: `Grade ${childGrade} is below minimum (${gradeMin})` };
  } else {
    return { eligible: false, reason: `Grade ${childGrade} is above maximum (${gradeMax})` };
  }
}

function triageClass(cls: ExtractedClassInfo, childGrade: Grade): { status: TriageStatus; reason: string } {
  // Check for "with permission" or similar notes that suggest needs_review
  const notes = (cls.notes || "").toLowerCase();
  const hasPermissionNote = notes.includes("permission") || notes.includes("approval");

  const { eligible, reason } = isGradeInRange(childGrade, cls.gradeMin, cls.gradeMax);

  if (eligible) {
    if (hasPermissionNote) {
      return { status: "needs_review", reason: `${reason}, but requires permission` };
    }
    return { status: "auto_kept", reason };
  } else {
    return { status: "auto_discarded", reason };
  }
}

// ============================================================================
// PHASE 5.5: FILE TYPE DETECTION
// ============================================================================

function detectFileType(file: FileData): "image" | "text" | "unsupported" {
  const mimeType = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() || '';

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/") || ["txt", "md", "html", "htm"].includes(ext)) return "text";
  return "unsupported";
}

// ============================================================================
// PHASE 6: CONFLICT DETECTION
// ============================================================================

// A conflict between two classes
interface TimeConflict {
  class1: Class;
  class2: Class;
  day: DayOfWeek;
  overlapStart: string;
  overlapEnd: string;
}

// Parse "15:00" or "3:00 PM" to minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return -1;

  const cleaned = timeStr.trim().toUpperCase();

  // Handle 24h format "15:00"
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [hours, mins] = cleaned.split(":").map(Number);
    return hours * 60 + mins;
  }

  // Handle 12h format "3:00 PM" or "3:00PM"
  const match12h = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match12h) {
    let hours = parseInt(match12h[1], 10);
    const mins = parseInt(match12h[2], 10);
    const period = match12h[3];

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + mins;
  }

  return -1;  // Invalid format
}

// Check if two time slots on the same day overlap
function timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): { overlaps: boolean; overlapStart?: string; overlapEnd?: string } {
  // Different days = no conflict
  if (slot1.day !== slot2.day) {
    return { overlaps: false };
  }

  const start1 = parseTimeToMinutes(slot1.startTime);
  const end1 = parseTimeToMinutes(slot1.endTime);
  const start2 = parseTimeToMinutes(slot2.startTime);
  const end2 = parseTimeToMinutes(slot2.endTime);

  // Invalid times = no conflict (can't determine)
  if (start1 < 0 || end1 < 0 || start2 < 0 || end2 < 0) {
    return { overlaps: false };
  }

  // Check for overlap: NOT (end1 <= start2 OR end2 <= start1)
  if (end1 <= start2 || end2 <= start1) {
    return { overlaps: false };
  }

  // There is overlap - calculate the overlap window
  const overlapStartMins = Math.max(start1, start2);
  const overlapEndMins = Math.min(end1, end2);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  return {
    overlaps: true,
    overlapStart: formatTime(overlapStartMins),
    overlapEnd: formatTime(overlapEndMins),
  };
}

// ============================================================================
// PATTERN
// ============================================================================

export default pattern<ExtracurricularInput, ExtracurricularOutput>(
  ({ locations, classes, child, pinnedSetNames, activeSetName }) => {
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

    // Phase 5.5: Unified file/image upload state
    const uploadedFile = cell<FileData | null>(null);
    const uploadProcessingStatus = cell<ProcessingStatus>("idle");
    const uploadExtractedText = cell<string>("");  // Preview/edit buffer
    const uploadExtractionError = cell<string | null>(null);

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

    // Compute staged classes with triage status based on child's grade
    const computedStagedClasses = computed(() => {
      const response = extractionResponse as any;
      if (!response?.classes) return [] as StagedClass[];

      const childGrade = child.get().grade || "K";

      return response.classes.map((cls: ExtractedClassInfo) => {
        const triage = triageClass(cls, childGrade as Grade);
        return {
          ...cls,
          selected: triage.status !== "auto_discarded", // Auto-select kept and needs_review
          triageStatus: triage.status,
          triageReason: triage.reason,
        };
      });
    });

    // Import selected (eligible) classes - filters out auto_discarded
    // Uses handler pattern to avoid closure issues
    const doImportAll = handler<
      unknown,
      { locIdx: Cell<number>; locs: Cell<Location[]>; classList: Cell<Class[]>; extracted: any; trigger: Cell<string>; text: Cell<string>; childCell: Cell<ChildProfile> }
    >((_, { locIdx, locs, classList, extracted, trigger, text, childCell }) => {
      const locationIndex = locIdx.get();
      const locationList = locs.get();
      if (locationIndex < 0 || locationIndex >= locationList.length) return;

      const location = locationList[locationIndex];
      const response = extracted as any;
      if (!response?.classes) return;

      // Get child grade for triage
      const childGrade = childCell.get().grade;

      for (const cls of response.classes) {
        // Re-run triage to check eligibility
        const triage = triageClass(cls, childGrade);
        if (triage.status === "auto_discarded") continue; // Skip ineligible classes

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

    // Handler to update child grade
    const setChildGrade = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      state.childCell.set({ ...current, grade: event.target.value as Grade });
    });

    // Handler to update child name
    const setChildName = handler<
      { target: { value: string } },
      { childCell: Cell<ChildProfile> }
    >((event, state) => {
      const current = state.childCell.get();
      state.childCell.set({ ...current, name: event.target.value });
    });

    // =========================================================================
    // PHASE 5.5: FILE/IMAGE UPLOAD HANDLERS
    // =========================================================================

    // Handle unified file upload
    const handleFileUpload = handler<
      { detail: { files: FileData[] } },
      {
        uploadedFile: Cell<FileData | null>;
        processingStatus: Cell<ProcessingStatus>;
        extractedText: Cell<string>;
        extractionError: Cell<string | null>;
      }
    >(({ detail }, { uploadedFile, processingStatus, extractedText, extractionError }) => {
      if (!detail?.files || detail.files.length === 0) return;

      const file = detail.files[detail.files.length - 1];  // Take most recent
      const fileType = detectFileType(file);

      // Reset state
      extractionError.set(null);
      extractedText.set("");

      if (fileType === "text") {
        // Direct text decode
        try {
          const base64 = file.data.split(",")[1];
          const text = atob(base64);
          extractedText.set(text);
          processingStatus.set("complete");
          uploadedFile.set(file);
        } catch (e) {
          extractionError.set("Failed to read text file");
          processingStatus.set("error");
        }
      } else if (fileType === "image") {
        // Trigger OCR (handled by generateObject reactive flow)
        uploadedFile.set(file);
        processingStatus.set("processing");
      } else {
        extractionError.set("Unsupported file type. Use images or text files.");
        processingStatus.set("error");
      }
    });

    // Apply extracted text to import field
    const applyExtractedText = handler<
      unknown,
      {
        extractedText: Cell<string>;
        importText: Cell<string>;
        uploadedFile: Cell<FileData | null>;
        processingStatus: Cell<ProcessingStatus>;
        ocrText: string | null;
      }
    >((_, { extractedText, importText, uploadedFile, processingStatus, ocrText }) => {
      // Use extracted text from file, or OCR result from image
      const text = extractedText.get() || ocrText || "";
      if (text) {
        importText.set(text);
        // Reset upload state
        uploadedFile.set(null);
        extractedText.set("");
        processingStatus.set("idle");
      }
    });

    // Cancel upload and reset state
    const cancelUpload = handler<
      unknown,
      {
        uploadedFile: Cell<FileData | null>;
        extractedText: Cell<string>;
        processingStatus: Cell<ProcessingStatus>;
        extractionError: Cell<string | null>;
      }
    >((_, { uploadedFile, extractedText, processingStatus, extractionError }) => {
      uploadedFile.set(null);
      extractedText.set("");
      processingStatus.set("idle");
      extractionError.set(null);
    });

    // Image OCR via generateObject - only fires when image is uploaded
    // CRITICAL: Use derive() for prompt, not computed() - derive handles generateObject reactivity correctly
    const { result: ocrResult, pending: ocrPending } = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      prompt: derive(uploadedFile, (file: FileData | null) => {
        // Return empty string to prevent API call when no image
        if (!file || !file.data || detectFileType(file) !== "image") {
          return "";
        }

        return [
          { type: "image" as const, image: file.data },
          {
            type: "text" as const,
            text: `Extract all text from this image of a class schedule or activity list.
Preserve the structure and formatting. Include: class names, days, times, grade levels, costs, and any descriptions or notes.
Return all visible text.`
          }
        ];
      }),
      schema: {
        type: "object",
        properties: {
          extractedText: { type: "string", description: "All text extracted from the image" },
        },
      },
    });

    // Computed: should show preview step
    const showPreview = computed(() => {
      const status = uploadProcessingStatus.get();
      const ocrText = (ocrResult as any)?.extractedText;
      const isOcrPending = ocrPending;
      return status === "complete" || (!isOcrPending && !!ocrText);
    });

    // Computed: text to show in preview (either from text file or OCR)
    const previewText = computed(() => {
      const textFromFile = uploadExtractedText.get();
      const textFromOcr = (ocrResult as any)?.extractedText || "";
      return textFromFile || textFromOcr;
    });

    // =========================================================================
    // PHASE 5: PINNED SETS
    // =========================================================================

    // Computed: classes pinned to the active set
    const pinnedClasses = computed(() => {
      const setName = activeSetName.get();
      const classList = classes.get();
      return classList.filter(cls => {
        const rawPins = cls.pinnedInSets;
        const pinArray: string[] = Array.isArray(rawPins) ? rawPins as string[] : [];
        return pinArray.indexOf(setName) >= 0;
      });
    });

    // Phase 6: Computed conflicts in active pinned set
    // Inside computed, directly access properties/indexes on other computeds (no casts needed)
    const pinnedSetConflicts = computed(() => {
      if (!pinnedClasses || pinnedClasses.length < 2) return [];

      const conflicts: TimeConflict[] = [];
      for (let i = 0; i < pinnedClasses.length; i++) {
        for (let j = i + 1; j < pinnedClasses.length; j++) {
          const class1 = pinnedClasses[i];
          const class2 = pinnedClasses[j];

          for (const slot1 of class1.timeSlots || []) {
            for (const slot2 of class2.timeSlots || []) {
              const result = timeSlotsOverlap(slot1, slot2);
              if (result.overlaps) {
                conflicts.push({
                  class1,
                  class2,
                  day: slot1.day,
                  overlapStart: result.overlapStart || "",
                  overlapEnd: result.overlapEnd || "",
                });
              }
            }
          }
        }
      }
      return conflicts;
    });

    // Handler to switch active set
    const setActiveSet = handler<
      { target: { value: string } },
      { activeCell: Cell<string> }
    >((event, state) => {
      state.activeCell.set(event.target.value);
    });

    return {
      [NAME]: "Extracurricular Selector v2",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Extracurricular Selector v2</h1>

          {/* Child Profile Section - Phase 4 */}
          <div style={{ marginBottom: "2rem", padding: "1rem", background: "#e8f5e9", borderRadius: "4px" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Child Profile</h2>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Name:</label>
                <input
                  type="text"
                  style={{ padding: "0.5rem", width: "200px" }}
                  value={(child as any).name || ""}
                  onChange={setChildName({ childCell: child })}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Grade:</label>
                <select
                  style={{ padding: "0.5rem" }}
                  value={(child as any).grade || "K"}
                  onChange={setChildGrade({ childCell: child })}
                >
                  <option value="TK">TK</option>
                  <option value="K">K</option>
                  <option value="1">1st</option>
                  <option value="2">2nd</option>
                  <option value="3">3rd</option>
                  <option value="4">4th</option>
                  <option value="5">5th</option>
                  <option value="6">6th</option>
                  <option value="7">7th</option>
                  <option value="8">8th</option>
                </select>
              </div>
            </div>
            <p style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "#555" }}>
              Classes will be auto-triaged based on grade eligibility
            </p>
          </div>

          {/* Pinned Sets Section - Phase 5 */}
          <div style={{ marginBottom: "2rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Pinned Sets</h2>
            <p style={{ fontSize: "0.85em", color: "#555", marginBottom: "0.5rem" }}>
              Create different schedule combinations to compare
            </p>

            {/* Set selector and add new set */}
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9em" }}>Active Set:</label>
                <select
                  style={{ padding: "0.5rem", minWidth: "150px" }}
                  value={(activeSetName as any) || "Set A"}
                  onChange={setActiveSet({ activeCell: activeSetName })}
                >
                  {pinnedSetNames.map((name) => (
                    <option value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <ct-message-input
                  placeholder="New set name..."
                  onct-send={(e: { detail: { message: string } }) => {
                    const name = e.detail?.message?.trim();
                    if (name) {
                      const current = pinnedSetNames.get();
                      if (!current.includes(name)) {
                        pinnedSetNames.push(name);
                        activeSetName.set(name);
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Pinned classes in active set */}
            {derive({ pinnedClasses, activeSetName }, ({ pinnedClasses: pinned, activeSetName: setName }) => {
              const list = pinned as Class[];
              if (!list || list.length === 0) {
                return (
                  <p style={{ color: "#666", fontStyle: "italic" }}>
                    No classes pinned to "{setName}". Use the 📌 button below to pin classes.
                  </p>
                );
              }
              return (
                <div>
                  <h4 style={{ marginBottom: "0.25rem" }}>Classes in "{setName}":</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {list.map((cls: Class) => (
                      <div
                        style={{
                          padding: "0.5rem 0.75rem",
                          background: "#fff",
                          border: "1px solid #1976d2",
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span>{cls.name}</span>
                        <span style={{ fontSize: "0.8em", color: "#666" }}>@ {cls.location.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Phase 6: Conflict warnings */}
            {derive(pinnedSetConflicts, (conflicts: TimeConflict[]) => {
              if (!conflicts || conflicts.length === 0) return null;
              return (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#ffebee", border: "1px solid #ef5350", borderRadius: "4px" }}>
                  <h4 style={{ color: "#c62828", marginBottom: "0.5rem" }}>
                    Schedule Conflicts ({conflicts.length})
                  </h4>
                  {conflicts.map((conflict: TimeConflict) => (
                    <div
                      style={{
                        padding: "0.5rem",
                        background: "#fff",
                        borderRadius: "4px",
                        marginBottom: "0.25rem",
                        fontSize: "0.9em",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>{conflict.class1.name}</span>
                      <span style={{ color: "#666" }}> conflicts with </span>
                      <span style={{ fontWeight: "bold" }}>{conflict.class2.name}</span>
                      <span style={{ color: "#888", marginLeft: "0.5rem" }}>
                        ({conflict.day} {conflict.overlapStart}-{conflict.overlapEnd})
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

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

            {/* List classes - direct Cell mapping, no derive needed */}
            <div style={{ marginBottom: "1rem" }}>
              {classes.map((cls, idx) => (
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {/* Pin button using inline closure */}
                      <button
                        style={{
                          border: "none",
                          borderRadius: "4px",
                          padding: "0.25rem 0.5rem",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          const current = classes.get();
                          const setName = activeSetName.get();
                          if (idx >= 0 && idx < current.length) {
                            const rawPins = current[idx].pinnedInSets;
                            const currentPins: string[] = Array.isArray(rawPins) ? rawPins : [];
                            const isPinned = currentPins.indexOf(setName) >= 0;
                            const newPins = isPinned
                              ? currentPins.filter((s: string) => s !== setName)
                              : [...currentPins, setName];
                            const updated = { ...current[idx], pinnedInSets: newPins };
                            classes.set(current.toSpliced(idx, 1, updated));
                          }
                        }}
                      >
                        📍
                      </button>
                      <span style={{ fontWeight: "bold", fontSize: "1.1em" }}>{cls.name}</span>
                      <span style={{ marginLeft: "0.5rem", color: "#666", fontSize: "0.9em" }}>
                        @ {cls.location.name}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const current = classes.get();
                        const index = current.findIndex((el) => Cell.equals(cls, el));
                        if (index >= 0) {
                          classes.set(current.toSpliced(index, 1));
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
                        onChange={() => toggleStatus(classes, cls, "registered")}
                      />
                      Registered
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                      <input
                        type="checkbox"
                        checked={cls.statuses.confirmed}
                        onChange={() => toggleStatus(classes, cls, "confirmed")}
                      />
                      Confirmed
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                      <input
                        type="checkbox"
                        checked={cls.statuses.paid}
                        onChange={() => toggleStatus(classes, cls, "paid")}
                      />
                      Paid
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85em" }}>
                      <input
                        type="checkbox"
                        checked={cls.statuses.onCalendar}
                        onChange={() => toggleStatus(classes, cls, "onCalendar")}
                      />
                      On Calendar
                    </label>
                  </div>
                </div>
              ))}
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

              {/* Phase 5.5: Unified Upload Section */}
              <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <ct-file-input
                    accept="image/*,.txt,.md,.html,.htm"
                    buttonText="Upload Schedule"
                    maxSizeBytes={3932160}
                    onct-change={handleFileUpload({
                      uploadedFile,
                      processingStatus: uploadProcessingStatus,
                      extractedText: uploadExtractedText,
                      extractionError: uploadExtractionError,
                    })}
                  />
                  <span style={{ fontSize: "0.85em", color: "#64748b" }}>
                    Photo (for OCR) or text file
                  </span>
                </div>

                {/* Error state */}
                {ifElse(
                  derive(uploadExtractionError, (e) => e !== null),
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#fef2f2", borderRadius: "4px", color: "#dc2626", fontSize: "0.85em" }}>
                    {uploadExtractionError}
                  </div>,
                  null
                )}

                {/* Processing state (image OCR) */}
                {ifElse(
                  ocrPending,
                  <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#dbeafe", borderRadius: "4px", color: "#1e40af", fontSize: "0.85em" }}>
                    Extracting text from image...
                  </div>,
                  null
                )}
              </div>

              {/* Preview Step - shown when extraction complete */}
              {ifElse(
                showPreview,
                <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "0.5rem", color: "#166534", fontWeight: "bold", fontSize: "0.9em" }}>
                    Text Extracted - Review & Edit
                  </div>
                  <ct-textarea
                    style={{ width: "100%", minHeight: "200px", fontFamily: "monospace", fontSize: "0.85em" }}
                    placeholder="Extracted text will appear here..."
                    $value={previewText}
                  />
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button
                      style={{ padding: "0.5rem 1rem", background: "#16a34a", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      onClick={applyExtractedText({
                        extractedText: uploadExtractedText,
                        importText,
                        uploadedFile,
                        processingStatus: uploadProcessingStatus,
                        ocrText: (ocrResult as any)?.extractedText || null,
                      })}
                    >
                      Use This Text
                    </button>
                    <button
                      style={{ padding: "0.5rem 1rem" }}
                      onClick={cancelUpload({
                        uploadedFile,
                        extractedText: uploadExtractedText,
                        processingStatus: uploadProcessingStatus,
                        extractionError: uploadExtractionError,
                      })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>,
                null
              )}

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

              {/* Show extracted classes with triage status */}
              {derive({ computedStagedClasses }, ({ computedStagedClasses: staged }) => {
                  // In derive, values are already unwrapped - no .get() needed
                  const list = staged as StagedClass[];
                  if (!list || list.length === 0) return null;

                  // Group by triage status
                  const kept = list.filter(s => s.triageStatus === "auto_kept");
                  const needsReview = list.filter(s => s.triageStatus === "needs_review");
                  const discarded = list.filter(s => s.triageStatus === "auto_discarded");
                  const selectedCount = list.filter(s => s.selected).length;

                  const getStatusColor = (status: TriageStatus) => {
                    switch (status) {
                      case "auto_kept": return { bg: "#e8f5e9", border: "#4caf50" };
                      case "needs_review": return { bg: "#fff3e0", border: "#ff9800" };
                      case "auto_discarded": return { bg: "#ffebee", border: "#f44336" };
                    }
                  };

                  const getStatusEmoji = (status: TriageStatus) => {
                    switch (status) {
                      case "auto_kept": return "✓";
                      case "needs_review": return "?";
                      case "auto_discarded": return "✗";
                    }
                  };

                  return (
                    <div style={{ marginTop: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
                      <h4 style={{ marginBottom: "0.5rem" }}>
                        Extracted Classes - Triage Results
                      </h4>
                      <p style={{ fontSize: "0.85em", color: "#666", marginBottom: "0.5rem" }}>
                        ✓ Eligible: {kept.length} | ? Review: {needsReview.length} | ✗ Ineligible: {discarded.length}
                      </p>

                      {list.map((s: StagedClass) => {
                        const colors = getStatusColor(s.triageStatus);
                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem",
                              background: colors.bg,
                              borderLeft: `3px solid ${colors.border}`,
                              borderRadius: "4px",
                              marginBottom: "0.25rem",
                              opacity: s.triageStatus === "auto_discarded" ? 0.6 : 1,
                            }}
                          >
                            <span style={{ fontWeight: "bold", minWidth: "20px" }}>
                              {getStatusEmoji(s.triageStatus)}
                            </span>
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
                            <span style={{ marginLeft: "auto", fontSize: "0.75em", color: "#666", maxWidth: "200px" }}>
                              {s.triageReason}
                            </span>
                          </div>
                        );
                      })}

                      {/* Import button - only imports selected (non-discarded) classes */}
                      <button
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.5rem 1rem",
                          background: selectedCount > 0 ? "#1976d2" : "#ccc",
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
                          childCell: child,
                        })}
                      >
                        Import {selectedCount} Eligible Classes
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
              Phase 6: Conflict detection for pinned sets
            </p>
          </div>
        </div>
      ),
      locations,
      classes,
      child,
      pinnedSetNames,
      activeSetName,
    };
  }
);
