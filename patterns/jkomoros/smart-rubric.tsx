/// <cts-enable />
import {
  Writable,
  computed,
  Default,
  derive,
  equals,
  generateObject,
  handler,
  NAME,
  pattern,
  toSchema,
  UI,
} from "commontools";

/**
 * Smart Rubric - Decision Making Tool
 *
 * Phase 5: LLM Quick Add Feature
 *
 * Features:
 * - Dynamic dimension lookups with key-value pattern
 * - Reactive score calculation with derive()
 * - Adding/removing dimensions
 * - Changing dimension weights and values
 * - Editing option values for dimensions via detail pane
 * - Manual ranking with up/down buttons using boxing pattern
 * - equals() standalone function for Writable identity comparison
 * - LLM-powered Quick Add: describe an option, get extracted dimension values
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface CategoryOption {
  label: string;      // "Downtown", "Suburbs"
  score: number;      // 10, 5
}

interface Dimension {
  name: string;
  type: "categorical" | "numeric";
  multiplier: number;                            // No Default here - will provide in push
  categories: CategoryOption[];                  // No Default here
  numericMin: number;                            // No Default here
  numericMax: number;                            // No Default here
}

interface OptionValue {
  dimensionName: string;      // Key to look up dimension
  value: string | number;     // Category label OR numeric value
}

interface RubricOption {
  name: string;
  values: OptionValue[];                         // No Default here
  manualRank: number | null;                     // No Default here
}

interface SelectionState {
  value: string | null;
}

interface RubricInput {
  title?: Default<string, "Decision Rubric">;
  options?: Default<RubricOption[], []>;  // Plain array - framework auto-boxes to Writable<Array<Writable<RubricOption>>>
  dimensions?: Default<Dimension[], []>;
  selection?: Default<SelectionState, { value: null }>;
  quickAddPrompt?: Default<string, "">;  // For LLM Quick Add feature - user types here
  quickAddSubmitted?: Default<string, "">;  // Submitted prompt - triggers LLM only when set
}

interface RubricOutput {
  title: string;
  options: RubricOption[];  // Framework handles boxing
  dimensions: Dimension[];
  selection: SelectionState;
  quickAddPrompt: string;
  quickAddSubmitted: string;
}

// LLM Response type for Quick Add - must be object at root (not array)
interface QuickAddResponse {
  optionName: string;
  extractedValues: Array<{
    dimensionName: string;
    value: string | number;
    confidence: "high" | "medium" | "low";
  }>;
  reasoning: string;
}

// ============================================================================
// Module-Scope Helper Functions
// ============================================================================

function calculateScore(option: RubricOption, dimensionsArray: Dimension[]): number {
  let totalScore = 0;
  dimensionsArray.forEach(dim => {
    const valueRecord = option.values.find(v => v.dimensionName === dim.name);
    if (!valueRecord) return;

    let dimensionScore = 0;
    if (dim.type === "categorical") {
      const category = dim.categories.find(c => c.label === valueRecord.value);
      dimensionScore = category?.score || 0;
    } else {
      dimensionScore = Number(valueRecord.value) || 0;
    }

    totalScore += dimensionScore * dim.multiplier;
  });
  return totalScore;
}

function getOptionValueForDimension(
  option: RubricOption,
  dimensionName: string
): string | number {
  const valueRecord = option.values.find(v => v.dimensionName === dimensionName);
  return valueRecord?.value ?? "";
}

// ============================================================================
// Module-Scope Handlers
// ============================================================================

const addTestOption = handler<unknown, { options: Writable<Array<Writable<RubricOption>>> }>(
  (_, { options }) => {
    options.push({
      name: `Option ${options.get().length + 1}`,
      values: [],
      manualRank: null,
    });
  }
);

const acceptQuickAddFromResult = handler<
  unknown,
  {
    resultCell: Writable<QuickAddResponse | undefined>,
    optionsCell: Writable<Array<Writable<RubricOption>>>,
    promptCell: Writable<string>,
    submittedCell: Writable<string>,
  }
>(
  (_, { resultCell, optionsCell, promptCell, submittedCell }) => {
    const result = resultCell.get();
    if (!result) return;

    const values: OptionValue[] = (result.extractedValues || [])
      .filter((ev: { dimensionName?: string }) => ev && ev.dimensionName)
      .map((ev: { dimensionName: string; value: string | number }) => ({
        dimensionName: ev.dimensionName,
        value: ev.value,
      }));

    optionsCell.push({
      name: result.optionName,
      values,
      manualRank: null,
    });

    promptCell.set("");
    submittedCell.set("");
  }
);

const submitQuickAdd = handler<
  unknown,
  { promptCell: Writable<string>, submittedCell: Writable<string> }
>(
  (_, { promptCell, submittedCell }) => {
    const prompt = promptCell.get();
    if (prompt && prompt.trim() !== "") {
      submittedCell.set(prompt);
    }
  }
);

const clearQuickAdd = handler<
  unknown,
  { promptCell: Writable<string>, submittedCell: Writable<string> }
>(
  (_, { promptCell, submittedCell }) => {
    promptCell.set("");
    submittedCell.set("");
  }
);

const addTestDimension = handler<unknown, { dimensions: Writable<Dimension[]> }>(
  (_, { dimensions }) => {
    const count = [...dimensions.get()].length + 1;
    const isEven = count % 2 === 0;

    if (isEven) {
      dimensions.push({
        name: `Category ${count}`,
        type: "categorical",
        multiplier: 1,
        categories: [
          { label: "Excellent", score: 10 },
          { label: "Good", score: 7 },
          { label: "Fair", score: 4 },
          { label: "Poor", score: 1 },
        ],
        numericMin: 0,
        numericMax: 10,
      });
    } else {
      dimensions.push({
        name: `Number ${count}`,
        type: "numeric",
        multiplier: 1,
        categories: [],
        numericMin: 0,
        numericMax: 100,
      });
    }
  }
);

const changeDimensionMultiplier = handler<
  unknown,
  { dimensionsCell: Writable<Dimension[]>, dimensionName: string, delta: number }
>(
  (_, { dimensionsCell, dimensionName, delta }) => {
    const dims = [...dimensionsCell.get()];
    const index = dims.findIndex((d: Dimension) => d.name === dimensionName);
    if (index < 0) return;
    const current = dims[index].multiplier;
    const updated = { ...dims[index], multiplier: Math.max(0.1, current + delta) };
    dimensionsCell.set(dims.toSpliced(index, 1, updated));
  }
);

const selectOption = handler<unknown, { name: string, selectionCell: Writable<SelectionState> }>(
  (_, { name, selectionCell }) => {
    selectionCell.set({ value: name });
  }
);

const changeCategoricalValue = handler<
  unknown,
  { optionName: string, optionsCell: Writable<Array<Writable<RubricOption>>>, dimensionName: string, categoryValue: string }
>(
  (_, { optionName, optionsCell, dimensionName, categoryValue }) => {
    const opts = optionsCell.get();
    const optionCell = opts.find((opt: Writable<RubricOption>) => opt.get().name === optionName);
    if (!optionCell) return;

    const opt = optionCell.get();
    const existingIndex = opt.values.findIndex(
      (v: OptionValue) => v.dimensionName === dimensionName
    );

    let newValues;
    if (existingIndex >= 0) {
      newValues = opt.values.toSpliced(existingIndex, 1, {
        dimensionName,
        value: categoryValue,
      });
    } else {
      newValues = [...opt.values, {
        dimensionName,
        value: categoryValue,
      }];
    }

    optionCell.key("values").set(newValues);
  }
);

const changeNumericValue = handler<
  unknown,
  { optionName: string, optionsCell: Writable<Array<Writable<RubricOption>>>, dimensionName: string, delta: number, min: number, max: number }
>(
  (_, { optionName, optionsCell, dimensionName, delta, min, max }) => {
    const opts = optionsCell.get();
    const optionCell = opts.find((opt: Writable<RubricOption>) => opt.get().name === optionName);
    if (!optionCell) return;

    const opt = optionCell.get();
    const existingIndex = opt.values.findIndex(
      (v: OptionValue) => v.dimensionName === dimensionName
    );

    const currentValue = existingIndex >= 0 ? (opt.values[existingIndex].value as number) : min;
    const newValue = Math.max(min, Math.min(max, currentValue + delta));

    let newValues;
    if (existingIndex >= 0) {
      newValues = opt.values.toSpliced(existingIndex, 1, {
        dimensionName,
        value: newValue,
      });
    } else {
      newValues = [...opt.values, {
        dimensionName,
        value: newValue,
      }];
    }

    optionCell.key("values").set(newValues);
  }
);

const moveOptionUp = handler<
  unknown,
  { optionCell: Writable<RubricOption>, optionsCell: Writable<Array<Writable<RubricOption>>> }
>(
  (_, { optionCell, optionsCell }) => {
    const opts = optionsCell.get();
    const index = opts.findIndex((opt: Writable<RubricOption>) => equals(opt, optionCell));

    if (index <= 0) return;

    const newOpts = [...opts];
    [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

    newOpts[index - 1].key("manualRank").set(index);
    newOpts[index].key("manualRank").set(index + 1);

    optionsCell.set(newOpts);
  }
);

const moveOptionDown = handler<
  unknown,
  { optionCell: Writable<RubricOption>, optionsCell: Writable<Array<Writable<RubricOption>>> }
>(
  (_, { optionCell, optionsCell }) => {
    const opts = optionsCell.get();
    const index = opts.findIndex((opt: Writable<RubricOption>) => equals(opt, optionCell));

    if (index < 0 || index >= opts.length - 1) return;

    const newOpts = [...opts];
    [newOpts[index], newOpts[index + 1]] = [newOpts[index + 1], newOpts[index]];

    newOpts[index].key("manualRank").set(index + 1);
    newOpts[index + 1].key("manualRank").set(index + 2);

    optionsCell.set(newOpts);
  }
);

const resetManualRanks = handler<
  unknown,
  { optionsCell: Writable<Array<Writable<RubricOption>>> }
>(
  (_, { optionsCell }) => {
    const opts = optionsCell.get();
    opts.forEach((opt: Writable<RubricOption>) => {
      opt.key("manualRank").set(null);
    });
  }
);

// ============================================================================
// Pattern
// ============================================================================

const SmartRubric = pattern<RubricInput, RubricOutput>(
  ({ title, options, dimensions, selection, quickAddPrompt, quickAddSubmitted }) => {
    // CRITICAL: Save references to Cells BEFORE entering .map() or derive() contexts
    // Inside .map() and derive(), closures may unwrap Cells to plain values
    const selectionCell = selection;
    const optionsCell = options;
    const quickAddPromptCell = quickAddPrompt;
    const quickAddSubmittedCell = quickAddSubmitted;

    // ========================================================================
    // LLM Quick Add - Extract dimension values from description
    // ========================================================================

    // Build system prompt with current dimensions using derive for reactivity
    const quickAddSystemPrompt = derive(
      { dims: dimensions },
      ({ dims }: { dims: Dimension[] }) => {
        if (dims.length === 0) {
          return `You are helping extract information for a decision rubric.
There are no dimensions defined yet. Extract a suitable name for the option and suggest what dimensions might be useful.`;
        }

        const dimDescriptions = dims.map(dim => {
          if (dim.type === "categorical") {
            const cats = dim.categories.map(c => `"${c.label}" (${c.score} pts)`).join(", ");
            return `- ${dim.name} (categorical): Options are ${cats}`;
          } else {
            return `- ${dim.name} (numeric): Range ${dim.numericMin}-${dim.numericMax}`;
          }
        }).join("\n");

        return `You are helping extract dimension values for a decision rubric.

Current dimensions:
${dimDescriptions}

Given a description of an option, extract:
1. A suitable name for the option
2. Values for each dimension (match categorical labels exactly, use numbers within range for numeric)
3. Your confidence level for each extraction

Be precise with categorical values - use exact label matches.`;
      }
    );

    // Call generateObject directly in pattern body (required by framework)
    // Use quickAddSubmitted (not quickAddPrompt) to avoid triggering on every keystroke
    // Only triggers when user clicks "Analyze" button
    // Using haiku model for faster response to reduce race condition issues
    // Pass Cell directly instead of derive() to reduce reactivity issues
    const quickAddExtraction = generateObject({
      model: "anthropic:claude-haiku-4-5",
      system: quickAddSystemPrompt,
      // Pass the Cell directly - framework should handle reactivity
      prompt: quickAddSubmitted,
      schema: toSchema<QuickAddResponse>(),
    });

    // ========================================================================
    // UI
    // ========================================================================

    return {
      [NAME]: "Smart Rubric (Phase 5)",
      [UI]: (
        <ct-vstack gap="2" style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
          {/* Header */}
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.5rem 0" }}>Smart Rubric - Phase 5</h2>
            <ct-input $value={title} placeholder="Rubric Title" style="width: 100%;" />
          </div>

          {/* Quick Add with LLM */}
          <div style={{
            padding: "1rem",
            background: "#e8f4f8",
            border: "1px solid #b8daff",
            borderRadius: "4px",
            marginBottom: "1rem",
          }}>
            <h3 style={{ margin: "0 0 0.75rem 0", color: "#004085" }}>
              🤖 Quick Add (AI-Powered)
            </h3>
            <ct-hstack gap="1" style={{ marginBottom: "0.75rem" }}>
              <ct-input
                $value={quickAddPromptCell}
                placeholder="Describe an option... e.g., 'Apartment A: 2br in Mission District, $2100/mo, 800sqft'"
                style="flex: 1;"
              />
              <ct-button
                onClick={submitQuickAdd({ promptCell: quickAddPromptCell, submittedCell: quickAddSubmittedCell })}
                style={{ background: "#007bff", color: "white" }}
              >
                Analyze
              </ct-button>
            </ct-hstack>

            {/* LLM Extraction Results - Display only, no handlers inside derive */}
            {derive(
              { pending: quickAddExtraction.pending, error: quickAddExtraction.error, result: quickAddExtraction.result, submitted: quickAddSubmitted },
              // deno-lint-ignore no-explicit-any
              ({ pending, error, result, submitted }: { pending: boolean; error: any; result: any; submitted: string | null }) => {
                // Check if we have a submitted prompt (not the placeholder)
                const hasSubmittedPrompt = submitted && submitted.trim() !== "" && submitted !== "No description submitted yet.";

                if (pending && hasSubmittedPrompt) {
                  return (
                    <div style={{ color: "#004085", padding: "0.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                      <ct-loader size="sm" show-elapsed></ct-loader>
                      Analyzing description...
                    </div>
                  );
                }

                if (error && hasSubmittedPrompt) {
                  return (
                    <div style={{ color: "#721c24", padding: "0.5rem", background: "#f8d7da", borderRadius: "4px" }}>
                      ❌ Error: {error}
                    </div>
                  );
                }

                // Only show result if we have a submitted prompt and a result
                if (result && hasSubmittedPrompt) {
                  return (
                    <div style={{ background: "white", padding: "1rem", borderRadius: "4px", border: "1px solid #ddd" }}>
                      <div style={{ marginBottom: "0.75rem" }}>
                        <strong>Extracted Option:</strong> {result.optionName}
                      </div>

                      {result.extractedValues && Array.isArray(result.extractedValues) && result.extractedValues.length > 0 && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <strong>Values:</strong>
                          <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>
                            {result.extractedValues
                              .filter((ev: any) => ev && ev.dimensionName)
                              .map((ev: { dimensionName: string; value: string | number; confidence: "high" | "medium" | "low" }) => (
                                <li style={{ fontSize: "0.9em" }}>
                                  {ev.dimensionName}: <strong>{String(ev.value ?? "")}</strong>
                                  <span style={{
                                    marginLeft: "0.5rem",
                                    fontSize: "0.8em",
                                    color: ev.confidence === "high" ? "#28a745" : ev.confidence === "medium" ? "#ffc107" : "#dc3545"
                                  }}>
                                    ({ev.confidence || "unknown"})
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ fontSize: "0.85em", color: "#666", marginBottom: "0.75rem" }}>
                        <em>{result.reasoning}</em>
                      </div>

                      <div style={{ color: "#666", fontSize: "0.85em", fontStyle: "italic" }}>
                        Use buttons below to accept or clear.
                      </div>
                    </div>
                  );
                }

                // Default: no submitted prompt yet
                return (
                  <div style={{ color: "#666", fontSize: "0.9em", fontStyle: "italic" }}>
                    Enter a description above and click "Analyze" to extract dimension values with AI.
                  </div>
                );
              }
            )}

            {/* Action buttons OUTSIDE derive to avoid ReadOnlyAddressError */}
            <ct-hstack gap="1" style={{ marginTop: "0.5rem" }}>
              <ct-button
                onClick={acceptQuickAddFromResult({
                  resultCell: quickAddExtraction.result,
                  optionsCell,
                  promptCell: quickAddPromptCell,
                  submittedCell: quickAddSubmittedCell,
                })}
                style={{ background: "#28a745", color: "white" }}
              >
                ✓ Accept & Add
              </ct-button>
              <ct-button
                onClick={clearQuickAdd({ promptCell: quickAddPromptCell, submittedCell: quickAddSubmittedCell })}
                style={{ background: "#6c757d", color: "white" }}
              >
                ✗ Clear
              </ct-button>
            </ct-hstack>
          </div>

          {/* Test Controls */}
          <ct-hstack gap="1" style="margin-bottom: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
            <ct-button onClick={addTestOption({ options })}>+ Add Test Option</ct-button>
            <ct-button onClick={addTestDimension({ dimensions })}>+ Add Test Dimension</ct-button>
            <ct-button onClick={resetManualRanks({ optionsCell })}>Reset Manual Ranks</ct-button>
          </ct-hstack>

          {/* Main Layout: Two Panes */}
          <ct-hstack gap="2" style="align-items: stretch; min-height: 400px;">

            {/* LEFT PANE: Ranked Options */}
            <ct-vstack
              gap="1"
              style="flex: 1; padding: 1rem; border: 1px solid #ddd; border-radius: 4px; background: #fafafa;"
            >
              <h3 style={{ margin: "0 0 1rem 0" }}>Ranked Options</h3>

              {options.length === 0 ? (
                <div style={{ color: "#999", fontStyle: "italic" }}>
                  No options yet. Add some test data!
                </div>
              ) : (
                // Boxing: optionCell is a Writable<RubricOption>
                options.map((optionCell, index) => {
                  // Use derive() to reactively compute score
                  const score = derive(
                    { opt: optionCell, dims: dimensions },
                    ({ opt, dims }: { opt: RubricOption; dims: Dimension[] }) => {
                      let totalScore = 0;
                      dims.forEach((dim: Dimension) => {
                        const valueRecord = opt.values.find((v: OptionValue) => v.dimensionName === dim.name);
                        if (!valueRecord) return;

                        let dimensionScore = 0;
                        if (dim.type === "categorical") {
                          const category = dim.categories.find(c => c.label === valueRecord.value);
                          dimensionScore = category?.score || 0;
                        } else {
                          dimensionScore = Number(valueRecord.value) || 0;
                        }

                        totalScore += dimensionScore * dim.multiplier;
                      });
                      return totalScore;
                    }
                  );

                  const optionName = derive(optionCell, (opt: RubricOption) => opt.name);
                  const isSelected = derive(
                    { selected: selection, name: optionName },
                    ({ selected, name }: { selected: SelectionState; name: string }) => selected.value === name
                  );
                  const hasManualRank = derive(optionCell, (opt: RubricOption) => opt.manualRank !== null);

                  return (
                    <div
                      style={{
                        padding: "0.75rem",
                        border: derive(isSelected, (sel: boolean) => sel ? "2px solid #007bff" : "1px solid #ddd"),
                        borderRadius: "4px",
                        background: derive(isSelected, (sel: boolean) => sel ? "#e7f3ff" : "white"),
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        {/* Up/Down Buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <ct-button
                            onClick={moveOptionUp({ optionCell, optionsCell })}
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.7em",
                              minWidth: "24px",
                              opacity: index === 0 ? "0.3" : "1",
                            }}
                          >
                            ▲
                          </ct-button>
                          <ct-button
                            onClick={moveOptionDown({ optionCell, optionsCell })}
                            style={{
                              padding: "2px 6px",
                              fontSize: "0.7em",
                              minWidth: "24px",
                              opacity: index === options.length - 1 ? "0.3" : "1",
                            }}
                          >
                            ▼
                          </ct-button>
                        </div>

                        {/* Option Name - Clickable */}
                        <span
                          onClick={selectOption({ name: derive(optionCell, (opt: RubricOption) => opt.name), selectionCell })}
                          style={{
                            flex: 1,
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          {index + 1}. {optionName}
                        </span>

                        {/* Score and Manual Rank Indicator */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            fontSize: "1.2em",
                            fontWeight: "bold",
                            color: "#007bff",
                          }}>
                            {derive(score, (s: number) => s.toFixed(1))}
                          </span>
                          {derive(hasManualRank, (manual: boolean) =>
                            manual ? (
                              <span style={{
                                fontSize: "0.8em",
                                color: "#ff9800",
                                fontWeight: "bold",
                              }} title="Manual ranking applied">
                                ✋
                              </span>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </ct-vstack>

            {/* RIGHT PANE: Detail or Instructions */}
            <ct-vstack
              gap="1"
              style="flex: 1; padding: 1rem; border: 1px solid #ddd; border-radius: 4px; background: #fafafa;"
            >
              {derive(
                { selectedState: selection, opts: options, dims: dimensions },
                ({ selectedState, opts, dims }: { selectedState: SelectionState; opts: RubricOption[]; dims: Dimension[] }) => {
                  // Inside derive(), opts is unwrapped to RubricOption[] (plain objects)
                  // No .get() needed - access properties directly
                  const selectedData = selectedState.value
                    ? opts.find((opt: RubricOption) => opt.name === selectedState.value) || null
                    : null;

                  if (!selectedData) {
                    // Show instructions when no option selected
                    return (
                      <div>
                        <h3 style={{ margin: "0 0 1rem 0" }}>Instructions</h3>
                        <div style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                          <p><strong>Goal:</strong> Validate dynamic dimension data model</p>

                          <ol>
                            <li>Click "+ Add Test Option" to add options</li>
                            <li>Click "+ Add Test Dimension" to add dimensions</li>
                            <li>Adjust dimension weights using +/- buttons</li>
                            <li><strong>Click an option</strong> to edit its dimension values!</li>
                          </ol>

                          <p style={{ marginTop: "1rem", padding: "0.5rem", background: "#ffffcc", borderRadius: "4px" }}>
                            <strong>Testing:</strong> Scores should update automatically when you change values!
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // Show detail pane for selected option
                  // Handlers use optionName + optionsCell to look up and mutate

                  return (
                    <div>
                      <h3 style={{ margin: "0 0 1rem 0" }}>
                        Editing: {selectedData.name}
                      </h3>

                      {dims.length === 0 ? (
                        <div style={{ color: "#999", fontStyle: "italic" }}>
                          No dimensions yet. Add dimensions to set values.
                        </div>
                      ) : (
                        <div>
                          {dims.map((dim) => {
                            // Get current value for this dimension
                            const currentValue = selectedData.values.find(
                              v => v.dimensionName === dim.name
                            )?.value ?? "";

                            return (
                              <div style={{
                                padding: "0.75rem",
                                background: "white",
                                border: "1px solid #ddd",
                                borderRadius: "4px",
                                marginBottom: "0.75rem",
                              }}>
                                <div style={{
                                  fontSize: "0.85em",
                                  fontWeight: "500",
                                  marginBottom: "0.5rem",
                                  color: "#555",
                                }}>
                                  {dim.name} [{dim.type}]
                                </div>

                                {dim.type === "categorical" ? (
                                  dim.categories.length > 0 ? (
                                    <div style={{ fontSize: "0.9em" }}>
                                      {dim.categories.map((cat) => (
                                        <ct-button
                                          onClick={changeCategoricalValue({
                                            optionName: selectedData.name,
                                            optionsCell,
                                            dimensionName: dim.name,
                                            categoryValue: cat.label,
                                          })}
                                          style={{
                                            padding: "0.5rem 0.75rem",
                                            marginRight: "0.5rem",
                                            marginBottom: "0.5rem",
                                            border: currentValue === cat.label ? "2px solid #007bff" : "1px solid #ddd",
                                            borderRadius: "4px",
                                            background: currentValue === cat.label ? "#e7f3ff" : "white",
                                            cursor: "pointer",
                                            fontWeight: currentValue === cat.label ? "bold" : "normal",
                                          }}
                                        >
                                          {cat.label} ({cat.score} pts)
                                        </ct-button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>
                                      No categories defined
                                    </div>
                                  )
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <ct-button
                                      onClick={changeNumericValue({
                                        optionName: selectedData.name,
                                        optionsCell,
                                        dimensionName: dim.name,
                                        delta: -10,
                                        min: dim.numericMin,
                                        max: dim.numericMax,
                                      })}
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        border: "1px solid #ddd",
                                        borderRadius: "4px",
                                        background: "white",
                                        cursor: "pointer",
                                        fontSize: "1.2em",
                                      }}
                                    >
                                      -
                                    </ct-button>

                                    <span style={{
                                      flex: 1,
                                      textAlign: "center",
                                      fontSize: "1.1em",
                                      fontWeight: "bold",
                                    }}>
                                      {currentValue || dim.numericMin}
                                    </span>

                                    <ct-button
                                      onClick={changeNumericValue({
                                        optionName: selectedData.name,
                                        optionsCell,
                                        dimensionName: dim.name,
                                        delta: 10,
                                        min: dim.numericMin,
                                        max: dim.numericMax,
                                      })}
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        border: "1px solid #ddd",
                                        borderRadius: "4px",
                                        background: "white",
                                        cursor: "pointer",
                                        fontSize: "1.2em",
                                      }}
                                    >
                                      +
                                    </ct-button>

                                    <span style={{ color: "#666", fontSize: "0.85em", whiteSpace: "nowrap" }}>
                                      ({dim.numericMin}-{dim.numericMax})
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </ct-vstack>
          </ct-hstack>

          {/* DIMENSIONS SECTION */}
          <ct-vstack gap="1" style="margin-top: 1rem; padding: 1rem; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
            <h3 style={{ margin: "0 0 1rem 0" }}>Dimensions</h3>

            {dimensions.length === 0 ? (
              <div style={{ color: "#999", fontStyle: "italic" }}>
                No dimensions yet. Add some test dimensions!
              </div>
            ) : (
              dimensions.map((dim) => (
                <div style={{
                  padding: "0.75rem",
                  background: "white",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{dim.name}</strong>
                      <span style={{ marginLeft: "0.5rem", color: "#666" }}>
                        [{dim.type}]
                      </span>
                    </div>

                    <ct-hstack gap="1">
                      <span style={{ marginRight: "0.5rem" }}>
                        Weight: {dim.multiplier.toFixed(1)}×
                      </span>
                      <ct-button onClick={changeDimensionMultiplier({ dimensionsCell: dimensions, dimensionName: dim.name, delta: -0.5 })}>
                        -
                      </ct-button>
                      <ct-button onClick={changeDimensionMultiplier({ dimensionsCell: dimensions, dimensionName: dim.name, delta: 0.5 })}>
                        +
                      </ct-button>
                    </ct-hstack>
                  </div>

                  {dim.type === "categorical" && dim.categories.length > 0 && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "#666" }}>
                      Categories: {dim.categories.map(c => `${c.label}=${c.score}`).join(", ")}
                    </div>
                  )}

                  {dim.type === "numeric" && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "#666" }}>
                      Range: {dim.numericMin} - {dim.numericMax}
                    </div>
                  )}
                </div>
              ))
            )}
          </ct-vstack>

          {/* DEBUG INFO */}
          <details style={{ marginTop: "1rem", padding: "1rem", background: "#f0f0f0", borderRadius: "4px" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
              Debug Info (Click to expand)
            </summary>
            <pre style={{ fontSize: "0.75em", overflow: "auto" }}>
              {JSON.stringify({
                optionsCount: options.length,
                dimensionsCount: dimensions.length,
                selectedOption: selection,
              }, null, 2)}
            </pre>
          </details>
        </ct-vstack>
      ),
      title,
      options,
      dimensions,
      selection,
      quickAddPrompt,
      quickAddSubmitted,
    };
  }
);

export default SmartRubric;
