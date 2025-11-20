/// <cts-enable />
import {
  Cell,
  cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  OpaqueRef,
  pattern,
  str,
  UI,
} from "commontools";

interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

interface RecipeStep {
  order: number;
  description: string;
  duration?: number;
}

interface RecipeViewerInput {
  name: Default<string, "">;
  servings: Default<number, 4>;
  prepTime: Default<number, 0>;
  cookTime: Default<number, 0>;
  ingredients: Default<Ingredient[], []>;
  steps: Default<RecipeStep[], []>;
  notes: Default<string, "">;
}

interface RecipeViewerOutput {}

const toggleStepCompletion = handler<
  unknown,
  { completedSteps: Cell<number[]>; step: Cell<RecipeStep> }
>(
  (_, { completedSteps, step }) => {
    const stepOrder = step.get().order;
    const current = completedSteps.get();
    const index = current.indexOf(stepOrder);
    if (index >= 0) {
      completedSteps.set(current.filter(n => n !== stepOrder));
    } else {
      completedSteps.set([...current, stepOrder]);
    }
  },
);

export default pattern<RecipeViewerInput, RecipeViewerOutput>(
  ({ name, servings, prepTime, cookTime, ingredients, steps, notes }) => {
    const completedSteps: Cell<number[]> = cell<number[]>([]);

    const displayName = derive(name, (n) => n.trim() || "Untitled Recipe");
    const totalTime = derive([prepTime, cookTime], ([prep, cook]) => prep + cook);
    const stepCount = derive(steps, (list) => list.length);
    const hasIngredients = derive(ingredients, (list) => list.length > 0);
    const hasSteps = derive(stepCount, (count) => count > 0);
    const hasNotes = derive(notes, (n) => n && n.trim().length > 0);

    const completedStepsCount = derive(completedSteps, (list: number[]) => list.length);
    const progressPercent = derive(
      [stepCount, completedStepsCount],
      ([total, completed]) => total > 0 ? Math.round((completed / total) * 100) : 0
    );
    const progressWidth = derive(progressPercent, (p) => `${p}%`);

    return {
      [NAME]: str`👁️ ${displayName}`,
      [UI]: (
        <ct-vstack gap={2} style="padding: 12px; max-width: 800px;">
          <h1 style={{ margin: "0 0 12px 0", fontSize: "24px", fontWeight: "700" }}>
            {displayName}
          </h1>

          {/* Progress indicator */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px", fontWeight: "600" }}>Progress</h3>
                <div style={{ fontSize: "13px", fontWeight: "bold", color: "#2563eb" }}>
                  {completedStepsCount} / {stepCount} steps ({progressPercent}%)
                </div>
              </div>
              <div style={{ width: "100%", height: "8px", backgroundColor: "#e5e7eb", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "0",
                  top: "0",
                  width: progressWidth,
                  height: "100%",
                  backgroundColor: "#2563eb",
                  transition: "width 0.3s ease"
                }}></div>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Recipe info */}
          <ct-card>
            <ct-vstack gap={2} style="padding: 12px;">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", fontSize: "13px" }}>
                <div>
                  <div style={{ color: "#666", marginBottom: "2px", fontSize: "12px" }}>Servings</div>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>{servings}</div>
                </div>
                <div>
                  <div style={{ color: "#666", marginBottom: "2px", fontSize: "12px" }}>Prep</div>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>{prepTime} min</div>
                </div>
                <div>
                  <div style={{ color: "#666", marginBottom: "2px", fontSize: "12px" }}>Cook</div>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>{cookTime} min</div>
                </div>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Ingredients */}
          {ifElse(
            hasIngredients,
            <ct-card>
              <ct-vstack gap={2} style="padding: 12px;">
                <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "600" }}>Ingredients</h3>
                <ct-vstack gap={2}>
                  {ingredients.map((ingredient: OpaqueRef<Ingredient>) => (
                    <div style={{ fontSize: "15px", lineHeight: "1.8", padding: "4px 0" }}>
                      <strong>{ingredient.amount} {ingredient.unit}</strong> {ingredient.item}
                    </div>
                  ))}
                </ct-vstack>
              </ct-vstack>
            </ct-card>,
            <div />
          )}

          {/* Instructions with checkboxes */}
          {ifElse(
            hasSteps,
            <ct-card>
              <ct-vstack gap={2} style="padding: 12px;">
                <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: "600" }}>Instructions</h3>
                <ct-vstack gap={2}>
                  {steps.map((step: OpaqueRef<RecipeStep>) => {
                    const isCompleted = derive(
                      completedSteps,
                      (list: number[]) => list.includes(step.order)
                    );
                    return (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          padding: "14px",
                          border: "2px solid",
                          borderRadius: "8px",
                          backgroundColor: derive(isCompleted, (c) => c ? "#f0fdf4" : "#ffffff"),
                          borderColor: derive(isCompleted, (c) => c ? "#22c55e" : "#e5e7eb")
                        }}
                      >
                        <ct-checkbox
                          $checked={cell(derive(isCompleted, (c) => c))}
                          onClick={toggleStepCompletion({ completedSteps, step })}
                          style={{ flexShrink: "0", marginTop: "2px" }}
                        />
                        <div style={{ flex: "1" }}>
                          <div style={{
                            fontSize: "15px",
                            lineHeight: "1.6",
                            textDecoration: derive(isCompleted, (c) => c ? "line-through" : "none"),
                            color: derive(isCompleted, (c) => c ? "#6b7280" : "#111827")
                          }}>
                            <strong>{step.order}.</strong> {step.description}
                          </div>
                          {ifElse(
                            derive(step.duration, (d) => d && d > 0),
                            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                              ⏱️ {step.duration} minutes
                            </div>,
                            <div />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </ct-vstack>
              </ct-vstack>
            </ct-card>,
            <div />
          )}

          {/* Notes if present */}
          {ifElse(
            hasNotes,
            <ct-card>
              <ct-vstack gap={2} style="padding: 12px;">
                <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "600" }}>Notes</h3>
                <div style={{ fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", color: "#374151" }}>
                  {notes}
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}
        </ct-vstack>
      ),
    };
  },
);
