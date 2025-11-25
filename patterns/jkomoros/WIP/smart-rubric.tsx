/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

/**
 * Smart Rubric - Decision Making Tool
 *
 * Phase 4: Manual Ranking
 *
 * Tests:
 * - Dynamic dimension lookups with key-value pattern
 * - Reactive score calculation with derive()
 * - Adding/removing dimensions
 * - Changing dimension weights and values
 * - Editing option values for dimensions via detail pane
 * - Manual ranking with up/down buttons
 * - Visual indicators for manually ranked items
 * - Reset manual ranks functionality
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
  title: Default<string, "Decision Rubric">;
  options: Default<Array<Cell<RubricOption>>, []>;  // Boxed: Array of Cells
  dimensions: Default<Dimension[], []>;
  selection: Default<SelectionState, { value: null }>;
}

interface RubricOutput {
  title: Cell<string>;
  options: Cell<Array<Cell<RubricOption>>>;  // Boxed: Array of Cells
  dimensions: Cell<Dimension[]>;
  selection: Cell<SelectionState>;
}

// ============================================================================
// Pattern
// ============================================================================

export default pattern<RubricInput, RubricOutput>(
  ({ title, options, dimensions, selection }) => {
    // CRITICAL: Save references to Cells BEFORE entering .map() or derive() contexts
    // Inside .map() and derive(), closures may unwrap Cells to plain values
    const selectionCell = selection;
    const optionsCell = options;

    // ========================================================================
    // Score Calculation Helper (Per-Option)
    // ========================================================================

    // SIMPLIFIED APPROACH: Compute score for individual option
    // Instead of one big computed array, we compute per-option in JSX
    const calculateScore = (option: RubricOption) => {
      let totalScore = 0;

      // Get array value from Cell
      const dimensionsArray = dimensions.get();

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
    };

    // Note: We don't use computed() to get selected option Cell
    // Instead, we'll look it up directly in the detail pane derive block

    // ========================================================================
    // Handlers
    // ========================================================================

    const addTestOption = handler<unknown, { options: Cell<Array<Cell<RubricOption>>> }>(
      (_, { options }) => {
        options.push(cell({
          name: `Option ${options.get().length + 1}`,
          values: [],
          manualRank: null,
        }));
      }
    );

    const addTestDimension = handler<unknown, { dimensions: Cell<Dimension[]> }>(
      (_, { dimensions }) => {
        const count = dimensions.get().length + 1;
        const isEven = count % 2 === 0;

        if (isEven) {
          // Add categorical dimension
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
          // Add numeric dimension
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
      { dimension: Cell<Dimension>, delta: number }
    >(
      (_, { dimension, delta }) => {
        const current = dimension.key("multiplier").get();
        dimension.key("multiplier").set(Math.max(0.1, current + delta));
      }
    );

    const selectOption = handler<unknown, { name: string, selectionCell: Cell<SelectionState> }>(
      (_, { name, selectionCell }) => {
        selectionCell.set({ value: name });
      }
    );

    const changeCategoricalValue = handler<
      unknown,
      { optionCell: Cell<RubricOption>, dimensionName: string, categoryValue: string }
    >(
      (_, { optionCell, dimensionName, categoryValue }) => {
        // BOXING: Mutate the Cell directly
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
      { optionCell: Cell<RubricOption>, dimensionName: string, delta: number, min: number, max: number }
    >(
      (_, { optionCell, dimensionName, delta, min, max }) => {
        // BOXING: Mutate the Cell directly
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

    // ========================================================================
    // Manual Ranking Handlers
    // ========================================================================

    const moveOptionUp = handler<
      unknown,
      { optionName: string, optionsCell: Cell<Array<Cell<RubricOption>>> }
    >(
      (_, { optionName, optionsCell }) => {
        const opts = optionsCell.get();
        const index = opts.findIndex(opt => opt.get().name === optionName);

        if (index <= 0) return; // Already at top or not found

        // BOXING: Just swap the Cell references, not the objects!
        const newOpts = [...opts];
        [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

        // Update manualRank on the individual Cells
        newOpts[index - 1].key("manualRank").set(index);
        newOpts[index].key("manualRank").set(index + 1);

        optionsCell.set(newOpts);
      }
    );

    const moveOptionDown = handler<
      unknown,
      { optionName: string, optionsCell: Cell<Array<Cell<RubricOption>>> }
    >(
      (_, { optionName, optionsCell }) => {
        const opts = optionsCell.get();
        const index = opts.findIndex(opt => opt.get().name === optionName);

        if (index < 0 || index >= opts.length - 1) return; // Already at bottom or not found

        // BOXING: Just swap the Cell references, not the objects!
        const newOpts = [...opts];
        [newOpts[index], newOpts[index + 1]] = [newOpts[index + 1], newOpts[index]];

        // Update manualRank on the individual Cells
        newOpts[index].key("manualRank").set(index + 1);
        newOpts[index + 1].key("manualRank").set(index + 2);

        optionsCell.set(newOpts);
      }
    );

    const resetManualRanks = handler<
      unknown,
      { optionsCell: Cell<Array<Cell<RubricOption>>> }
    >(
      (_, { optionsCell }) => {
        const opts = optionsCell.get();
        // BOXING: Update each Cell's manualRank directly
        opts.forEach(opt => {
          opt.key("manualRank").set(null);
        });
      }
    );

    // ========================================================================
    // Helper: Get option value for dimension
    // ========================================================================

    const getOptionValueForDimension = (
      option: RubricOption,
      dimensionName: string
    ): string | number => {
      const valueRecord = option.values.find(v => v.dimensionName === dimensionName);
      return valueRecord?.value ?? "";
    };

    // ========================================================================
    // UI
    // ========================================================================

    return {
      [NAME]: "Smart Rubric (Phase 4)",
      [UI]: (
        <ct-vstack gap="2" style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
          {/* Header */}
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.5rem 0" }}>Smart Rubric - Phase 4</h2>
            <ct-input $value={title} placeholder="Rubric Title" style="width: 100%;" />
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
                options.map((option, index) => {
                  // Use derive() to reactively compute score
                  const score = derive(
                    { option, dims: dimensions },
                    ({ option, dims }: { option: RubricOption; dims: Dimension[] }) => {
                      let totalScore = 0;
                      dims.forEach((dim: Dimension) => {
                        const valueRecord = option.values.find((v: OptionValue) => v.dimensionName === dim.name);
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

                  const optionName = derive(option, (opt: RubricOption) => opt.name);
                  const isSelected = derive(
                    { selected: selection, name: optionName },
                    ({ selected, name }) => selected.value === name
                  );

                  // Check if this option has manual rank set
                  const hasManualRank = derive(option, (opt: RubricOption) => opt.manualRank !== null);

                  return (
                    <div
                      style={{
                        padding: "0.75rem",
                        border: derive(isSelected, (sel) => sel ? "2px solid #007bff" : "1px solid #ddd"),
                        borderRadius: "4px",
                        background: derive(isSelected, (sel) => sel ? "#e7f3ff" : "white"),
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        {/* Up/Down Buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <ct-button
                            onClick={derive(optionName, (name) => moveOptionUp({ optionName: name, optionsCell }))}
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
                            onClick={derive(optionName, (name) => moveOptionDown({ optionName: name, optionsCell }))}
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
                          onClick={derive(optionName, (name) => selectOption({ name, selectionCell }))}
                          style={{
                            flex: 1,
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          {index + 1}. {optionName}
                        </span>

                        {/* Score */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            fontSize: "1.2em",
                            fontWeight: "bold",
                            color: "#007bff",
                          }}>
                            {derive(score, (s) => s.toFixed(1))}
                          </span>
                          {/* Manual Rank Indicator */}
                          {derive(hasManualRank, (manual) =>
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
                ({ selectedState, opts, dims }) => {
                  // BOXING: Look up the selected option Cell by name
                  let selectedCell: Cell<RubricOption> | null = null;
                  if (selectedState.value) {
                    for (let i = 0; i < opts.length; i++) {
                      if (opts[i].get().name === selectedState.value) {
                        selectedCell = opts[i];
                        break;
                      }
                    }
                  }

                  const selectedData = selectedCell?.get() || null;

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
                                            optionCell: selectedCell!,
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
                                        optionCell: selectedCell!,
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
                                        optionCell: selectedCell!,
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
                      <ct-button onClick={changeDimensionMultiplier({ dimension: dim, delta: -0.5 })}>
                        -
                      </ct-button>
                      <ct-button onClick={changeDimensionMultiplier({ dimension: dim, delta: 0.5 })}>
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
    };
  }
);
