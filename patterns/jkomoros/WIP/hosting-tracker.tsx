/// <cts-enable />
/**
 * Family Hosting Tracker
 *
 * Tracks reciprocal hosting between families (playdates, dinners, etc.)
 * to help maintain balanced relationships.
 *
 * Features:
 * - Dashboard showing overdue/balanced families
 * - Manual and calendar-based event entry
 * - Rule-based event classification
 * - LLM-assisted rule suggestions
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
  wish,
} from "commontools";
import {
  Address,
  ClassificationRule,
  computeHostingStatus,
  daysSince,
  FamilyHostingStats,
  generateId,
  HostingCategory,
  HostingEvent,
  HostingStatus,
  isNeutralLocation,
  locationMatchesAddress,
  matchRegex,
  NormalizedCalendarEvent,
  RuleSuggestionResponse,
  RuleType,
} from "./util/hosting-types.ts";

// Calendar event types (defined inline to avoid cross-directory imports)
// These match the structures from google-calendar-importer.tsx and calendar-viewer.tsx
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
  calendarName: string;
  attendees?: { email: string; displayName: string; responseStatus: string }[];
}

interface AppleCalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  notes: string | null;
  calendarName: string;
  isAllDay: boolean;
}

// ============================================================================
// FAMILY TYPE (from wish)
// ============================================================================

interface FamilyCharm {
  familyName: string;
  addresses: Address[];
  primaryAddress: Address | null;
  members: { name: string; role: string }[];
}

// ============================================================================
// STYLING CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<HostingStatus, { bg: string; border: string; text: string }> = {
  overdue: { bg: "#fee2e2", border: "#ef4444", text: "#dc2626" },
  balanced: { bg: "#dcfce7", border: "#22c55e", text: "#16a34a" },
  "we-owe": { bg: "#fef3c7", border: "#f59e0b", text: "#d97706" },
  "they-owe": { bg: "#dbeafe", border: "#3b82f6", text: "#2563eb" },
};

const CATEGORY_COLORS: Record<HostingCategory, { bg: string; text: string }> = {
  "they-hosted": { bg: "#dbeafe", text: "#1d4ed8" },
  "we-hosted": { bg: "#dcfce7", text: "#15803d" },
  neutral: { bg: "#f3f4f6", text: "#4b5563" },
};

// ============================================================================
// HANDLERS
// ============================================================================

// Handler to add a new address to "my addresses"
const addMyAddress = handler<
  { detail: { message: string } },
  { myAddresses: Cell<Address[]> }
>(({ detail }, { myAddresses }) => {
  const fullAddress = detail?.message?.trim();
  if (!fullAddress) return;

  const current = myAddresses.get();
  const newAddress: Address = {
    id: generateId(),
    label: current.length === 0 ? "Home" : `Address ${current.length + 1}`,
    fullAddress,
    isPrimary: current.length === 0,
  };

  myAddresses.push(newAddress);
});

// Handler to remove one of my addresses
const removeMyAddress = handler<
  unknown,
  { myAddresses: Cell<Address[]>; addressId: string }
>((_, { myAddresses, addressId }) => {
  const current = myAddresses.get();
  const index = current.findIndex((a) => a.id === addressId);
  if (index >= 0) {
    const wasRemoved = current[index];
    const updated = current.toSpliced(index, 1);
    if (wasRemoved.isPrimary && updated.length > 0) {
      updated[0] = { ...updated[0], isPrimary: true };
    }
    myAddresses.set(updated);
  }
});

// Handler to add a manual hosting event
const addManualEvent = handler<
  unknown,
  {
    hostingEvents: Cell<HostingEvent[]>;
    manualEventForm: Cell<{
      title: string;
      date: string;
      location: string;
      familyId: string;
      familyName: string;
      category: HostingCategory;
      notes: string;
    }>;
  }
>((_, { hostingEvents, manualEventForm }) => {
  const form = manualEventForm.get();
  if (!form.title.trim() || !form.familyId || !form.date) {
    console.warn("Missing required fields for manual event");
    return;
  }

  const newEvent: HostingEvent = {
    id: generateId(),
    title: form.title.trim(),
    date: form.date,
    location: form.location.trim(),
    familyId: form.familyId,
    familyName: form.familyName,
    category: form.category,
    classificationMethod: "manual",
    confidence: 1,
    notes: form.notes.trim(),
    classifiedAt: new Date().toISOString(),
  };

  hostingEvents.push(newEvent);

  // Reset form
  manualEventForm.set({
    title: "",
    date: "",
    location: "",
    familyId: "",
    familyName: "",
    category: "they-hosted",
    notes: "",
  });
});

// Handler to classify an unassigned calendar event
const classifyEvent = handler<
  unknown,
  {
    hostingEvents: Cell<HostingEvent[]>;
    event: NormalizedCalendarEvent;
    familyId: string;
    familyName: string;
    category: HostingCategory;
  }
>((_, { hostingEvents, event, familyId, familyName, category }) => {
  const newEvent: HostingEvent = {
    id: generateId(),
    calendarEventId: event.id,
    title: event.title,
    date: event.startDate,
    location: event.location,
    familyId,
    familyName,
    category,
    classificationMethod: "manual",
    confidence: 1,
    notes: "",
    classifiedAt: new Date().toISOString(),
  };

  hostingEvents.push(newEvent);
});

// Handler to remove a hosting event
const removeHostingEvent = handler<
  unknown,
  { hostingEvents: Cell<HostingEvent[]>; eventId: string }
>((_, { hostingEvents, eventId }) => {
  const current = hostingEvents.get();
  const index = current.findIndex((e) => e.id === eventId);
  if (index >= 0) {
    hostingEvents.set(current.toSpliced(index, 1));
  }
});

// Handler to add a new classification rule
const addRule = handler<
  unknown,
  {
    rules: Cell<ClassificationRule[]>;
    newRule: Cell<Partial<ClassificationRule>>;
  }
>((_, { rules, newRule }) => {
  const rule = newRule.get();
  if (!rule.name?.trim() || !rule.pattern?.trim()) {
    console.warn("Missing required fields for rule");
    return;
  }

  const fullRule: ClassificationRule = {
    id: generateId(),
    name: rule.name.trim(),
    type: rule.type || "location_exact",
    pattern: rule.pattern.trim(),
    familyId: rule.familyId,
    category: rule.category || "neutral",
    isNegative: rule.isNegative || false,
    priority: rule.priority || 50,
    enabled: true,
    matchCount: 0,
    correctCount: 0,
    positiveExamples: [],
    negativeExamples: [],
  };

  rules.push(fullRule);

  // Reset form
  newRule.set({});
});

// Handler to toggle rule enabled state
const toggleRule = handler<
  unknown,
  { rules: Cell<ClassificationRule[]>; ruleId: string }
>((_, { rules, ruleId }) => {
  const current = rules.get();
  const index = current.findIndex((r) => r.id === ruleId);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    rules.set(updated);
  }
});

// Handler to delete a rule
const deleteRule = handler<
  unknown,
  { rules: Cell<ClassificationRule[]>; ruleId: string }
>((_, { rules, ruleId }) => {
  const current = rules.get();
  const index = current.findIndex((r) => r.id === ruleId);
  if (index >= 0) {
    rules.set(current.toSpliced(index, 1));
  }
});

// Handler to update overdueThresholdDays
const updateThreshold = handler<
  { target: { value: string } },
  { overdueThresholdDays: Cell<number> }
>(({ target }, { overdueThresholdDays }) => {
  const value = parseInt(target.value, 10);
  if (!isNaN(value) && value > 0) {
    overdueThresholdDays.set(value);
  }
});

// Handler to select family in manual event form
const selectManualFamily = handler<
  { target: { value: string } },
  {
    manualEventForm: Cell<{
      title: string;
      date: string;
      location: string;
      familyId: string;
      familyName: string;
      category: HostingCategory;
      notes: string;
    }>;
    trackedFamilies: Cell<Array<{ id: string; name: string }>>;
  }
>(({ target }, { manualEventForm, trackedFamilies }) => {
  const familyId = target.value;
  const families = trackedFamilies.get();
  const family = families.find((f) => f.id === familyId);
  manualEventForm.key("familyId").set(familyId);
  manualEventForm.key("familyName").set(family?.name || "");
});

// Handler to select category in manual event form
const selectManualCategory = handler<
  { target: { value: string } },
  {
    manualEventForm: Cell<{
      title: string;
      date: string;
      location: string;
      familyId: string;
      familyName: string;
      category: HostingCategory;
      notes: string;
    }>;
  }
>(({ target }, { manualEventForm }) => {
  manualEventForm.key("category").set(target.value as HostingCategory);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a Google Calendar event
 */
