/// <cts-enable />
/**
 * @title Person Perf Tabs
 * @description Test if ct-autolayout tabs cause the ~60s CPU spike
 *
 * HYPOTHESIS: The ~60 second CPU spike in person.tsx is caused by
 * the tabbed interface (ct-autolayout with tabNames prop).
 *
 * This pattern takes the autolayout test (~4.6s) and adds tabs
 * similar to person.tsx structure.
 *
 * EXPECTED:
 * - If ~60 seconds: tabbed interface is the cause
 * - If ~4 seconds: Need to add more complexity
 */
import {
  Writable,
  computed,
  generateObject,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
} from "commontools";

// Inline the diff utilities to avoid import path issues
type DiffChunk = {
  type: "removed" | "added" | "unchanged";
  word: string;
};

function computeWordDiff(from: string, to: string): DiffChunk[] {
  const fromStr = from || "";
  const toStr = to || "";
  const fromWords = fromStr.split(/(\s+)/);
  const toWords = toStr.split(/(\s+)/);
  const result: DiffChunk[] = [];
  let i = 0, j = 0;

  while (i < fromWords.length || j < toWords.length) {
    if (i >= fromWords.length) {
      result.push({ type: "added", word: toWords[j] });
      j++;
    } else if (j >= toWords.length) {
      result.push({ type: "removed", word: fromWords[i] });
      i++;
    } else if (fromWords[i] === toWords[j]) {
      result.push({ type: "unchanged", word: fromWords[i] });
      i++;
      j++;
    } else {
      const fromLookAhead = toWords.slice(j).indexOf(fromWords[i]);
      const toLookAhead = fromWords.slice(i).indexOf(toWords[j]);

      if (fromLookAhead !== -1 && (toLookAhead === -1 || fromLookAhead <= toLookAhead)) {
        for (let k = 0; k < fromLookAhead; k++) {
          result.push({ type: "added", word: toWords[j] });
          j++;
        }
      } else if (toLookAhead !== -1) {
        for (let k = 0; k < toLookAhead; k++) {
          result.push({ type: "removed", word: fromWords[i] });
          i++;
        }
      } else {
        result.push({ type: "removed", word: fromWords[i] });
        result.push({ type: "added", word: toWords[j] });
        i++;
        j++;
      }
    }
  }
  return result;
}

function compareFields<T extends Record<string, any>>(
  extracted: Partial<T> | null | undefined,
  fieldMappings: { [K in keyof T]?: { current: string; label: string } },
): Array<{ field: string; from: string; to: string }> {
  if (!extracted || Object.keys(extracted).length === 0) {
    return [];
  }
  const changes: Array<{ field: string; from: string; to: string }> = [];
  for (const key in fieldMappings) {
    const mapping = fieldMappings[key];
    if (!mapping) continue;
    const extractedValue = extracted[key];
    const currentValue = mapping.current;
    if (extractedValue && extractedValue !== currentValue) {
      changes.push({
        field: mapping.label,
        from: currentValue || "(empty)",
        to: String(extractedValue),
      });
    }
  }
  return changes;
}

// Handler to trigger extraction
const triggerExtraction = handler<
  Record<string, never>,
  { trigger: Writable<string>; startTimeMs: Writable<number> }
>(
  (_, { trigger, startTimeMs }) => {
    console.log("[PERF-TABS] Starting extraction...");
    console.log("[PERF-TABS] Start time:", Date.now());
    startTimeMs.set(Date.now());
    trigger.set(`Test notes for John Smith. Email: john@example.com. Phone: 555-1234. Birthday: 1985-03-15.\n---EXTRACT-${Date.now()}---`);
  },
);

// Handler to cancel extraction
const cancelExtraction = handler<
  Record<string, never>,
  { extractedData: Writable<any> }
>(
  (_, { extractedData }) => {
    extractedData.set(null);
  },
);

// Handler to apply extracted data (just clears for this test)
const applyExtractedData = handler<
  Record<string, never>,
  { extractedData: Writable<any> }
>(
  (_, { extractedData }) => {
    console.log("[PERF-TABS] Applying extracted data");
    extractedData.set(null);
  },
);

// Schema matching person.tsx extraction
interface ExtractionResult {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  nickname?: string;
  pronouns?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  twitter?: string;
  linkedin?: string;
  github?: string;
  instagram?: string;
  mastodon?: string;
  remainingNotes?: string;
}

