/// <cts-enable />
import {
  Cell,
  computed,
  Default,
  handler,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";

// Import types from food-recipe (these should match exactly)
interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

interface RecipeStep {
  description: string;
}

interface StepGroup {
  id: string;
  name: string;
  nightsBeforeServing?: number;
  minutesBeforeServing?: number;
  duration?: number;
  maxWaitMinutes?: number;
  requiresOven?: {
    temperature: number;
    duration: number;
    racksNeeded?: {
      heightSlots: number;
      width: "full" | "half";
    };
  };
  steps: RecipeStep[];
}

// Viewer-specific completion tracking types
interface StepCompletion {
  groupId: string;
  stepIndex: number;
  completed: boolean;
}

interface GroupCompletion {
  groupId: string;
  completed: boolean;
}

interface ViewerInput {
  // Recipe data passed in as cells from the source recipe
  recipeName: Default<string, "">;
  recipeServings: Default<number, 4>;
  recipeIngredients: Default<Ingredient[], []>;
  recipeStepGroups: Default<StepGroup[], []>;

  // Completion tracking (not linked to source)
  completedSteps: Default<StepCompletion[], []>;
  completedGroups: Default<GroupCompletion[], []>;
}

/** Recipe viewer with step tracking. #recipeViewer */
interface ViewerOutput extends ViewerInput {}

// Handler to toggle step completion
const toggleStepCompletion = handler<
  Record<string, never>,
  {
    completedSteps: Cell<StepCompletion[]>;
    groupId: string;
    stepIndex: number;
  }
>((_event, { completedSteps, groupId, stepIndex }) => {
  const steps = completedSteps.get();
  const existingIndex = steps.findIndex(
    (s) => s.groupId === groupId && s.stepIndex === stepIndex
  );

  if (existingIndex >= 0) {
    // Remove completion
    completedSteps.set(steps.filter((_, idx) => idx !== existingIndex));
  } else {
    // Add completion
    completedSteps.push({ groupId, stepIndex, completed: true });
  }
});

// Handler to toggle group completion (completes/uncompletes all steps in group)
const toggleGroupCompletion = handler<
  Record<string, never>,
  {
    completedSteps: Cell<StepCompletion[]>;
    completedGroups: Cell<GroupCompletion[]>;
    groupId: string;
    group: StepGroup;
  }
>((_event, { completedSteps, completedGroups, groupId, group }) => {
  const groups = completedGroups.get();
  const steps = completedSteps.get();
  const existingGroupIndex = groups.findIndex((g) => g.groupId === groupId);

  if (existingGroupIndex >= 0) {
    // Uncheck group and all its steps
    completedGroups.set(groups.filter((_, idx) => idx !== existingGroupIndex));
    completedSteps.set(
      steps.filter((s) => s.groupId !== groupId)
    );
  } else {
    // Check group and all its steps
    completedGroups.push({ groupId, completed: true });

    // Add all steps in this group
    group.steps.forEach((_, stepIndex) => {
      const stepExists = steps.find(
        (s) => s.groupId === groupId && s.stepIndex === stepIndex
      );
      if (!stepExists) {
        completedSteps.push({ groupId, stepIndex, completed: true });
      }
    });
  }
});

export default pattern<ViewerInput, ViewerOutput>(
  ({ recipeName, recipeServings, recipeIngredients, recipeStepGroups, completedSteps, completedGroups }) => {
    // Recipe data is passed in directly as cells from the source recipe

    const displayName = computed(() =>
      recipeName.trim() || "Untitled Recipe"
    );

    // Helper to check if a step is completed
    const isStepCompleted = (groupId: string, stepIndex: number) => {
      return computed(() =>
        completedSteps.some((s) => s.groupId === groupId && s.stepIndex === stepIndex)
      );
    };

    // Helper to check if a group is completed
    const isGroupCompleted = (groupId: string) => {
      return computed(() =>
        completedGroups.some((g) => g.groupId === groupId)
      );
    };

    // Format timing display
    const formatTiming = (group: StepGroup) => {
      if (group.nightsBeforeServing !== undefined && group.nightsBeforeServing > 0) {
        return `${group.nightsBeforeServing} night(s) before serving`;
      } else if (group.minutesBeforeServing !== undefined) {
        if (group.minutesBeforeServing === 0) return "Serve immediately";
        const hours = Math.floor(group.minutesBeforeServing / 60);
        const mins = group.minutesBeforeServing % 60;
        if (hours > 0 && mins > 0) return `${hours}h ${mins}m before serving`;
        if (hours > 0) return `${hours}h before serving`;
        return `${mins}m before serving`;
      }
      return "No timing specified";
    };

    return {
      [NAME]: str`👨‍🍳 ${displayName} - Cooking View`,
      [UI]: (
        <ct-vstack gap={1} style="padding: 12px; max-width: 800px;">
          {/* Header with navigation */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h1 style={{ margin: "0", fontSize: "20px" }}>
              👨‍🍳 {displayName}
            </h1>
          </div>

          <p style={{ margin: "4px 0", fontSize: "14px", color: "#666" }}>
            Cooking view for {recipeServings} servings
          </p>

          {/* Ingredients Section (Read-only) */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>
                Ingredients
              </h3>
              <ct-vstack gap={0}>
                {computed(() =>
                  recipeIngredients.length > 0
                    ? recipeIngredients.map((ing) => (
                        <div
                          style={{
                            padding: "6px 0",
                            fontSize: "14px",
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          <span style={{ fontWeight: "500" }}>
                            {ing.amount} {ing.unit}
                          </span>{" "}
                          {ing.item}
                        </div>
                      ))
                    : (
                        <p
                          style={{
                            margin: "8px 0",
                            fontSize: "14px",
                            color: "#999",
                            fontStyle: "italic",
                          }}
                        >
                          No ingredients
                        </p>
                      )
                )}
              </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Step Groups Section with Completion Tracking */}
          <ct-vstack gap={2}>
            {computed(() =>
              recipeStepGroups.length > 0
                ? recipeStepGroups.map((group) => {
                    const groupCompleted = isGroupCompleted(group.id);

                    return (
                      <ct-card>
                        <ct-vstack gap={1}>
                          {/* Group header with checkbox */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "12px",
                              paddingBottom: "8px",
                              borderBottom: "2px solid #e5e7eb",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={groupCompleted}
                              onClick={toggleGroupCompletion({
                                completedSteps,
                                completedGroups,
                                groupId: group.id,
                                group,
                              })}
                              style={{
                                width: "20px",
                                height: "20px",
                                cursor: "pointer",
                                marginTop: "2px",
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <h4
                                style={{
                                  margin: "0 0 4px 0",
                                  fontSize: "16px",
                                  fontWeight: "600",
                                }}
                              >
                                {group.name}
                              </h4>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "16px",
                                  fontSize: "13px",
                                  color: "#666",
                                }}
                              >
                                <span>⏱️ {formatTiming(group)}</span>
                                {group.duration && (
                                  <span>📏 {group.duration} min duration</span>
                                )}
                                {group.maxWaitMinutes !== undefined && group.maxWaitMinutes > 0 && (
                                  <span>
                                    ⏳ Can wait {group.maxWaitMinutes} min
                                  </span>
                                )}
                                {group.requiresOven && group.requiresOven.temperature > 0 && (
                                  <span>
                                    🔥 {group.requiresOven.temperature}°F for{" "}
                                    {group.requiresOven.duration} min
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Steps with individual checkboxes */}
                          <ct-vstack gap={0}>
                            {group.steps.map((step, stepIndex) => {
                              const stepCompleted = isStepCompleted(
                                group.id,
                                stepIndex
                              );

                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "12px",
                                    padding: "8px 0",
                                    borderBottom: "1px solid #f0f0f0",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={stepCompleted}
                                    onClick={toggleStepCompletion({
                                      completedSteps,
                                      groupId: group.id,
                                      stepIndex,
                                    })}
                                    style={{
                                      width: "18px",
                                      height: "18px",
                                      cursor: "pointer",
                                      marginTop: "2px",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontWeight: "bold",
                                      color: "#999",
                                      minWidth: "24px",
                                    }}
                                  >
                                    {stepIndex + 1}.
                                  </span>
                                  <span
                                    style={{
                                      flex: 1,
                                      fontSize: "14px",
                                      lineHeight: "1.5",
                                      textDecoration: computed(() =>
                                        stepCompleted
                                          ? "line-through"
                                          : "none"
                                      ),
                                      opacity: computed(() =>
                                        stepCompleted ? "0.6" : "1"
                                      ),
                                    }}
                                  >
                                    {step.description}
                                  </span>
                                </div>
                              );
                            })}
                          </ct-vstack>
                        </ct-vstack>
                      </ct-card>
                    );
                  })
                : (
                    <ct-card>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "14px",
                          color: "#999",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        No step groups in this recipe
                      </p>
                    </ct-card>
                  )
            )}
          </ct-vstack>
        </ct-vstack>
      ),
      recipeName,
      recipeServings,
      recipeIngredients,
      recipeStepGroups,
      completedSteps,
      completedGroups,
    };
  }
);