function normalizeGoogleEvent(event: GoogleCalendarEvent): NormalizedCalendarEvent {
  return {
    id: event.id,
    source: "google",
    title: event.summary || "(No title)",
    description: event.description || "",
    location: event.location || "",
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    startDate: event.start,
    isAllDay: event.isAllDay,
    attendees: (event.attendees || []).map((a) => a.email),
    calendarName: event.calendarName,
  };
}

/**
 * Normalize an Apple Calendar event
 */
function normalizeAppleEvent(event: AppleCalendarEvent): NormalizedCalendarEvent {
  return {
    id: event.id,
    source: "apple",
    title: event.title,
    description: event.notes || "",
    location: event.location || "",
    startDateTime: event.startDate,
    endDateTime: event.endDate,
    startDate: event.startDate.split("T")[0],
    isAllDay: event.isAllDay,
    attendees: [],
    calendarName: event.calendarName,
  };
}

/**
 * Compute stats for all tracked families
 */
function computeAllFamilyStats(
  events: HostingEvent[],
  families: Array<{ id: string; name: string }>,
  overdueThresholdDays: number
): FamilyHostingStats[] {
  const stats: FamilyHostingStats[] = [];

  for (const family of families) {
    const familyEvents = events.filter((e) => e.familyId === family.id);

    const theyHostedCount = familyEvents.filter(
      (e) => e.category === "they-hosted"
    ).length;
    const weHostedCount = familyEvents.filter(
      (e) => e.category === "we-hosted"
    ).length;
    const neutralCount = familyEvents.filter(
      (e) => e.category === "neutral"
    ).length;

    // Find last dates
    const theyHostedEvents = familyEvents
      .filter((e) => e.category === "they-hosted")
      .sort((a, b) => b.date.localeCompare(a.date));
    const weHostedEvents = familyEvents
      .filter((e) => e.category === "we-hosted")
      .sort((a, b) => b.date.localeCompare(a.date));

    const lastTheyHosted = theyHostedEvents[0]?.date || null;
    const lastWeHosted = weHostedEvents[0]?.date || null;
    const daysSinceTheyHosted = daysSince(lastTheyHosted);

    const status = computeHostingStatus(
      theyHostedCount,
      weHostedCount,
      daysSinceTheyHosted,
      overdueThresholdDays
    );

    stats.push({
      familyId: family.id,
      familyName: family.name,
      theyHostedCount,
      weHostedCount,
      neutralCount,
      lastTheyHosted,
      lastWeHosted,
      daysSinceTheyHosted,
      isOverdue: status === "overdue",
      status,
    });
  }

  return stats;
}