export default pattern(() => {
  // Trigger for extraction
  const trigger = Writable.of<string>("");
  const startTimeMs = Writable.of<number>(0);

  // Mock current values (empty, like a new person)
  const displayName = Writable.of<string>("");
  const givenName = Writable.of<string>("");
  const familyName = Writable.of<string>("");
  const nickname = Writable.of<string>("");
  const pronouns = Writable.of<string>("");
  const birthday = Writable.of<string>("");
  const emailValue = Writable.of<string>("");
  const phoneValue = Writable.of<string>("");
  const twitterHandle = Writable.of<string>("");
  const linkedinHandle = Writable.of<string>("");
  const githubHandle = Writable.of<string>("");
  const instagramHandle = Writable.of<string>("");
  const mastodonHandle = Writable.of<string>("");
  const notes = Writable.of<string>("");

  // Guarded prompt
  const guardedPrompt = computed(() => {
    const t = trigger.get();
    if (t && t.includes("---EXTRACT-")) {
      return t;
    }
    return undefined;
  });

  // Whether extraction has been started (for UI state)
  const hasStarted = computed(() => {
    return trigger.get() !== "";
  });

  // The extraction call - same schema as person.tsx
  const { result: extractionResult, pending: extractionPending } = generateObject({
    system: `You are a profile data extraction assistant. Extract structured information from unstructured notes.`,
    prompt: guardedPrompt,
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object",
      properties: {
        displayName: { type: "string" },
        givenName: { type: "string" },
        familyName: { type: "string" },
        nickname: { type: "string" },
        pronouns: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        birthday: { type: "string" },
        twitter: { type: "string" },
        linkedin: { type: "string" },
        github: { type: "string" },
        instagram: { type: "string" },
        mastodon: { type: "string" },
        remainingNotes: { type: "string" },
      },
    },
  });

  // changesPreview computed - copied from person.tsx
  const changesPreview = computed(() => {
    const t0 = Date.now();
    const result = extractionResult as ExtractionResult | null;
    const changes = compareFields(result, {
      displayName: { current: displayName.get(), label: "Display Name" },
      givenName: { current: givenName.get(), label: "First Name" },
      familyName: { current: familyName.get(), label: "Last Name" },
      nickname: { current: nickname.get(), label: "Nickname" },
      pronouns: { current: pronouns.get(), label: "Pronouns" },
      birthday: { current: birthday.get(), label: "Birthday" },
      email: { current: emailValue.get(), label: "Email" },
      phone: { current: phoneValue.get(), label: "Phone" },
      twitter: { current: twitterHandle.get(), label: "Twitter" },
      linkedin: { current: linkedinHandle.get(), label: "LinkedIn" },
      github: { current: githubHandle.get(), label: "GitHub" },
      instagram: { current: instagramHandle.get(), label: "Instagram" },
      mastodon: { current: mastodonHandle.get(), label: "Mastodon" },
      remainingNotes: { current: notes.get(), label: "Notes" },
    });
    console.log(`[PERF-TABS] changesPreview computed: ${Date.now() - t0}ms, ${changes.length} changes`);
    return changes;
  });

  // Derive a boolean for whether we have results
  const hasExtractionResults = computed(() => {
    const preview = changesPreview as Array<{field: string; from: string; to: string}>;
    const has = preview.length > 0;
    console.log(`[PERF-TABS] hasExtractionResults: ${has}`);
    return has;
  });

  // Pre-compute word diff for Notes field
  const notesDiffChunks = computed(() => {
    const t0 = Date.now();
    const preview = changesPreview as Array<{field: string; from: string; to: string}>;
    const notesChange = preview.find((c) => c.field === "Notes");
    if (!notesChange || !notesChange.from || !notesChange.to ||
        notesChange.from === "(empty)" || notesChange.to === "(empty)") {
      console.log(`[PERF-TABS] notesDiffChunks: skipped (no diff needed)`);
      return [] as DiffChunk[];
    }
    const result = computeWordDiff(notesChange.from, notesChange.to);
    console.log(`[PERF-TABS] notesDiffChunks: ${Date.now() - t0}ms, ${result.length} chunks`);
    return result;
  });

  // Track when result arrives
  const timingCheck = computed(() => {
    const start = startTimeMs.get();
    if (!start) return null;

    if (!extractionPending && extractionResult) {
      const elapsed = Date.now() - start;
      console.log(`[PERF-TABS] Extraction completed in ${elapsed}ms`);
      return elapsed;
    }
    return null;
  });

  // Separate computed for display to avoid null .get() issues
  const timingDisplay = computed(() => {
    const elapsed = timingCheck as number | null;
    if (elapsed === null) return null;
    return `Total time: ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`;
  });

  return {
    [NAME]: "Person Perf Tabs",
    [UI]: (
      // ============================================================
      // THIS IS THE KEY CHANGE WE'RE TESTING
      // ct-autolayout with tabNames prop, similar to person.tsx
      // ============================================================
      <ct-autolayout tabNames={["Details", "Relationship", "Notes"]}>
        {/* Tab 1: Details - Test area with extraction button */}
        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 12px;">
            <h1>Person Perf Tabs Test</h1>

            <div
              style={{
                backgroundColor: "#fef3c7",
                padding: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <strong>HYPOTHESIS:</strong> Tabbed interface (ct-autolayout with tabNames) causes ~60s spike
            </div>

            <ct-button
              onClick={triggerExtraction({ trigger, startTimeMs })}
              disabled={extractionPending}
            >
              {extractionPending ? "Extracting..." : "Run Extraction"}
            </ct-button>

            <h2>Status</h2>

            {ifElse(
              hasExtractionResults,
              (
                // Modal with .map() - copied from person.tsx
                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    padding: "1rem",
                    border: "1px solid #86efac",
                    borderRadius: "8px",
                  }}
                >
                  <h3 style={{ margin: "0 0 8px 0" }}>Review Extracted Changes</h3>
                  <p style={{ margin: "0 0 12px 0", color: "#666", fontSize: "13px" }}>
                    The following changes will be applied:
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {changesPreview.map((change) => (
                      <div
                        style={{
                          padding: "6px 10px",
                          background: "#f9fafb",
                          border: "1px solid #e5e7eb",
                          borderRadius: "4px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong style={{ fontSize: "12px" }}>
                            {change.field}
                          </strong>
                          {change.field === "Notes"
                            ? (
                              <div style={{ fontSize: "11px", lineHeight: "1.4" }}>
                                {notesDiffChunks.map((part) => {
                                  if (part.type === "removed") {
                                    return (
                                      <span
                                        style={{
                                          color: "#dc2626",
                                          textDecoration: "line-through",
                                          backgroundColor: "#fee",
                                        }}
                                      >
                                        {part.word}
                                      </span>
                                    );
                                  } else if (part.type === "added") {
                                    return (
                                      <span
                                        style={{
                                          color: "#16a34a",
                                          backgroundColor: "#efe",
                                        }}
                                      >
                                        {part.word}
                                      </span>
                                    );
                                  } else {
                                    return <span>{part.word}</span>;
                                  }
                                })}
                              </div>
                            )
                            : (
                              <div style={{ fontSize: "11px", lineHeight: "1.4" }}>
                                <span
                                  style={{
                                    color: "#dc2626",
                                    textDecoration: "line-through",
                                    marginRight: "6px",
                                  }}
                                >
                                  {change.from}
                                </span>
                                <span style={{ color: "#16a34a" }}>
                                  {change.to}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      justifyContent: "flex-end",
                      marginTop: "12px",
                    }}
                  >
                    <ct-button
                      onClick={cancelExtraction({ extractedData: extractionResult })}
                    >
                      Cancel
                    </ct-button>
                    <ct-button
                      onClick={applyExtractedData({ extractedData: extractionResult })}
                    >
                      Accept Changes
                    </ct-button>
                  </div>

                  {timingDisplay && (
                    <p style={{ marginTop: "12px", fontWeight: "bold" }}>
                      {timingDisplay}
                    </p>
                  )}
                </div>
              ),
              (
                // Not showing results yet
                <div>
                  {!hasStarted ? (
                    <p>Click the button to start extraction</p>
                  ) : extractionPending ? (
                    <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem" }}>
                      Extracting... (check console for timing)
                    </div>
                  ) : (
                    <p>Ready</p>
                  )}
                </div>
              ),
            )}

            <h2>What This Tests</h2>
            <ul>
              <li><code>ct-autolayout tabNames</code> (THE KEY TEST - 3 tabs)</li>
              <li><code>ct-vscroll</code> scrollable content</li>
              <li><code>ct-vstack</code> vertical layout</li>
              <li>Everything from autolayout test (4.6s)</li>
            </ul>
          </ct-vstack>
        </ct-vscroll>

        {/* Tab 2: Relationship - Empty placeholder */}
        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 12px;">
            <h2>Relationship Tab</h2>
            <p>This tab is empty - just testing tab structure overhead.</p>
          </ct-vstack>
        </ct-vscroll>

        {/* Tab 3: Notes - Empty placeholder */}
        <ct-vscroll flex showScrollbar>
          <ct-vstack style="padding: 16px; gap: 12px;">
            <h2>Notes Tab</h2>
            <p>This tab is empty - just testing tab structure overhead.</p>
          </ct-vstack>
        </ct-vscroll>
      </ct-autolayout>
    ),
  };
});
