/// <cts-enable />
/**
 * Extracurricular Selector
 *
 * Helps parents select compatible extracurricular activities for their child
 * from multiple sources (afterschool programs, private schools, external classes).
 *
 * Features:
 * - LLM extraction from messy HTML/text with eligibility triage
 * - Child profile for automatic filtering
 * - Multiple "pinned sets" to compare schedule alternatives
 * - Conflict detection with travel time consideration
 * - Status tracking (Registered, Confirmed, Paid, On-Calendar)
 * - Friend co-enrollment tracking
 */
import {
  Cell,
  cell,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";

// ============================================================================
// TYPES
// ============================================================================

type Grade = "PK" | "TK" | "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type LocationType = "afterschool" | "private_school" | "external" | "other";

type TriageStatus = "auto_kept" | "auto_discarded" | "needs_review" | "user_kept" | "user_discarded";

interface ChildProfile {
  name: string;
  grade: Grade;
  birthDate: string;
  eligibilityNotes: string;
}

interface CategoryTag {
  id: string;
  name: string;
  color: string;
}

interface Location {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  hasFlatDailyRate: boolean;
  dailyRate: number;
}

interface TravelTime {
  fromLocationId: string;
  toLocationId: string;
  minutes: number;
}

interface TimeSlot {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}

interface Class {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  timeSlots: TimeSlot[];
  cost: number;
  costPer: "semester" | "month" | "session";
  categoryTagIds: string[];
  categoryTagNames: string[];
  gradeMin: string;
  gradeMax: string;
  description: string;
  startDate: string;
  endDate: string;
}

interface StagedClass extends Class {
  triageStatus: TriageStatus;
  eligibilityReason: string;
  eligibilityConfidence: number;
}

interface Friend {
  id: string;
  name: string;
}

interface FriendClassInterest {
  friendId: string;
  friendName: string;
  classId: string;
  className: string;
  certainty: "confirmed" | "likely" | "maybe";
}

interface PreferencePriority {
  rank: number;
  type: "category" | "specific_class";
  categoryId: string;
  classId: string;
  displayName: string;
}

interface ClassStatus {
  classId: string;
  statuses: Record<string, boolean>;
  notes: string;
}

interface PinnedSet {
  id: string;
  name: string;
  classIds: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const DAYS_OF_WEEK: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const GRADE_OPTIONS: Grade[] = ["PK", "TK", "K", "1", "2", "3", "4", "5", "6", "7", "8"];

const DEFAULT_CATEGORY_TAGS: CategoryTag[] = [
  { id: "robotics", name: "Robotics", color: "#3b82f6" },
  { id: "dance", name: "Dance", color: "#ec4899" },
  { id: "art", name: "Art", color: "#f59e0b" },
  { id: "music", name: "Music", color: "#8b5cf6" },
  { id: "sports", name: "Sports", color: "#22c55e" },
  { id: "drama", name: "Drama", color: "#ef4444" },
  { id: "stem", name: "STEM", color: "#06b6d4" },
  { id: "language", name: "Language", color: "#6366f1" },
];

const DEFAULT_STATUS_TYPES = ["registered", "confirmed", "waitlisted", "paid", "onCalendar"];

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  paid: "Paid",
  onCalendar: "On Calendar",
};

// ============================================================================
// HANDLERS
// ============================================================================

// Location handlers
const addLocation = handler<
  unknown,
  { locations: Cell<Location[]>; newLocationForm: Cell<{ name: string; type: LocationType; address: string; hasFlatDailyRate: boolean; dailyRate: number }> }
>((_, { locations, newLocationForm }) => {
  const form = newLocationForm.get();
  if (!form.name.trim()) return;

  const newLocation: Location = {
    id: generateId(),
    name: form.name.trim(),
    type: form.type,
    address: form.address.trim(),
    hasFlatDailyRate: form.hasFlatDailyRate,
    dailyRate: form.dailyRate,
  };

  locations.push(newLocation);
  newLocationForm.set({ name: "", type: "afterschool", address: "", hasFlatDailyRate: false, dailyRate: 0 });
});

const removeLocation = handler<
  unknown,
  { locations: Cell<Location[]>; locationId: string }
>((_, { locations, locationId }) => {
  const current = locations.get();
  const index = current.findIndex((loc) => loc.id === locationId);
  if (index >= 0) {
    locations.set(current.toSpliced(index, 1));
  }
});

// Category tag handlers
const addCategoryTag = handler<
  unknown,
  { categoryTags: Cell<CategoryTag[]>; newTagName: Cell<string> }
>((_, { categoryTags, newTagName }) => {
  const name = newTagName.get().trim();
  if (!name) return;

  const existing = categoryTags.get();
  // Check for duplicate (case-insensitive)
  if (existing.some(t => t.name.toLowerCase() === name.toLowerCase())) return;

  const newTag: CategoryTag = {
    id: generateId(),
    name,
    color: "#6b7280", // default gray
  };

  categoryTags.push(newTag);
  newTagName.set("");
});

const removeCategoryTag = handler<
  unknown,
  { categoryTags: Cell<CategoryTag[]>; tagId: string }
>((_, { categoryTags, tagId }) => {
  const current = categoryTags.get();
  const index = current.findIndex((t) => t.id === tagId);
  if (index >= 0) {
    categoryTags.set(current.toSpliced(index, 1));
  }
});

// Friend handlers
const addFriend = handler<
  unknown,
  { friends: Cell<Friend[]>; newFriendName: Cell<string> }
>((_, { friends, newFriendName }) => {
  const name = newFriendName.get().trim();
  if (!name) return;

  const newFriend: Friend = {
    id: generateId(),
    name,
  };

  friends.push(newFriend);
  newFriendName.set("");
});

const removeFriend = handler<
  unknown,
  { friends: Cell<Friend[]>; friendId: string }
>((_, { friends, friendId }) => {
  const current = friends.get();
  const index = current.findIndex((f) => f.id === friendId);
  if (index >= 0) {
    friends.set(current.toSpliced(index, 1));
  }
});

// ============================================================================
// PATTERN
// ============================================================================

interface ExtracurricularSelectorInput {
  // Child profile - flattened for two-way binding (Cell for $value binding)
  childName: Cell<Default<string, "">>;
  childGrade: Cell<Default<Grade, "K">>;
  childBirthDate: Cell<Default<string, "">>;
  childEligibilityNotes: Cell<Default<string, "">>;
  // Collections - Default<> because framework provides them as Cells automatically
  locations: Default<Location[], []>;
  travelTimes: Default<TravelTime[], []>;
  categoryTags: Default<CategoryTag[], typeof DEFAULT_CATEGORY_TAGS>;
  classes: Default<Class[], []>;
  friends: Default<Friend[], []>;
  friendInterests: Default<FriendClassInterest[], []>;
  preferencePriorities: Default<PreferencePriority[], []>;
  classStatuses: Default<ClassStatus[], []>;
  pinnedSets: Default<PinnedSet[], []>;
  activePinnedSetId: Default<string, "">;
  // Import state - Cell for $value binding
  stagedClasses: Default<StagedClass[], []>;
  importText: Cell<Default<string, "">>;
  importLocationId: Cell<Default<string, "">>;
}

interface ExtracurricularSelectorOutput extends ExtracurricularSelectorInput {
  [NAME]: string;
  [UI]: JSX.Element;
}

export default pattern<ExtracurricularSelectorInput, ExtracurricularSelectorOutput>(
  ({
    childName,
    childGrade,
    childBirthDate,
    childEligibilityNotes,
    locations,
    travelTimes,
    categoryTags,
    classes,
    friends,
    friendInterests,
    preferencePriorities,
    classStatuses,
    pinnedSets,
    activePinnedSetId,
    stagedClasses,
    importText,
    importLocationId,
  }) => {
    // ========================================================================
    // LOCAL STATE
    // ========================================================================

    // Form state for adding new locations
    const newLocationForm = cell({ name: "", type: "afterschool" as LocationType, address: "", hasFlatDailyRate: false, dailyRate: 0 });

    // Form state for adding new tags
    const newTagName = cell<string>("");

    // Form state for adding new friends
    const newFriendName = cell<string>("");

    // ========================================================================
    // LLM EXTRACTION
    // ========================================================================

    // Build extraction prompt - only when we have text to extract
    const extractionPrompt = derive(
      { importText, childGrade, categoryTags, importLocationId, locations },
      (values) => {
        // Unwrap Cell values - derive() doesn't do this automatically when passing an object
        const text: string = (values.importText as any)?.get ? (values.importText as any).get() : values.importText;
        const locId: string = (values.importLocationId as any)?.get ? (values.importLocationId as any).get() : values.importLocationId;
        const grade: string = (values.childGrade as any)?.get ? (values.childGrade as any).get() : values.childGrade;
        const tags: CategoryTag[] = (values.categoryTags as any)?.get ? (values.categoryTags as any).get() : values.categoryTags;
        const locs: Location[] = (values.locations as any)?.get ? (values.locations as any).get() : values.locations;

        // Don't extract if no text or no location selected
        if (!text || text.trim().length < 50 || !locId) {
          return "";
        }

        const locationName = locs.find((l: Location) => l.id === locId)?.name || "Unknown";
        const tagNames = tags.map((t: CategoryTag) => t.name).join(", ");

        return `You are extracting extracurricular class information from a schedule.

CHILD'S GRADE: ${grade}

EXISTING CATEGORY TAGS: ${tagNames}

SOURCE LOCATION: ${locationName}

For each class you find, determine:
1. Is this class eligible for a grade ${grade} student?
2. What category tags apply (prefer existing tags, but suggest new ones if needed)?

SCHEDULE TEXT:
${text}

Extract all classes you can identify. For grade eligibility:
- If the class explicitly includes grade ${grade}, mark eligible=true with high confidence
- If the grade range is unclear, mark eligible="uncertain"
- If the class explicitly excludes grade ${grade}, mark eligible=false

For times, use 24-hour format (e.g., "15:30" for 3:30 PM).
For days, use lowercase: monday, tuesday, wednesday, thursday, friday.
If cost is not specified, use null.`;
      }
    );

    // Run extraction when prompt is ready
    const extractionResult = generateObject({
      prompt: extractionPrompt,
      system: "You are a precise data extraction assistant. Extract class information exactly as found in the source text. Do not invent or assume information not present.",
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          classes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Name of the class" },
                dayOfWeek: { type: "string", description: "Day of week (monday, tuesday, etc.)" },
                startTime: { type: "string", description: "Start time in 24h format (e.g., 15:30)" },
                endTime: { type: "string", description: "End time in 24h format (e.g., 16:30)" },
                durationMinutes: { type: "number", description: "Duration in minutes" },
                cost: { type: "number", description: "Cost in dollars (null if not specified)" },
                costPer: { type: "string", enum: ["session", "semester", "month"], description: "What the cost covers" },
                numberOfMeetings: { type: "number", description: "Number of meetings in the session" },
                gradeMin: { type: "string", description: "Minimum grade (e.g., 'K', '3')" },
                gradeMax: { type: "string", description: "Maximum grade (e.g., '3', '8')" },
                suggestedTags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Category tags that apply (use existing tag names when possible)"
                },
                eligibility: {
                  type: "object",
                  properties: {
                    eligible: { type: "string", enum: ["true", "false", "uncertain"] },
                    reason: { type: "string", description: "Why this eligibility was determined" },
                    confidence: { type: "number", minimum: 0, maximum: 1 }
                  },
                  required: ["eligible", "reason", "confidence"]
                },
                notes: { type: "string", description: "Any additional notes about the class" }
              },
              required: ["name", "dayOfWeek", "startTime", "endTime", "eligibility"]
            }
          },
          suggestedNewTags: {
            type: "array",
            items: { type: "string" },
            description: "New category tags not in the existing list that should be added"
          }
        },
        required: ["classes", "suggestedNewTags"]
      }
    });

    // Process extraction results into staged classes
    const processedStagedClasses = derive(
      { extractionResult, importLocationId, locations, categoryTags },
      (values) => {
        // Unwrap Cell values - derive() doesn't do this automatically when passing an object
        const extractionState = (values.extractionResult as any)?.get ? (values.extractionResult as any).get() : values.extractionResult;
        const locId: string = (values.importLocationId as any)?.get ? (values.importLocationId as any).get() : values.importLocationId;
        const locs: Location[] = (values.locations as any)?.get ? (values.locations as any).get() : values.locations;
        const tags: CategoryTag[] = (values.categoryTags as any)?.get ? (values.categoryTags as any).get() : values.categoryTags;

        // extractionResult is a state object with .result property
        const result = extractionState?.result;
        if (!result || !result.classes) {
          return [] as StagedClass[];
        }

        const resolvedLocationName = locs.find((l: Location) => l.id === locId)?.name || "";

        return result.classes.map((cls: any, index: number): StagedClass => {
          // Determine triage status based on eligibility
          let triageStatus: TriageStatus;
          if (cls.eligibility.eligible === "true" && cls.eligibility.confidence >= 0.8) {
            triageStatus = "auto_kept";
          } else if (cls.eligibility.eligible === "false" && cls.eligibility.confidence >= 0.8) {
            triageStatus = "auto_discarded";
          } else {
            triageStatus = "needs_review";
          }

          // Match suggested tags to existing category tags
          const matchedTagIds: string[] = [];
          const matchedTagNames: string[] = [];
          for (const suggestedTag of cls.suggestedTags || []) {
            const existing = tags.find(
              (t: CategoryTag) => t.name.toLowerCase() === suggestedTag.toLowerCase()
            );
            if (existing) {
              matchedTagIds.push(existing.id);
              matchedTagNames.push(existing.name);
            }
          }

          return {
            id: `staged-${index}-${Date.now()}`,
            name: cls.name || "Unknown Class",
            locationId: locId,
            locationName: resolvedLocationName,
            timeSlots: [{
              day: (cls.dayOfWeek || "monday") as DayOfWeek,
              startTime: cls.startTime || "15:00",
              endTime: cls.endTime || "16:00"
            }],
            cost: cls.cost || 0,
            costPer: cls.costPer || "session",
            categoryTagIds: matchedTagIds,
            categoryTagNames: matchedTagNames,
            gradeMin: cls.gradeMin || "",
            gradeMax: cls.gradeMax || "",
            description: cls.notes || "",
            startDate: "",
            endDate: "",
            triageStatus,
            eligibilityReason: cls.eligibility.reason || "",
            eligibilityConfidence: cls.eligibility.confidence || 0
          };
        });
      }
    );

    // ========================================================================
    // DERIVED STATE
    // ========================================================================

    // Pattern name - when childName is empty, we show a default
    // Use derive to check if childName has any non-whitespace content
    const hasChildName = derive(childName, (n: string) => n && n.trim().length > 0);
    const patternName = ifElse(
      hasChildName,
      str`${childName}'s Activities`,
      "Extracurricular Selector"
    );

    const locationCount = derive(locations, (locs) => locs.length);
    const classCount = derive(classes, (cls) => cls.length);
    const friendCount = derive(friends, (f) => f.length);

    // ========================================================================
    // RENDER
    // ========================================================================

    return {
      childName,
      childGrade,
      childBirthDate,
      childEligibilityNotes,
      locations,
      travelTimes,
      categoryTags,
      classes,
      friends,
      friendInterests,
      preferencePriorities,
      classStatuses,
      pinnedSets,
      activePinnedSetId,
      stagedClasses,
      importText,
      importLocationId,
      [NAME]: patternName,
      [UI]: (
        <ct-screen>
          {/* Header */}
          <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
            <ct-hstack style="justify-content: space-between; align-items: center;">
              <h1 style="font-size: 24px; font-weight: bold; margin: 0;">
                {patternName}
              </h1>
              <ct-hstack style="gap: 16px; font-size: 14px; color: #6b7280;">
                <span>{locationCount} locations</span>
                <span>{classCount} classes</span>
                <span>{friendCount} friends</span>
              </ct-hstack>
            </ct-hstack>
          </div>

          <ct-autolayout tabNames={["Dashboard", "Import", "Selection", "Settings"]}>
            {/* ========== TAB 1: DASHBOARD ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Dashboard</h2>

                {/* Child Profile Summary */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Child Profile
                  </h3>
                  {ifElse(
                    derive(childName, (name) => !!name),
                    <div style="color: #6b7280;">
                      <div><strong>{childName}</strong> - Grade {childGrade}</div>
                      {ifElse(
                        derive(childEligibilityNotes, (notes) => !!notes),
                        <div style="font-size: 12px; margin-top: 4px;">{childEligibilityNotes}</div>,
                        null
                      )}
                    </div>,
                    <div style="color: #9ca3af; font-style: italic;">
                      No child profile set. Go to Settings to configure.
                    </div>
                  )}
                </div>

                {/* Weekly Schedule Preview (placeholder) */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Weekly Schedule
                  </h3>
                  {derive(classes, (cls) =>
                    cls.length === 0 ? (
                      <div style="color: #9ca3af; font-style: italic;">
                        No classes added yet. Import classes from the Import tab.
                      </div>
                    ) : (
                      <div style="color: #6b7280;">
                        {cls.length} classes available
                      </div>
                    )
                  )}
                </div>

                {/* Status Summary (placeholder) */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #374151;">
                    Status Summary
                  </h3>
                  <div style="color: #9ca3af; font-style: italic;">
                    Status tracking will appear here once classes are pinned.
                  </div>
                </div>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 2: IMPORT ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Import Classes</h2>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <p style="color: #6b7280; margin: 0 0 16px 0;">
                    Paste class schedules from afterschool programs, recreation centers, or any source.
                    The AI will extract class information and filter by eligibility.
                  </p>

                  {/* Location selector */}
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                      Source Location
                    </label>
                    {ifElse(
                      derive(locations, (locs) => locs.length === 0),
                      <div style="color: #f59e0b; font-size: 14px;">
                        Add locations in Settings before importing classes.
                      </div>,
                      <ct-select
                        $value={importLocationId}
                        items={derive(locations, (locs: Location[]) => [
                          { label: "Select a location...", value: "" },
                          ...locs.map((loc: Location) => ({ label: loc.name, value: loc.id }))
                        ])}
                      />
                    )}
                  </div>

                  {/* Text input */}
                  <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                      Paste Schedule (HTML or text)
                    </label>
                    <ct-input
                      style={{ width: "100%", height: "200px" }}
                      placeholder="Paste the class schedule here..."
                      $value={importText}
                    />
                  </div>

                  {/* Extraction status */}
                  {ifElse(
                    derive(extractionResult, (r: any) => r?.pending === true),
                    <div style="padding: 8px 12px; background: #dbeafe; border-radius: 6px; color: #1e40af; font-size: 14px; margin-bottom: 12px;">
                      Extracting classes from {derive(importText, (t: string) => t.length)} characters of text...
                    </div>,
                    null
                  )}
                </div>

                {/* Triage results from extraction */}
                {derive(processedStagedClasses, (staged: StagedClass[]) =>
                  staged.length > 0 ? (
                    <ct-vstack style="gap: 16px;">
                      {/* Auto-kept classes (eligible) */}
                      {(() => {
                        const autoKept = staged.filter((c: StagedClass) => c.triageStatus === "auto_kept");
                        return autoKept.length > 0 ? (
                          <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #166534;">
                              Ready to Import ({autoKept.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {autoKept.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #6b7280;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.cost > 0 && ` - $${cls.cost}`}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #16a34a; margin-top: 2px;">
                                        {cls.eligibilityReason}
                                      </div>
                                    </div>
                                    {cls.categoryTagNames.length > 0 && (
                                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                        {cls.categoryTagNames.map((tag: string) => (
                                          <span style="font-size: 10px; padding: 2px 6px; background: #e5e7eb; border-radius: 8px;">{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : null;
                      })()}

                      {/* Needs review classes */}
                      {(() => {
                        const needsReview = staged.filter((c: StagedClass) => c.triageStatus === "needs_review");
                        return needsReview.length > 0 ? (
                          <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #854d0e;">
                              Needs Review ({needsReview.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {needsReview.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #6b7280;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.cost > 0 && ` - $${cls.cost}`}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #ca8a04; margin-top: 2px;">
                                        {cls.eligibilityReason} (confidence: {Math.round(cls.eligibilityConfidence * 100)}%)
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : null;
                      })()}

                      {/* Auto-discarded classes */}
                      {(() => {
                        const autoDiscarded = staged.filter((c: StagedClass) => c.triageStatus === "auto_discarded");
                        return autoDiscarded.length > 0 ? (
                          <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #6b7280;">
                              Auto-Discarded ({autoDiscarded.length})
                            </h3>
                            <ct-vstack style="gap: 8px;">
                              {autoDiscarded.map((cls: StagedClass) => (
                                <div style="background: white; border-radius: 4px; padding: 8px 12px; opacity: 0.7;">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                      <div style="font-weight: 500; text-decoration: line-through;">{cls.name}</div>
                                      <div style="font-size: 12px; color: #9ca3af;">
                                        {DAY_LABELS[cls.timeSlots[0]?.day as DayOfWeek] || "?"} {cls.timeSlots[0]?.startTime || "?"}-{cls.timeSlots[0]?.endTime || "?"}
                                        {cls.gradeMin && ` - Grades ${cls.gradeMin}-${cls.gradeMax}`}
                                      </div>
                                      <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
                                        {cls.eligibilityReason}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </ct-vstack>
                          </div>
                        ) : null;
                      })()}

                      {/* Suggested new tags */}
                      {derive(extractionResult, (result: any) => {
                        const newTags: string[] = result?.result?.suggestedNewTags || [];
                        return newTags.length > 0 ? (
                          <div style="background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px;">
                            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #6b21a8;">
                              Suggested New Tags
                            </h3>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                              {newTags.map((tag: string) => (
                                <span style="padding: 4px 12px; background: white; border: 1px solid #c4b5fd; border-radius: 16px; font-size: 12px;">
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div style="font-size: 11px; color: #7c3aed; margin-top: 8px;">
                              Add these in Settings to use them in future imports.
                            </div>
                          </div>
                        ) : null;
                      })}
                    </ct-vstack>
                  ) : null
                )}
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 3: SELECTION ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Selection Builder</h2>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <p style="color: #9ca3af; font-style: italic;">
                    Selection builder coming in Phase 2. Import classes first!
                  </p>
                </div>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 4: SETTINGS ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 24px;">
                <h2 style="font-size: 18px; font-weight: 600; margin: 0;">Settings</h2>

                {/* Child Profile Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Child Profile
                  </h3>
                  <ct-vstack style="gap: 12px;">
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Name
                      </label>
                      <ct-input
                        placeholder="Child's name"
                        $value={childName}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Grade
                      </label>
                      <ct-select
                        $value={childGrade}
                        items={GRADE_OPTIONS.map((g) => ({ label: g, value: g }))}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Birth Date
                      </label>
                      <ct-input
                        type="date"
                        $value={childBirthDate}
                      />
                    </div>
                    <div>
                      <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #6b7280;">
                        Eligibility Notes
                      </label>
                      <ct-input
                        style={{ height: "60px" }}
                        placeholder="Any special eligibility requirements or notes..."
                        $value={childEligibilityNotes}
                      />
                    </div>
                  </ct-vstack>
                </div>

                {/* Locations Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Locations
                  </h3>

                  {/* Existing locations */}
                  {derive(locations, (locs) =>
                    locs.length > 0 ? (
                      <ct-vstack style="gap: 8px; margin-bottom: 16px;">
                        {locs.map((loc) => (
                          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                            <div>
                              <div style="font-weight: 500;">{loc.name}</div>
                              <div style="font-size: 12px; color: #6b7280;">
                                {loc.type}
                                {loc.hasFlatDailyRate && ` - $${loc.dailyRate}/day flat rate`}
                              </div>
                            </div>
                            <ct-button
                              size="sm"
                              variant="destructive"
                              onClick={removeLocation({ locations, locationId: loc.id })}
                            >
                              Remove
                            </ct-button>
                          </div>
                        ))}
                      </ct-vstack>
                    ) : (
                      <div style="color: #9ca3af; font-style: italic; margin-bottom: 16px;">
                        No locations added yet.
                      </div>
                    )
                  )}

                  {/* Add new location form */}
                  <div style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
                    <h4 style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #6b7280;">
                      Add Location
                    </h4>
                    <ct-vstack style="gap: 8px;">
                      <ct-input
                        placeholder="Location name (e.g., TBS Afterschool)"
                        $value={newLocationForm.key("name")}
                      />
                      <select
                        style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "6px" }}
                        value={newLocationForm.key("type")}
                      >
                        <option value="afterschool">Afterschool Program</option>
                        <option value="private_school">Private School</option>
                        <option value="external">External Class</option>
                        <option value="other">Other</option>
                      </select>
                      <ct-input
                        placeholder="Address (optional)"
                        $value={newLocationForm.key("address")}
                      />
                      <ct-hstack style="gap: 8px; align-items: center;">
                        <ct-checkbox
                          $checked={newLocationForm.key("hasFlatDailyRate")}
                        />
                        <span style="font-size: 14px;">Has flat daily rate</span>
                        {ifElse(
                          newLocationForm.key("hasFlatDailyRate"),
                          <ct-input
                            type="number"
                            style={{ width: "80px" }}
                            placeholder="$/day"
                            $value={newLocationForm.key("dailyRate")}
                          />,
                          null
                        )}
                      </ct-hstack>
                      <ct-button
                        variant="default"
                        onClick={addLocation({ locations, newLocationForm })}
                      >
                        Add Location
                      </ct-button>
                    </ct-vstack>
                  </div>
                </div>

                {/* Category Tags Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Category Tags
                  </h3>
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                    Tags help categorize classes. The AI will use these when importing.
                  </p>

                  {/* Existing tags */}
                  <ct-hstack style="flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    {categoryTags.map((tag) => (
                      <div style={`display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: ${tag.color}20; border: 1px solid ${tag.color}; border-radius: 16px;`}>
                        <span style={`color: ${tag.color}; font-size: 12px; font-weight: 500;`}>{tag.name}</span>
                        <ct-button
                          size="sm"
                          variant="ghost"
                          onClick={removeCategoryTag({ categoryTags, tagId: tag.id })}
                        >
                          ×
                        </ct-button>
                      </div>
                    ))}
                  </ct-hstack>

                  {/* Add new tag */}
                  <ct-hstack style="gap: 8px;">
                    <ct-input
                      style={{ flex: "1" }}
                      placeholder="New tag name..."
                      $value={newTagName}
                    />
                    <ct-button
                      variant="secondary"
                      onClick={addCategoryTag({ categoryTags, newTagName })}
                    >
                      Add
                    </ct-button>
                  </ct-hstack>
                </div>

                {/* Friends Section */}
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: #374151;">
                    Friends
                  </h3>
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">
                    Track friends to prioritize classes they're taking.
                  </p>

                  {/* Existing friends */}
                  {derive(friends, (f) =>
                    f.length > 0 ? (
                      <ct-hstack style="flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                        {f.map((friend) => (
                          <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: #dbeafe; border-radius: 16px;">
                            <span style="color: #1d4ed8; font-size: 12px; font-weight: 500;">{friend.name}</span>
                            <ct-button
                              size="sm"
                              variant="ghost"
                              onClick={removeFriend({ friends, friendId: friend.id })}
                            >
                              ×
                            </ct-button>
                          </div>
                        ))}
                      </ct-hstack>
                    ) : (
                      <div style="color: #9ca3af; font-style: italic; margin-bottom: 12px;">
                        No friends added yet.
                      </div>
                    )
                  )}

                  {/* Add new friend */}
                  <ct-hstack style="gap: 8px;">
                    <ct-input
                      style={{ flex: "1" }}
                      placeholder="Friend's name..."
                      $value={newFriendName}
                    />
                    <ct-button
                      variant="default"
                      onClick={addFriend({ friends, newFriendName })}
                    >
                      Add
                    </ct-button>
                  </ct-hstack>
                </div>
              </ct-vstack>
            </ct-vscroll>
          </ct-autolayout>
        </ct-screen>
      ),
    };
  }
);