/**
 * Classify an event using rules
 */
function classifyEventWithRules(
  event: NormalizedCalendarEvent,
  rules: ClassificationRule[],
  myAddresses: Address[],
  familyAddresses: Map<string, Address[]>,
  neutralPatterns: string[]
): {
  category: HostingCategory | null;
  familyId: string | null;
  confidence: number;
  matchedRule: ClassificationRule | null;
} {
  // Sort rules by priority (descending)
  const enabledRules = rules.filter((r) => r.enabled);
  enabledRules.sort((a, b) => b.priority - a.priority);

  // Check negative rules first
  for (const rule of enabledRules.filter((r) => r.isNegative)) {
    if (ruleMatches(event, rule)) {
      return { category: null, familyId: null, confidence: 0, matchedRule: rule };
    }
  }

  // Check positive rules
  for (const rule of enabledRules.filter((r) => !r.isNegative)) {
    if (ruleMatches(event, rule)) {
      return {
        category: rule.category,
        familyId: rule.familyId || null,
        confidence: 0.8,
        matchedRule: rule,
      };
    }
  }

  // Fall back to location-based detection
  // Check my addresses -> "we-hosted"
  for (const addr of myAddresses) {
    if (locationMatchesAddress(event.location, addr.fullAddress)) {
      return {
        category: "we-hosted",
        familyId: null,
        confidence: 0.6,
        matchedRule: null,
      };
    }
  }

  // Check family addresses -> "they-hosted"
  for (const [familyId, addresses] of familyAddresses) {
    for (const addr of addresses) {
      if (locationMatchesAddress(event.location, addr.fullAddress)) {
        return {
          category: "they-hosted",
          familyId,
          confidence: 0.6,
          matchedRule: null,
        };
      }
    }
  }

  // Check neutral patterns
  if (isNeutralLocation(event.location, neutralPatterns)) {
    return {
      category: "neutral",
      familyId: null,
      confidence: 0.4,
      matchedRule: null,
    };
  }

  return { category: null, familyId: null, confidence: 0, matchedRule: null };
}

