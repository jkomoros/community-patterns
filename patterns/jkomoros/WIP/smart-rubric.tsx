/// <cts-enable />
import {
  Cell,
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
 * Phase 2: Detail Pane with Editable Values
 *
 * Tests:
 * - Dynamic dimension lookups with key-value pattern
 * - Reactive score calculation with derive()
 * - Adding/removing dimensions
 * - Changing dimension weights and values
 * - Editing option values for dimensions via detail pane
 * - ct-select for categorical dimensions
 * - ct-input for numeric dimensions
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

interface RubricInput {
  title: Default<string, "Decision Rubric">;
  options: Default<RubricOption[], []>;
  dimensions: Default<Dimension[], []>;
  selectedOptionName: Default<string | null, null>;
}

// ============================================================================
// Pattern
// ============================================================================

export default pattern<RubricInput>(
  ({ title, options, dimensions, selectedOptionName }) => {

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

    // ========================================================================
    // Helper: Get selected option Cell
    // ========================================================================

    const selectedOptionCell = computed(() => {
      const name = selectedOptionName.get();
      if (!name) return null;
      // When we map over options in JSX, each item is a Cell
      // But when we get() the array here, we need to iterate and compare
      const optsList = options.get();
      for (let i = 0; i < optsList.length; i++) {
        const opt = options.at(i);  // Get the Cell at index i
        if (opt && opt.get().name === name) {
          return opt;
        }
      }
      return null;
    });

    // ========================================================================
    // Handlers
    // ========================================================================

    const selectOption = handler<unknown, { optionName: string }>(
      (_, { optionName }) => {
        selectedOptionName.set(optionName);
      }
    );

    const addTestOption = handler<unknown, { options: Cell<RubricOption[]> }>(
      (_, { options }) => {
        options.push({
          name: `Option ${options.get().length + 1}`,
          values: [],
          manualRank: null,
        });
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

    const changeCategoricalValue = handler<
      unknown,
      { option: Cell<RubricOption>, dimensionName: string, categoryValue: string }
    >(
      (_, { option, dimensionName, categoryValue }) => {
        const valuesCell = option.key("values");
        const currentValues = valuesCell.get();
        const existingIndex = currentValues.findIndex(
          (v: OptionValue) => v.dimensionName === dimensionName
        );

        if (existingIndex >= 0) {
          valuesCell.set(
            currentValues.toSpliced(existingIndex, 1, {
              dimensionName,
              value: categoryValue,
            })
          );
        } else {
          valuesCell.set([
            ...currentValues,
            {
              dimensionName,
              value: categoryValue,
            }
          ]);
        }
      }
    );

    const changeNumericValue = handler<
      unknown,
      { option: Cell<RubricOption>, dimensionName: string, delta: number, min: number, max: number }
    >(
      (_, { option, dimensionName, delta, min, max }) => {
        const valuesCell = option.key("values");
        const currentValues = valuesCell.get();
        const existingIndex = currentValues.findIndex(
          (v: OptionValue) => v.dimensionName === dimensionName
        );

        const currentValue = existingIndex >= 0 ? (currentValues[existingIndex].value as number) : min;
        const newValue = Math.max(min, Math.min(max, currentValue + delta));

        if (existingIndex >= 0) {
          valuesCell.set(
            currentValues.toSpliced(existingIndex, 1, {
              dimensionName,
              value: newValue,
            })
          );
        } else {
          valuesCell.set([
            ...currentValues,
            {
              dimensionName,
              value: newValue,
            }
          ]);
        }
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
      [NAME]: "Smart Rubric (Phase 2)",
      [UI]: (
        <ct-vstack gap="2" style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
          {/* Header */}
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.5rem 0" }}>Smart Rubric - Phase 2</h2>
            <ct-input $value={title} placeholder="Rubric Title" style="width: 100%;" />
          </div>

          {/* Test Controls */}
          <ct-hstack gap="1" style="margin-bottom: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
            <ct-button onClick={addTestOption({ options })}>+ Add Test Option</ct-button>
            <ct-button onClick={addTestDimension({ dimensions })}>+ Add Test Dimension</ct-button>
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
                    ({ option, dims }) => {
                      let totalScore = 0;
                      dims.forEach(dim => {
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
                  );

                  const isSelected = derive(selectedOptionName, (selected) => selected === option.name);

                  return (
                    <div
                      onClick={selectOption({ optionName: option.name })}
                      style={{
                        padding: "0.75rem",
                        border: derive(isSelected, (sel) => sel ? "2px solid #007bff" : "1px solid #ddd"),
                        borderRadius: "4px",
                        background: derive(isSelected, (sel) => sel ? "#e7f3ff" : "white"),
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "bold" }}>
                          {index + 1}. {option.name}
                        </span>
                        <span style={{
                          fontSize: "1.2em",
                          fontWeight: "bold",
                          color: "#007bff",
                        }}>
                          {derive(score, (s) => s.toFixed(1))}
                        </span>
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
                { selectedCell: selectedOptionCell, dims: dimensions },
                ({ selectedCell, dims }) => {
                  if (!selectedCell) {
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
                  const selectedData = selectedCell.get();

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
                                        <button
                                          onClick={changeCategoricalValue({
                                            option: selectedCell,
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
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>
                                      No categories defined
                                    </div>
                                  )
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <button
                                      onClick={changeNumericValue({
                                        option: selectedCell,
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
                                    </button>

                                    <span style={{
                                      flex: 1,
                                      textAlign: "center",
                                      fontSize: "1.1em",
                                      fontWeight: "bold",
                                    }}>
                                      {currentValue || dim.numericMin}
                                    </span>

                                    <button
                                      onClick={changeNumericValue({
                                        option: selectedCell,
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
                                    </button>

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
                selectedOption: selectedOptionName,
              }, null, 2)}
            </pre>
          </details>
        </ct-vstack>
      ),
      title,
      options,
      dimensions,
      selectedOptionName,
    };
  }
);
