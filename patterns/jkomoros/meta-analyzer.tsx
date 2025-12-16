/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  generateObject,
  handler,
  ifElse,
  NAME,
  type Opaque,
  OpaqueRef,
  recipe,
  str,
  UI,
  wish,
} from "commontools";

// Type for a person charm reference
type PersonCharm = {
  displayName: string;
  notes: string;
  customFields: Array<{
    key: string;
    label: string;
    value: string;
    dataType: "text" | "number" | "date" | "url";
  }>;
};

type FieldSuggestion = {
  fieldKey: string;
  fieldLabel: string;
  dataType: Default<"text" | "number" | "date" | "url", "text">;
  frequency: number;
  samples: Array<{ personName: string; value: string }>;
};

type Input = Record<string, never>;

type Output = {
  suggestions: FieldSuggestion[];
  isAnalyzing: boolean;
  analyzeTrigger: any;
};

// Handler to trigger analysis
const triggerAnalysis = handler<
  Record<string, never>,
  { analysisInput: Cell<string>; personCharms: Array<OpaqueRef<PersonCharm>>; hasAnalyzed: Cell<boolean> }
>(
  (_, { analysisInput, personCharms, hasAnalyzed }) => {
    // Create a snapshot of all person data for analysis
    const snapshot = personCharms.map((charm, idx) => ({
      index: idx,
      name: charm.displayName || `Person ${idx + 1}`,
      notes: charm.notes || "",
      existingFields: charm.customFields || [],
    }));

    // Add timestamp to ensure the trigger value always changes
    analysisInput.set(`${JSON.stringify(snapshot)}\n---ANALYZE-${Date.now()}---`);
    hasAnalyzed.set(true);
  },
);

const MetaAnalyzer = recipe<Input, Output>(
  "Meta Analyzer",
  () => {
    // Get all charms from the space via wish
    const allCharmsWish = wish<any[]>("#allCharms");
    const allCharms = computed(() => allCharmsWish ?? []);

    // Filter for Person charms (those with profile property)
    const personCharms = computed(() =>
      allCharms.filter((charm: any) =>
        charm && typeof charm === "object" && "profile" in charm
      )
    );

    // Cell to hold the input for analysis
    const analysisInput = Cell.of<string>("");
    const hasAnalyzed = Cell.of<boolean>(false);

    // Derive count of person charms
    const personCount = computed(() => personCharms.length);

    // LLM analysis for field suggestions
    const { result: analysisResult, pending: analysisPending } = generateObject({
      system: `You are an AI assistant that analyzes contact/person data to suggest useful custom fields.

Your task is to analyze the notes from multiple person profiles and identify patterns that could become structured fields.

Look for:
1. Information that appears in 2 or more profiles (e.g., "Current Company", "Location", "Last Contact Date")
2. Consistent patterns in how information is mentioned
3. Information that would be useful to extract into a structured field

For each suggested field, provide:
- fieldKey: A camelCase key (e.g., "currentCompany")
- fieldLabel: A human-readable label (e.g., "Current Company")
- dataType: The appropriate data type (text, number, date, or url)
- frequency: How many profiles contain this information
- samples: Up to 3 examples showing the person's name and the extracted value

Only suggest fields that appear in at least 2 profiles and would genuinely be useful to extract.
Do not suggest fields that are already standard (name, email, phone, birthday, social media).

Return an array of suggestions, or an empty array if no patterns are found.`,
      prompt: analysisInput,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fieldKey: { type: "string" },
                fieldLabel: { type: "string" },
                dataType: {
                  type: "string",
                  enum: ["text", "number", "date", "url"]
                },
                frequency: { type: "number" },
                samples: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      personName: { type: "string" },
                      value: { type: "string" },
                    },
                    required: ["personName", "value"]
                  }
                }
              },
              required: ["fieldKey", "fieldLabel", "dataType", "frequency", "samples"]
            }
          }
        },
        required: ["suggestions"]
      },
    });

    // Derive the suggestions array from the result
    const suggestions = computed(
      () => analysisResult?.suggestions || []
    );

    return {
      [NAME]: str`⚡ Meta Analyzer (${personCount} profiles)`,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2 style={{ margin: 0 }}>Field Suggestions</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style={{ padding: "16px", gap: "12px" }}>
              <ct-hstack style={{ alignItems: "center", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, color: "#666", fontSize: "13px" }}>
                    {personCount} profile{personCount !== 1 ? "s" : ""} • Click Analyze to find common fields
                  </p>
                </div>
                <ct-button
                  onClick={triggerAnalysis({ analysisInput, personCharms, hasAnalyzed })}
                  disabled={analysisPending}
                  variant="secondary"
                >
                  {ifElse(
                    analysisPending,
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <ct-loader size="sm" show-elapsed></ct-loader>
                      Analyzing...
                    </span>,
                    "Analyze Profiles"
                  )}
                </ct-button>
              </ct-hstack>

              {ifElse(
                computed(() => suggestions.length > 0),
                <ct-vstack style={{ gap: "12px" }}>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "14px" }}>Suggested Fields</h3>
                  {suggestions.map((suggestion: FieldSuggestion) => (
                  <ct-vstack
                    style={{
                      padding: "12px",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      gap: "8px",
                    }}
                  >
                    <ct-hstack style={{ alignItems: "center", gap: "12px" }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: "14px" }}>
                          {suggestion.fieldLabel}
                        </strong>
                        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                          Found in {suggestion.frequency} profile{suggestion.frequency !== 1 ? "s" : ""} • {suggestion.dataType}
                        </div>
                      </div>
                      <ct-button variant="secondary" size="sm" disabled>
                        Field
                      </ct-button>
                    </ct-hstack>

                    <ct-vstack style={{ gap: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: "500", color: "#555" }}>
                        Examples:
                      </div>
                      {suggestion.samples.map((sample: { personName: string; value: string }) => (
                        <div
                          style={{
                            fontSize: "11px",
                            padding: "6px 8px",
                            background: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "3px",
                          }}
                        >
                          <strong>{sample.personName}:</strong> {sample.value}
                        </div>
                      ))}
                    </ct-vstack>
                  </ct-vstack>
                ))}
                </ct-vstack>,
                ifElse(
                  computed(() => hasAnalyzed.get() && !analysisPending),
                  <div style={{ padding: "16px", textAlign: "center", color: "#666", fontSize: "13px" }}>
                    No common patterns found. Try adding more profiles with similar information in the notes.
                  </div>,
                  null
                )
              )}
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
      suggestions,
      isAnalyzing: analysisPending,
      analyzeTrigger: triggerAnalysis({ analysisInput, personCharms, hasAnalyzed }),
    };
  },
);

export default MetaAnalyzer;