/**
 * Check if a rule matches an event
 */
function ruleMatches(
  event: NormalizedCalendarEvent,
  rule: ClassificationRule
): boolean {
  switch (rule.type) {
    case "title_regex":
      return matchRegex(event.title, rule.pattern);
    case "description_regex":
      return matchRegex(event.description, rule.pattern);
    case "location_exact":
      return event.location.toLowerCase().trim() === rule.pattern.toLowerCase().trim();
    case "location_regex":
      return matchRegex(event.location, rule.pattern);
    case "attendee_email":
      return event.attendees.some(
        (email) => email.toLowerCase() === rule.pattern.toLowerCase()
      );
    default:
      return false;
  }
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

interface HostingTrackerInput {
  // My addresses for "we-hosted" detection
  myAddresses: Default<Address[], []>;

  // Hosting events (classified)
  hostingEvents: Default<HostingEvent[], []>;

  // Classification rules
  rules: Default<ClassificationRule[], []>;

  // Settings
  overdueThresholdDays: Default<number, 60>;
  neutralPatterns: Default<
    string[],
    ["park", "restaurant", "playground", "museum", "zoo", "cafe", "school"]
  >;
}

// ============================================================================
// PATTERN
// ============================================================================

const HostingTracker = pattern<HostingTrackerInput>(
  ({
    myAddresses,
    hostingEvents,
    rules,
    overdueThresholdDays,
    neutralPatterns,
  }) => {
    // Wish for family charms - returns { result, error, $UI }
    const familyWishResult = wish<FamilyCharm>({ query: "#family" });

    // Form state for manual event entry
    const manualEventForm = cell({
      title: "",
      date: "",
      location: "",
      familyId: "",
      familyName: "",
      category: "they-hosted" as HostingCategory,
      notes: "",
    });

    // Form state for new rule
    const newRuleForm = cell<Partial<ClassificationRule>>({});

    // Selected family for event assignment
    const selectedFamilyId = cell("");

    // Derive list of tracked families from wish result
    // Note: wish({ query }) returns a single match, not an array
    // We wrap it in an array for now; later could iterate over multiple favorites
    const trackedFamilies = derive(familyWishResult, (wr) => {
      const charm = wr?.result;
      if (!charm) return [];
      // Single family from wish
      return [{
        id: "family-0",
        name: charm.familyName || "(Unnamed Family)",
        addresses: charm.addresses || [],
        primaryAddress: charm.primaryAddress,
        members: charm.members || [],
      }];
    });

    // Build family addresses map
    const familyAddressesMap = derive(trackedFamilies, (families) => {
      const map = new Map<string, Address[]>();
      for (const family of families) {
        if (family.addresses.length > 0) {
          map.set(family.id, family.addresses);
        }
      }
      return map;
    });

    // Compute family stats
    const familyStats = derive(
      { hostingEvents, trackedFamilies, overdueThresholdDays },
      ({ hostingEvents, trackedFamilies, overdueThresholdDays }) =>
        computeAllFamilyStats(
          hostingEvents,
          trackedFamilies.map((f) => ({ id: f.id, name: f.name })),
          overdueThresholdDays
        )
    );

    // Filter stats by status
    const overdueStats = derive(familyStats, (stats) =>
      stats.filter((s) => s.status === "overdue")
    );
    const balancedStats = derive(familyStats, (stats) =>
      stats.filter((s) => s.status === "balanced")
    );
    const weOweStats = derive(familyStats, (stats) =>
      stats.filter((s) => s.status === "we-owe")
    );
    const theyOweStats = derive(familyStats, (stats) =>
      stats.filter((s) => s.status === "they-owe")
    );

    // Recent events (last 10)
    const recentEvents = derive(hostingEvents, (events) =>
      [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
    );

    // Wish for Google Calendar events
    const googleCalendarCharm = wish<{ events: GoogleCalendarEvent[] }>("#googleCalendar");
    const appleCalendarCharm = wish<{ events: AppleCalendarEvent[] }>("#appleCalendar");

    // Combine and normalize calendar events
    const allCalendarEvents = derive(
      { googleCalendarCharm, appleCalendarCharm },
      ({ googleCalendarCharm, appleCalendarCharm }) => {
        const events: NormalizedCalendarEvent[] = [];

        // Add Google events
        const googleEvents = googleCalendarCharm?.events || [];
        for (const evt of googleEvents) {
          events.push(normalizeGoogleEvent(evt));
        }

        // Add Apple events
        const appleEvents = appleCalendarCharm?.events || [];
        for (const evt of appleEvents) {
          events.push(normalizeAppleEvent(evt));
        }

        // Sort by date
        events.sort((a, b) => a.startDate.localeCompare(b.startDate));
        return events;
      }
    );

    // Filter to unclassified events (not yet in hostingEvents)
    const unclassifiedEvents = derive(
      { allCalendarEvents, hostingEvents },
      ({ allCalendarEvents, hostingEvents }) => {
        // Extract calendarEventIds from hosting events that have them
        const classifiedIds = new Set<string>();
        for (const e of hostingEvents) {
          if (e.calendarEventId) {
            classifiedIds.add(e.calendarEventId);
          }
        }
        // Filter calendar events that aren't already classified
        const result: NormalizedCalendarEvent[] = [];
        for (const evt of allCalendarEvents) {
          if (!classifiedIds.has(evt.id)) {
            result.push(evt);
          }
        }
        return result;
      }
    );

    // Count unclassified
    const unclassifiedCount = derive(
      unclassifiedEvents,
      (events) => events.length
    );

    // Total families count
    const familyCount = derive(trackedFamilies, (f) => f.length);

    // Total events count
    const eventCount = derive(hostingEvents, (e) => e.length);

    return {
      [NAME]: str`Hosting Tracker (${eventCount} events)`,
      [UI]: (
        <ct-screen>
          {/* Embed wish results to trigger cross-space charm startup */}
          <div style={{ display: "none" }}>
            {familyWishResult}
            {googleCalendarCharm}
            {appleCalendarCharm}
          </div>

          <div slot="header">
            <ct-hstack align="center" gap="2">
              <ct-heading level={3}>Family Hosting Tracker</ct-heading>
            </ct-hstack>
          </div>

          <ct-autolayout tabNames={["Dashboard", "Families", "Events", "Rules"]}>
            {/* ========== TAB 1: DASHBOARD ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                {/* Summary Stats */}
                <ct-hstack style="gap: 12px; flex-wrap: wrap;">
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                      {familyCount}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      Families
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                      {eventCount}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>Events</div>
                  </div>
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: STATUS_COLORS.overdue.bg,
                      borderRadius: "8px",
                      border: `1px solid ${STATUS_COLORS.overdue.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "24px",
                        fontWeight: "bold",
                        color: STATUS_COLORS.overdue.text,
                      }}
                    >
                      {derive(overdueStats, (s) => s.length)}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>Overdue</div>
                  </div>
                </ct-hstack>

                {/* Overdue Families */}
                {ifElse(
                  derive(overdueStats, (s) => s.length > 0),
                  <ct-vstack style="gap: 8px;">
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: STATUS_COLORS.overdue.text,
                      }}
                    >
                      Overdue Families
                    </h3>
                    <div
                      style={{
                        padding: "12px",
                        backgroundColor: STATUS_COLORS.overdue.bg,
                        borderRadius: "8px",
                        border: `1px solid ${STATUS_COLORS.overdue.border}`,
                      }}
                    >
                      {overdueStats.map((stat) => (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                            borderBottom: "1px solid #fca5a5",
                          }}
                        >
                          <div>
                            <strong>{stat.familyName}</strong>
                            <div style={{ fontSize: "12px", color: "#666" }}>
                              Last hosted us:{" "}
                              {stat.daysSinceTheyHosted !== null
                                ? `${stat.daysSinceTheyHosted} days ago`
                                : "Never"}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: STATUS_COLORS.overdue.text,
                            }}
                          >
                            They: {stat.theyHostedCount} / We: {stat.weHostedCount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ct-vstack>,
                  <div />
                )}

                {/* We Owe Families */}
                {ifElse(
                  derive(weOweStats, (s) => s.length > 0),
                  <ct-vstack style="gap: 8px;">
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: STATUS_COLORS["we-owe"].text,
                      }}
                    >
                      We Owe Them
                    </h3>
                    <div
                      style={{
                        padding: "12px",
                        backgroundColor: STATUS_COLORS["we-owe"].bg,
                        borderRadius: "8px",
                        border: `1px solid ${STATUS_COLORS["we-owe"].border}`,
                      }}
                    >
                      {weOweStats.map((stat) => (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                          }}
                        >
                          <strong>{stat.familyName}</strong>
                          <div style={{ fontSize: "12px" }}>
                            They: {stat.theyHostedCount} / We: {stat.weHostedCount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ct-vstack>,
                  <div />
                )}

                {/* Balanced Families */}
                {ifElse(
                  derive(balancedStats, (s) => s.length > 0),
                  <ct-vstack style="gap: 8px;">
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: STATUS_COLORS.balanced.text,
                      }}
                    >
                      Balanced
                    </h3>
                    <div
                      style={{
                        padding: "12px",
                        backgroundColor: STATUS_COLORS.balanced.bg,
                        borderRadius: "8px",
                        border: `1px solid ${STATUS_COLORS.balanced.border}`,
                      }}
                    >
                      {balancedStats.map((stat) => (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                          }}
                        >
                          <strong>{stat.familyName}</strong>
                          <div style={{ fontSize: "12px" }}>
                            They: {stat.theyHostedCount} / We: {stat.weHostedCount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ct-vstack>,
                  <div />
                )}

                {/* Recent Events */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">Recent Events</h3>
                  {ifElse(
                    derive(recentEvents, (e) => e.length === 0),
                    <div style="color: #666; font-size: 13px;">
                      No events recorded yet
                    </div>,
                    <ct-vstack style="gap: 4px;">
                      {recentEvents.map((event) => (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 12px",
                            backgroundColor: derive(event.category, (cat) => CATEGORY_COLORS[cat].bg),
                            borderRadius: "6px",
                            fontSize: "13px",
                          }}
                        >
                          <span style={{ color: "#666", minWidth: "80px" }}>
                            {event.date}
                          </span>
                          <span style={{ flex: 1 }}>{event.title}</span>
                          <span
                            style={{
                              color: derive(event.category, (cat) => CATEGORY_COLORS[cat].text),
                              fontWeight: 500,
                            }}
                          >
                            {event.familyName}
                          </span>
                          <span
                            style={{
                              padding: "2px 8px",
                              backgroundColor: "#fff",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {event.category}
                          </span>
                        </div>
                      ))}
                    </ct-vstack>
                  )}
                </ct-vstack>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 2: FAMILIES ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#f0f9ff",
                    borderRadius: "8px",
                    border: "1px solid #0ea5e9",
                    fontSize: "13px",
                  }}
                >
                  <strong>Tip:</strong> Create Family charms and favorite them
                  (star icon) to track them here. Use wish("#family") to discover
                  them.
                </div>

                <h3 style="margin: 0; font-size: 14px;">
                  Tracked Families ({familyCount})
                </h3>

                {ifElse(
                  derive(familyCount, (c) => c === 0),
                  <div style="color: #666; font-size: 13px; padding: 20px; text-align: center;">
                    No families found. Create a Family charm and favorite it.
                  </div>,
                  <ct-vstack style="gap: 8px;">
                    {trackedFamilies.map((family) => {
                      const stat = derive(familyStats, (stats) =>
                        stats.find((s) => s.familyId === family.id)
                      );
                      return (
                        <div
                          style={{
                            padding: "12px",
                            backgroundColor: derive(stat, (s) =>
                              s ? STATUS_COLORS[s.status].bg : "#f9fafb"
                            ),
                            borderRadius: "8px",
                            border: derive(stat, (s) =>
                              s
                                ? `1px solid ${STATUS_COLORS[s.status].border}`
                                : "1px solid #e5e7eb"
                            ),
                          }}
                        >
                          <ct-hstack style="justify-content: space-between; align-items: center;">
                            <div>
                              <strong style={{ fontSize: "15px" }}>
                                {family.name}
                              </strong>
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                {derive(family.members, (m: { name: string; role: string }[]) =>
                                  m.length > 0
                                    ? m.map((mem: { name: string; role: string }) => mem.name).join(", ")
                                    : "No members"
                                )}
                              </div>
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                {derive(family.primaryAddress, (addr) =>
                                  addr ? addr.fullAddress : "No address"
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              {derive(stat, (s) =>
                                s ? (
                                  <div>
                                    <div
                                      style={{
                                        fontWeight: "bold",
                                        color: STATUS_COLORS[s.status].text,
                                      }}
                                    >
                                      {s.status.toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: "12px" }}>
                                      They: {s.theyHostedCount} / We:{" "}
                                      {s.weHostedCount}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: "12px", color: "#666" }}>
                                    No events
                                  </div>
                                )
                              )}
                            </div>
                          </ct-hstack>
                        </div>
                      );
                    })}
                  </ct-vstack>
                )}
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 3: EVENTS ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                {/* Unclassified Events Section */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">
                    Unclassified Events ({unclassifiedCount})
                  </h3>

                  {ifElse(
                    derive(unclassifiedCount, (c) => c === 0),
                    <div style="color: #666; font-size: 13px;">
                      No unclassified calendar events. Connect a calendar or add
                      events manually.
                    </div>,
                    <ct-vstack style="gap: 6px;">
                      {derive(unclassifiedEvents, (events) =>
                        events.slice(0, 10).map((event) => (
                          <div
                            style={{
                              padding: "12px",
                              backgroundColor: "#f9fafb",
                              borderRadius: "8px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            <div style={{ marginBottom: "8px" }}>
                              <strong>{event.title}</strong>
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                {event.startDate} | {event.location || "No location"}
                              </div>
                            </div>
                            <ct-hstack style="gap: 8px; flex-wrap: wrap;">
                              {derive(trackedFamilies, (families) =>
                                families.map((family) => (
                                  <button
                                    onClick={classifyEvent({
                                      hostingEvents,
                                      event,
                                      familyId: family.id,
                                      familyName: family.name,
                                      category: "they-hosted",
                                    })}
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      borderRadius: "4px",
                                      border: "1px solid #3b82f6",
                                      background: "#dbeafe",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {family.name} hosted
                                  </button>
                                ))
                              )}
                            </ct-hstack>
                          </div>
                        ))
                      )}
                    </ct-vstack>
                  )}
                </ct-vstack>

                {/* Manual Event Entry */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">Add Manual Event</h3>
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <ct-vstack style="gap: 8px;">
                      <ct-hstack style="gap: 8px;">
                        <label style={{ flex: 2 }}>
                          Title
                          <ct-input
                            $value={manualEventForm.key("title")}
                            placeholder="Event title"
                          />
                        </label>
                        <label style={{ flex: 1 }}>
                          Date
                          <ct-input
                            $value={manualEventForm.key("date")}
                            placeholder="YYYY-MM-DD"
                          />
                        </label>
                      </ct-hstack>
                      <label>
                        Location
                        <ct-input
                          $value={manualEventForm.key("location")}
                          placeholder="Where?"
                        />
                      </label>
                      <ct-hstack style="gap: 8px;">
                        <label style={{ flex: 1 }}>
                          Family
                          <select
                            value={manualEventForm.key("familyId")}
                            onChange={selectManualFamily({
                              manualEventForm,
                              trackedFamilies,
                            })}
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #d1d5db",
                            }}
                          >
                            <option value="">Select family...</option>
                            {trackedFamilies.map((family) => (
                              <option value={family.id}>{family.name}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ flex: 1 }}>
                          Category
                          <select
                            value={manualEventForm.key("category")}
                            onChange={selectManualCategory({ manualEventForm })}
                            style={{
                              width: "100%",
                              padding: "8px",
                              borderRadius: "4px",
                              border: "1px solid #d1d5db",
                            }}
                          >
                            <option value="they-hosted">They Hosted</option>
                            <option value="we-hosted">We Hosted</option>
                            <option value="neutral">Neutral</option>
                          </select>
                        </label>
                      </ct-hstack>
                      <ct-button onClick={addManualEvent({ hostingEvents, manualEventForm })}>
                        Add Event
                      </ct-button>
                    </ct-vstack>
                  </div>
                </ct-vstack>

                {/* Event History */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">
                    Event History ({eventCount})
                  </h3>
                  {ifElse(
                    derive(eventCount, (c) => c === 0),
                    <div style="color: #666; font-size: 13px;">
                      No events recorded yet
                    </div>,
                    <ct-vstack style="gap: 4px;">
                      {hostingEvents.map((event) => (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 12px",
                            backgroundColor: derive(event.category, (cat) => CATEGORY_COLORS[cat].bg),
                            borderRadius: "6px",
                            fontSize: "13px",
                          }}
                        >
                          <span style={{ color: "#666", minWidth: "80px" }}>
                            {event.date}
                          </span>
                          <span style={{ flex: 1 }}>{event.title}</span>
                          <span style={{ fontWeight: 500 }}>{event.familyName}</span>
                          <span
                            style={{
                              padding: "2px 8px",
                              backgroundColor: "#fff",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {event.category}
                          </span>
                          <button
                            onClick={removeHostingEvent({
                              hostingEvents,
                              eventId: event.id,
                            })}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#dc2626",
                              fontSize: "16px",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </ct-vstack>
                  )}
                </ct-vstack>
              </ct-vstack>
            </ct-vscroll>

            {/* ========== TAB 4: RULES ========== */}
            <ct-vscroll flex showScrollbar>
              <ct-vstack style="padding: 16px; gap: 16px;">
                {/* My Addresses */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">My Addresses</h3>
                  <p style="margin: 0; font-size: 12px; color: #666;">
                    Events at these addresses are classified as "we-hosted"
                  </p>

                  {ifElse(
                    derive(myAddresses, (a) => a.length === 0),
                    <div style="color: #666; font-size: 13px;">
                      No addresses added yet
                    </div>,
                    <ct-vstack style="gap: 4px;">
                      {myAddresses.map((addr) => (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 12px",
                            backgroundColor: "#dcfce7",
                            borderRadius: "6px",
                            fontSize: "13px",
                          }}
                        >
                          <strong style={{ minWidth: "60px" }}>{addr.label}</strong>
                          <span style={{ flex: 1 }}>{addr.fullAddress}</span>
                          {ifElse(
                            addr.isPrimary,
                            <span style="color: #16a34a; font-size: 11px;">
                              Primary
                            </span>,
                            <span />
                          )}
                          <button
                            onClick={removeMyAddress({
                              myAddresses,
                              addressId: addr.id,
                            })}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#dc2626",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </ct-vstack>
                  )}
                  <ct-message-input
                    placeholder="Add your address..."
                    onct-send={addMyAddress({ myAddresses })}
                  />
                </ct-vstack>

                {/* Settings */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">Settings</h3>
                  <label>
                    Overdue Threshold (days)
                    <input
                      type="number"
                      value={overdueThresholdDays}
                      onChange={updateThreshold({ overdueThresholdDays })}
                      style={{
                        width: "100px",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #d1d5db",
                        marginLeft: "8px",
                      }}
                    />
                  </label>
                </ct-vstack>

                {/* Classification Rules */}
                <ct-vstack style="gap: 8px;">
                  <h3 style="margin: 0; font-size: 14px;">
                    Classification Rules ({derive(rules, (r) => r.length)})
                  </h3>

                  {ifElse(
                    derive(rules, (r) => r.length === 0),
                    <div style="color: #666; font-size: 13px;">
                      No rules configured yet
                    </div>,
                    <ct-vstack style="gap: 4px;">
                      {rules.map((rule) => (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            padding: "8px 12px",
                            backgroundColor: rule.enabled ? "#f9fafb" : "#f3f4f6",
                            borderRadius: "6px",
                            fontSize: "13px",
                            opacity: rule.enabled ? 1 : 0.6,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={toggleRule({ rules, ruleId: rule.id })}
                          />
                          <span style={{ fontWeight: 500, minWidth: "100px" }}>
                            {rule.name}
                          </span>
                          <span style={{ flex: 1, color: "#666", fontSize: "12px" }}>
                            {rule.type}: "{rule.pattern}"
                          </span>
                          <span
                            style={{
                              padding: "2px 8px",
                              backgroundColor: derive(rule.category, (cat) => CATEGORY_COLORS[cat].bg),
                              color: derive(rule.category, (cat) => CATEGORY_COLORS[cat].text),
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {rule.category}
                          </span>
                          <button
                            onClick={deleteRule({ rules, ruleId: rule.id })}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#dc2626",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </ct-vstack>
                  )}
                </ct-vstack>
              </ct-vstack>
            </ct-vscroll>
          </ct-autolayout>
        </ct-screen>
      ),

      // Output all fields
      myAddresses,
      hostingEvents,
      rules,
      overdueThresholdDays,
      neutralPatterns,
    };
  }
);

export default HostingTracker;
