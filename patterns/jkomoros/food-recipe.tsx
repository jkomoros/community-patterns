/// <cts-enable />
/**
 * PDF UPLOAD SUPPORT - Investigation Results (2025-11-23)
 *
 * Goal: Test if Claude vision API can extract recipes from PDF data URLs
 *
 * Current Status: BLOCKED - Unable to test due to build system issues
 *
 * What we learned:
 * 1. ct-image-input currently only accepts images (accept="image/*")
 * 2. Event handling was initially wrong:
 *    - ct-image-input fires: ct-change event with {images: ImageData[]}
 *    - Pattern was listening for: onct-upload with {text: string}
 *    - Fixed in handleImageUpload handler (lines 454-469)
 * 3. To support PDFs, ct-image-input would need:
 *    - accept="image/*,application/pdf" attribute
 *    - _processFile method updated to skip Image() validation for PDFs
 *    - Already has type field in ImageData interface to distinguish file types
 * 4. Build system challenge:
 *    - ct-image-input is in labs/packages/ui
 *    - Component changes require running: deno task bundle
 *    - Bundle task failed with missing 'source-map-support' dependency
 *    - Even after clearing caches and restarting dev servers, old component persisted
 * 5. Browser caching was extremely aggressive:
 *    - Hard refreshes, cache clearing, new browser contexts all failed
 *    - Component templates appear to be cached separately from JavaScript bundles
 *
 * Next steps to continue investigation:
 * 1. Fix labs UI bundle task dependency issue
 * 2. Successfully bundle updated ct-image-input with PDF support
 * 3. Verify component loads with updated accept attribute
 * 4. Upload PDF and test if Claude vision API can extract text from PDF data URLs
 * 5. If successful, consider PR to labs repo for ct-image-input PDF support
 *
 * Alternative approach:
 * - Use separate PDF library to extract text from PDF before sending to Claude
 * - Avoid relying on vision API's native PDF support (if it exists)
 */
import {
  cell,
  Cell,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  NAME,
  navigateTo,
  type Opaque,
  OpaqueRef,
  patternTool,
  pattern,
  str,
  UI,
  wish,
} from "commontools";
import { type MentionableCharm } from "./lib/backlinks-index.tsx";
import { compareFields, computeWordDiff } from "./utils/diff-utils.ts";
import RecipeAnalyzer from "./recipe-analyzer.tsx";
import FoodRecipeViewer from "./food-recipe-viewer.tsx";

// Predefined units for ingredients
const UNITS = [
  "tsp",
  "tbsp",
  "cup",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "pinch",
  "to taste",
] as const;

const UNIT_ITEMS = UNITS.map((unit) => ({
  label: unit,
  value: unit,
}));

interface Ingredient {
  item: string;
  amount: string;
  unit: string;
}

interface RecipeStep {
  description: string;
}

interface ImageData {
  id: string;
  name: string;
  url: string;
  data: string;
  timestamp: number;
  width?: number;
  height?: number;
  size: number;
  type: string;
}

interface StepGroup {
  id: string;
  name: string;
  nightsBeforeServing?: number;
  minutesBeforeServing?: number;
  duration?: number; // minutes
  maxWaitMinutes?: number;
  requiresOven?: {
    temperature: number;
    duration: number;
    racksNeeded?: {
      heightSlots: number; // 1 for cookie sheet, 2 for casserole, 5 for turkey, etc.
      width: "full" | "half"; // full rack width or half rack
    };
  };
  steps: RecipeStep[];
}

interface RecipeInput {
  name: Default<string, "">;
  cuisine: Default<string, "">;
  servings: Default<number, 4>;
  yield: Default<string, "">; // What the recipe makes (e.g., "12 cookies", "1 loaf")
  difficulty: Default<"easy" | "medium" | "hard", "medium">;
  prepTime: Default<number, 0>; // minutes
  cookTime: Default<number, 0>; // minutes
  restTime: Default<number, 0>; // Minutes to rest after cooking before serving
  holdTime: Default<number, 0>; // Minutes dish can wait while maintaining quality
  category: Default<"appetizer" | "main" | "side" | "starch" | "vegetable" | "dessert" | "bread" | "other", "other">;
  ingredients: Default<Ingredient[], []>;
  stepGroups: Default<StepGroup[], []>;
  tags: Default<string[], []>;
  notes: Default<string, "">;
  source: Default<string, "">;
}

interface RecipeOutput extends RecipeInput {
  // Derived for meal planning
  ovenRequirements: {
    needsOven: boolean;
    temps: number[]; // All unique oven temps needed
    tempChanges: boolean; // Whether temp changes during cooking
  };
  // Dietary compatibility analysis
  dietaryCompatibility: {
    compatible: string[];
    incompatible: string[];
    warnings: string[];
    primaryIngredients: string[];
  };
}

// Handler for charm link clicks
const handleCharmLinkClick = handler<
  {
    detail: {
      charm: Cell<MentionableCharm>;
    };
  },
  Record<string, never>
>(({ detail }, _) => {
  return navigateTo(detail.charm);
});

// Handler for new backlinks
const handleNewBacklink = handler<
  {
    detail: {
      text: string;
      charmId: any;
      charm: Cell<MentionableCharm>;
      navigate: boolean;
    };
  },
  {
    mentionable: Cell<MentionableCharm[]>;
  }
>(({ detail }, { mentionable }) => {
  console.log("new charm", detail.text, detail.charmId);

  if (detail.navigate) {
    return navigateTo(detail.charm);
  } else {
    mentionable.push(detail.charm as unknown as MentionableCharm);
  }
});

// Helper function to create schemaified wish
function schemaifyWish<T>(path: string, def: T) {
  return derive(wish<T>(path) as T, (i) => i ?? def);
}

// Ingredient handlers
const addIngredient = handler<unknown, { ingredients: Cell<Ingredient[]> }>(
  (_event, { ingredients }) => {
    ingredients.push({
      item: "",
      amount: "",
      unit: "cup",
    });
  },
);

const removeIngredient = handler<
  unknown,
  {
    ingredients: Cell<Array<Cell<Ingredient>>>;
    ingredient: Cell<Ingredient>;
  }
>((_event, { ingredients, ingredient }) => {
  const currentIngredients = ingredients.get();
  const index = currentIngredients.findIndex((el) => ingredient.equals(el));
  if (index >= 0) {
    ingredients.set(currentIngredients.toSpliced(index, 1));
  }
});

// Step Group handlers
const addStepGroup = handler<unknown, { stepGroups: Cell<StepGroup[]> }>(
  (_event, { stepGroups }) => {
    stepGroups.push({
      id: `group-${Date.now()}`,
      name: "New Step Group",
      minutesBeforeServing: 0,
      duration: 0,
      maxWaitMinutes: 0,
      requiresOven: {
        temperature: 0,
        duration: 0,
        racksNeeded: {
          heightSlots: 1,
          width: "full",
        },
      },
      steps: [],
    });
  },
);

const removeStepGroup = handler<
  unknown,
  {
    stepGroups: Cell<Array<Cell<StepGroup>>>;
    stepGroup: Cell<StepGroup>;
  }
>((_event, { stepGroups, stepGroup }) => {
  const currentGroups = stepGroups.get();
  const index = currentGroups.findIndex((el) => stepGroup.equals(el));
  if (index >= 0) {
    stepGroups.set(currentGroups.toSpliced(index, 1));
  }
});

const moveGroupUp = handler<
  unknown,
  {
    stepGroups: Cell<Array<Cell<StepGroup>>>;
    stepGroup: Cell<StepGroup>;
  }
>((_event, { stepGroups, stepGroup }) => {
  const currentGroups = stepGroups.get();
  const index = currentGroups.findIndex((el) => stepGroup.equals(el));
  if (index <= 0) return; // Can't move first group up

  // Swap with previous group
  const newGroups = [...currentGroups];
  [newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]];
  stepGroups.set(newGroups);
});

const moveGroupDown = handler<
  unknown,
  {
    stepGroups: Cell<Array<Cell<StepGroup>>>;
    stepGroup: Cell<StepGroup>;
  }
>((_event, { stepGroups, stepGroup }) => {
  const currentGroups = stepGroups.get();
  const index = currentGroups.findIndex((el) => stepGroup.equals(el));
  if (index < 0 || index >= currentGroups.length - 1) return; // Can't move last group down

  // Swap with next group
  const newGroups = [...currentGroups];
  [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]];
  stepGroups.set(newGroups);
});

const addStepToGroup = handler<
  unknown,
  { stepGroup: Cell<StepGroup> }
>((_event, { stepGroup }) => {
  const group = stepGroup.get();
  stepGroup.set({
    ...group,
    steps: [...group.steps, { description: "" }],
  });
});

const removeStepFromGroup = handler<
  unknown,
  {
    stepGroup: Cell<StepGroup>;
    stepIndex: number;
  }
>((_event, { stepGroup, stepIndex }) => {
  const group = stepGroup.get();
  stepGroup.set({
    ...group,
    steps: group.steps.filter((_, idx) => idx !== stepIndex),
  });
});

const moveStepUp = handler<
  unknown,
  {
    stepGroup: Cell<StepGroup>;
    stepIndex: number;
  }
>((_event, { stepGroup, stepIndex }) => {
  if (stepIndex === 0) return; // Can't move first step up
  const group = stepGroup.get();
  const steps = [...group.steps];
  // Swap with previous step
  [steps[stepIndex - 1], steps[stepIndex]] = [steps[stepIndex], steps[stepIndex - 1]];
  stepGroup.set({
    ...group,
    steps,
  });
});

const moveStepDown = handler<
  unknown,
  {
    stepGroup: Cell<StepGroup>;
    stepIndex: number;
  }
>((_event, { stepGroup, stepIndex }) => {
  const group = stepGroup.get();
  if (stepIndex >= group.steps.length - 1) return; // Can't move last step down
  const steps = [...group.steps];
  // Swap with next step
  [steps[stepIndex], steps[stepIndex + 1]] = [steps[stepIndex + 1], steps[stepIndex]];
  stepGroup.set({
    ...group,
    steps,
  });
});

// Oven requirements update handler
const updateOvenTemp = handler<
  { detail: { value: string } },
  { stepGroup: Cell<StepGroup> }
>(({ detail }, { stepGroup }) => {
  const group = stepGroup.get();
  const temp = detail.value ? parseInt(detail.value, 10) : 0;
  stepGroup.set({
    ...group,
    requiresOven: {
      temperature: temp,
      duration: group.requiresOven?.duration ?? 0,
      racksNeeded: group.requiresOven?.racksNeeded ?? { heightSlots: 1, width: "full" },
    },
  });
});

const updateOvenDuration = handler<
  { detail: { value: string } },
  { stepGroup: Cell<StepGroup> }
>(({ detail }, { stepGroup }) => {
  const group = stepGroup.get();
  const duration = detail.value ? parseInt(detail.value, 10) : 0;
  stepGroup.set({
    ...group,
    requiresOven: {
      temperature: group.requiresOven?.temperature ?? 0,
      duration,
      racksNeeded: group.requiresOven?.racksNeeded ?? { heightSlots: 1, width: "full" },
    },
  });
});

const updateOvenHeightSlots = handler<
  { detail: { value: string } },
  { stepGroup: Cell<StepGroup> }
>(({ detail }, { stepGroup }) => {
  const group = stepGroup.get();
  const heightSlots = detail.value ? parseInt(detail.value, 10) : 1;
  stepGroup.set({
    ...group,
    requiresOven: {
      temperature: group.requiresOven?.temperature ?? 0,
      duration: group.requiresOven?.duration ?? 0,
      racksNeeded: {
        heightSlots,
        width: group.requiresOven?.racksNeeded?.width ?? "full",
      },
    },
  });
});

const updateOvenRackWidth = handler<
  { detail: { value: string } },
  { stepGroup: Cell<StepGroup> }
>(({ detail }, { stepGroup }) => {
  const group = stepGroup.get();
  const width = detail.value as "full" | "half" || "full";
  stepGroup.set({
    ...group,
    requiresOven: {
      temperature: group.requiresOven?.temperature ?? 0,
      duration: group.requiresOven?.duration ?? 0,
      racksNeeded: {
        heightSlots: group.requiresOven?.racksNeeded?.heightSlots ?? 1,
        width,
      },
    },
  });
});

// Tag handlers
const addTag = handler<
  { detail: { message: string } },
  { tags: Cell<string[]> }
>(({ detail }, { tags }) => {
  const tagName = detail?.message?.trim();
  if (!tagName) return;

  const currentTags = tags.get();
  if (!currentTags.includes(tagName)) {
    tags.push(tagName);
  }
});

const removeTag = handler<
  unknown,
  { tags: Cell<Array<Cell<string>>>; tag: Cell<string> }
>((_event, { tags, tag }) => {
  const currentTags = tags.get();
  const index = currentTags.findIndex((el) => tag.equals(el));
  if (index >= 0) {
    tags.set(currentTags.toSpliced(index, 1));
  }
});

// Scaling handlers
const scaleRecipe = handler<
  unknown,
  {
    servings: Cell<number>;
    ingredients: Cell<Array<Cell<Ingredient>>>;
    scaleFactor: number;
  }
>((_event, { servings, ingredients, scaleFactor }) => {
  // Scale servings
  const currentServings = servings.get();
  servings.set(Math.round(currentServings * scaleFactor));

  // Scale ingredient amounts
  const currentIngredients = ingredients.get();
  currentIngredients.forEach((ingredient) => {
    const ing = ingredient.get();
    const amount = ing.amount;

    // Try to parse and scale numeric amounts
    const numMatch = amount.match(/^(\d+\.?\d*)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      const scaled = num * scaleFactor;
      const rest = amount.substring(numMatch[0].length);

      // Format nicely (e.g., 0.5 -> 1/2)
      let scaledStr: string;
      if (scaled === 0.25) scaledStr = "1/4";
      else if (scaled === 0.33 || scaled === 0.333) scaledStr = "1/3";
      else if (scaled === 0.5) scaledStr = "1/2";
      else if (scaled === 0.66 || scaled === 0.667) scaledStr = "2/3";
      else if (scaled === 0.75) scaledStr = "3/4";
      else if (scaled % 1 === 0) scaledStr = String(Math.round(scaled));
      else scaledStr = scaled.toFixed(2);

      ingredient.set({ ...ing, amount: scaledStr + rest });
    }
  });
});

// Image Upload Handler
const handleImageUpload = handler<
  { detail: { images: ImageData[] } },
  { notes: Cell<string> }
>(({ detail }, { notes }) => {
  if (!detail.images || detail.images.length === 0) return;

  // Get the most recently uploaded image's data URL
  const mostRecentImage = detail.images[detail.images.length - 1];
  const dataUrl = mostRecentImage.data;

  const currentNotes = notes.get();
  const newNotes = currentNotes
    ? `${currentNotes}\n\n---\n\n${dataUrl}`
    : dataUrl;
  notes.set(newNotes);
});

// LLM Extraction Handlers
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Cell<string> }
>(
  (_, { notes, extractTrigger }) => {
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

const cancelExtraction = handler<
  Record<string, never>,
  { extractedData: Cell<any> }
>(
  (_, { extractedData }) => {
    extractedData.set(null);
  },
);

const applyExtractedData = handler<
  Record<string, never>,
  {
    extractedData: Cell<any>;
    name: Cell<string>;
    cuisine: Cell<string>;
    servings: Cell<number>;
    difficulty: Cell<"easy" | "medium" | "hard">;
    prepTime: Cell<number>;
    cookTime: Cell<number>;
    restTime: Cell<number>;
    holdTime: Cell<number>;
    category: Cell<"appetizer" | "main" | "side" | "starch" | "vegetable" | "dessert" | "bread" | "other">;
    ingredients: Cell<Ingredient[]>;
    stepGroups: Cell<StepGroup[]>;
    tags: Cell<string[]>;
    source: Cell<string>;
    notes: Cell<string>;
  }
>(
  (
    _,
    {
      extractedData,
      name,
      cuisine,
      servings,
      difficulty,
      prepTime,
      cookTime,
      restTime,
      holdTime,
      category,
      ingredients,
      stepGroups,
      tags,
      source,
      notes,
    },
  ) => {
    const data = extractedData.get();
    if (!data) return;

    if (data.name) name.set(data.name);
    if (data.cuisine) cuisine.set(data.cuisine);
    if (data.servings) servings.set(data.servings);
    if (data.difficulty) difficulty.set(data.difficulty);
    if (data.prepTime) prepTime.set(data.prepTime);
    if (data.cookTime) cookTime.set(data.cookTime);
    if (data.restTime) restTime.set(data.restTime);
    if (data.holdTime) holdTime.set(data.holdTime);
    if (data.category) category.set(data.category);
    if (data.source) source.set(data.source);

    // Apply ingredients - use .push() which auto-wraps in cells
    if (data.ingredients && Array.isArray(data.ingredients)) {
      data.ingredients.forEach((ing: any) => {
        ingredients.push({
          item: ing.item || "",
          amount: ing.amount || "",
          unit: ing.unit || "cup",
        });
      });
    }

    // Apply step groups - use .push() which auto-wraps in cells
    if (data.stepGroups && Array.isArray(data.stepGroups)) {
      data.stepGroups.forEach((group: any) => {
        stepGroups.push({
          id: group.id || `group-${Date.now()}-${Math.random()}`,
          name: group.name || "Step Group",
          nightsBeforeServing: group.nightsBeforeServing,
          minutesBeforeServing: group.minutesBeforeServing,
          duration: group.duration,
          maxWaitMinutes: group.maxWaitMinutes,
          requiresOven: group.requiresOven,
          steps: group.steps || [],
        });
      });
    }

    // Apply tags - use .push() which auto-wraps in cells
    if (data.tags && Array.isArray(data.tags)) {
      const currentTags = tags.get();
      data.tags.forEach((tag: string) => {
        if (!currentTags.includes(tag)) {
          tags.push(tag);
        }
      });
    }

    // Update notes with remaining content after extraction
    if (data.remainingNotes !== undefined) {
      notes.set(data.remainingNotes);
    }

    // Clear extraction result
    extractedData.set(null);
  },
);

// LLM Timing Suggestion Handlers
const triggerTimingSuggestion = handler<
  Record<string, never>,
  { stepGroups: Cell<Array<Cell<StepGroup>>>; timingSuggestionTrigger: Cell<string> }
>(
  (_, { stepGroups, timingSuggestionTrigger }) => {
    // Unwrap cells before serializing
    const groups = stepGroups.get().map(g => g.get ? g.get() : g);
    timingSuggestionTrigger.set(`${JSON.stringify(groups)}\n---TIMING-${Date.now()}---`);
  },
);

const applyTimingSuggestions = handler<
  Record<string, never>,
  {
    timingSuggestions: Cell<any>;
    stepGroups: Cell<Array<Cell<StepGroup>>>;
  }
>(
  (_, { timingSuggestions, stepGroups }) => {
    const suggestions = timingSuggestions.get();
    if (!suggestions || !Array.isArray(suggestions.stepGroups)) return;

    const currentGroups = stepGroups.get();

    // Match suggestions to existing groups by ID
    suggestions.stepGroups.forEach((suggestion: any) => {
      const groupIndex = currentGroups.findIndex(g => {
        const groupData = (g.get ? g.get() : g) as StepGroup;
        return groupData.id === suggestion.id;
      });

      if (groupIndex >= 0) {
        const group = currentGroups[groupIndex];
        const groupData = (group.get ? group.get() : group) as StepGroup;

        // Apply timing suggestions
        if ((group as any).set) {
          (group as any).set({
            ...groupData,
            nightsBeforeServing: suggestion.nightsBeforeServing,
            minutesBeforeServing: suggestion.minutesBeforeServing,
            duration: suggestion.duration ?? groupData.duration,
            requiresOven: suggestion.requiresOven ?? groupData.requiresOven,
          });
        }
      }
    });

    // Clear suggestions
    timingSuggestions.set(null);
  },
);

// LLM Wait Time Suggestion Handlers
const triggerWaitTimeSuggestion = handler<
  Record<string, never>,
  { stepGroups: Cell<Array<Cell<StepGroup>>>; waitTimeSuggestionTrigger: Cell<string> }
>(
  (_, { stepGroups, waitTimeSuggestionTrigger }) => {
    // Unwrap cells before serializing
    const groups = stepGroups.get().map(g => g.get ? g.get() : g);
    waitTimeSuggestionTrigger.set(`${JSON.stringify(groups)}\n---WAIT-${Date.now()}---`);
  },
);

// Create Cooking View Handler
const createCookingView = handler<
  Record<string, never>,
  {
    name: Cell<string>;
    servings: Cell<number>;
    ingredients: Cell<Ingredient[]>;
    stepGroups: Cell<StepGroup[]>;
  }
>((_event, { name, servings, ingredients, stepGroups }) => {
  // Unwrap cells before passing to viewer
  // Spread arrays to convert from readonly to mutable
  const viewer = FoodRecipeViewer({
    recipeName: name.get(),
    recipeServings: servings.get(),
    recipeIngredients: [...ingredients.get()],
    recipeStepGroups: [...stepGroups.get()],
    completedSteps: [],
    completedGroups: [],
  });
  return navigateTo(viewer);
});

const applyWaitTimeSuggestions = handler<
  Record<string, never>,
  {
    waitTimeSuggestions: Cell<any>;
    stepGroups: Cell<Array<Cell<StepGroup>>>;
  }
>(
  (_, { waitTimeSuggestions, stepGroups }) => {
    const suggestions = waitTimeSuggestions.get();
    if (!suggestions || !Array.isArray(suggestions.stepGroups)) return;

    const currentGroups = stepGroups.get();

    // Match suggestions to existing groups by ID
    suggestions.stepGroups.forEach((suggestion: any) => {
      const groupIndex = currentGroups.findIndex(g => {
        const groupData = (g.get ? g.get() : g) as StepGroup;
        return groupData.id === suggestion.id;
      });

      if (groupIndex >= 0) {
        const group = currentGroups[groupIndex];
        const groupData = (group.get ? group.get() : group) as StepGroup;

        // Apply wait time suggestion
        if ((group as any).set && suggestion.maxWaitMinutes !== undefined) {
          (group as any).set({
            ...groupData,
            maxWaitMinutes: suggestion.maxWaitMinutes,
          });
        }
      }
    });

    // Clear suggestions
    waitTimeSuggestions.set(null);
  },
);

export default pattern<RecipeInput, RecipeOutput>(
  ({
    name,
    cuisine,
    servings,
    yield: recipeYield,
    difficulty,
    prepTime,
    cookTime,
    restTime,
    holdTime,
    category,
    ingredients,
    stepGroups,
    tags,
    notes,
    source,
  }) => {
    // Set up mentionable charms for @ references
    const mentionable = schemaifyWish<MentionableCharm[]>(
      "#mentionable",
      [],
    );
    const mentioned = cell<MentionableCharm[]>([]);

    // Computed values
    const totalTime = derive(
      [prepTime, cookTime, restTime],
      ([prep, cook, rest]) => prep + cook + rest,
    );

    const ingredientCount = derive(ingredients, (list) => list.length);
    const stepGroupCount = derive(stepGroups, (list) => list.length);
    const hasIngredients = derive(ingredientCount, (count) => count > 0);
    const hasStepGroups = derive(stepGroupCount, (count) => count > 0);
    const hasTags = derive(tags, (list) => list.length > 0);

    const displayName = derive(
      name,
      (n) => n.trim() || "Untitled Recipe",
    );

    // Derive ingredient list text for copying
    const ingredientListText = derive(ingredients, (list) =>
      list.map((ing) => `${ing.amount} ${ing.unit} ${ing.item}`).join("\n"),
    );

    // Derive oven requirements for meal planning
    const ovenRequirements = derive(stepGroups, (groups) => {
      const temps: number[] = [];
      let needsOven = false;

      groups.forEach((group) => {
        if (group.requiresOven) {
          needsOven = true;
          const temp = group.requiresOven.temperature;
          if (!temps.includes(temp)) {
            temps.push(temp);
          }
        }
      });

      return {
        needsOven,
        temps: temps.sort((a, b) => a - b),
        tempChanges: temps.length > 1,
      };
    });

    // Dietary analysis
    const analyzer = RecipeAnalyzer({
      recipeName: name,
      ingredients,
      category,
      tags,
    });

    // LLM Extraction state
    const extractTrigger = cell<string>("");

    const { result: extractionResult, pending: extractionPending } =
      generateObject({
        system:
          `You are a recipe extraction assistant. Extract structured recipe information from unstructured text.

Extract the following fields if present:
- name: Recipe title
- cuisine: Type of cuisine (e.g., "Italian", "Thai", "Mexican")
- servings: Number of servings (as a number)
- difficulty: One of "easy", "medium", or "hard"
- prepTime: Preparation time in minutes (as a number)
- cookTime: Cooking time in minutes (as a number)
- restTime: Time to rest after cooking before serving in minutes (as a number)
- holdTime: Time dish can wait while maintaining quality in minutes (as a number)
- category: Type of dish - one of "appetizer", "main", "side", "starch", "vegetable", "dessert", "bread", or "other"
- source: Where the recipe came from (URL, book, person)
- ingredients: Array of objects with {item, amount, unit}. Parse amounts and units separately.
- stepGroups: Organize steps into logical groups based on timing:
  * Group similar prep/cooking phases together
  * Assign timing: use nightsBeforeServing (1, 2) for overnight tasks, minutesBeforeServing (e.g. 240, 60, 30, 0) for day-of timing
  * Each group should have ONE of nightsBeforeServing OR minutesBeforeServing, not both
  * Estimate duration for each group
  * Identify oven requirements (temperature, duration, and racksNeeded):
    - temperature: oven temp in Fahrenheit
    - duration: time in oven in minutes
    - racksNeeded.heightSlots: 1 for thin items (cookie sheet), 2 for medium (casserole), 5 for tall items (turkey)
    - racksNeeded.width: "full" for full rack width, "half" for half rack
  * Common group names: "Night Before", "Prep", "Cooking", "Finishing Touches"
  * Most recipes will have 2-5 groups
- tags: Array of relevant tags (e.g., ["vegetarian", "quick", "dessert"])
- remainingNotes: Any text from the notes that was NOT extracted into structured fields (e.g., personal comments, modifications, tips). If everything was extracted, return an empty string.

Return only the fields you can confidently extract. Be thorough with ingredients and step groups. For remainingNotes, preserve any content that doesn't fit into the structured fields.`,
        prompt: extractTrigger,
        model: "anthropic:claude-sonnet-4-5",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            cuisine: { type: "string" },
            servings: { type: "number" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            prepTime: { type: "number" },
            cookTime: { type: "number" },
            restTime: { type: "number" },
            holdTime: { type: "number" },
            category: { type: "string", enum: ["appetizer", "main", "side", "starch", "vegetable", "dessert", "bread", "other"] },
            source: { type: "string" },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  amount: { type: "string" },
                  unit: { type: "string" },
                },
              },
            },
            stepGroups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  nightsBeforeServing: { type: "number" },
                  minutesBeforeServing: { type: "number" },
                  duration: { type: "number" },
                  maxWaitMinutes: { type: "number" },
                  requiresOven: {
                    type: "object",
                    properties: {
                      temperature: { type: "number" },
                      duration: { type: "number" },
                      racksNeeded: {
                        type: "object",
                        properties: {
                          heightSlots: { type: "number" },
                          width: { type: "string", enum: ["full", "half"] },
                        },
                      },
                    },
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            remainingNotes: { type: "string" },
          },
        },
      });

    // Derive changes preview comparing extracted data to current values
    const changesPreview = derive(
      {
        extractionResult,
        name,
        cuisine,
        servings,
        difficulty,
        prepTime,
        cookTime,
        restTime,
        holdTime,
        category,
        source,
        notes,
      },
      ({
        extractionResult: result,
        name: currentName,
        cuisine: currentCuisine,
        servings: currentServings,
        difficulty: currentDifficulty,
        prepTime: currentPrepTime,
        cookTime: currentCookTime,
        restTime: currentRestTime,
        holdTime: currentHoldTime,
        category: currentCategory,
        source: currentSource,
        notes: currentNotes,
      }) => {
        return compareFields(result, {
          name: { current: currentName, label: "Recipe Name" },
          cuisine: { current: currentCuisine, label: "Cuisine" },
          servings: { current: String(currentServings), label: "Servings" },
          difficulty: { current: currentDifficulty, label: "Difficulty" },
          prepTime: { current: String(currentPrepTime), label: "Prep Time (min)" },
          cookTime: { current: String(currentCookTime), label: "Cook Time (min)" },
          restTime: { current: String(currentRestTime), label: "Rest Time (min)" },
          holdTime: { current: String(currentHoldTime), label: "Hold Time (min)" },
          category: { current: currentCategory, label: "Category" },
          source: { current: currentSource, label: "Source" },
          remainingNotes: { current: currentNotes, label: "Notes" },
        });
      },
    );

    const hasExtractionResult = derive(
      changesPreview,
      (changes) => changes.length > 0,
    );

    // LLM Timing Suggestion state
    const timingSuggestionTrigger = cell<string>("");

    const { result: timingSuggestions, pending: timingSuggestionPending } =
      generateObject({
        system:
          `You are a recipe timing assistant. Analyze recipe step groups and suggest optimal timing organization.

For each step group, analyze the steps and suggest:
- nightsBeforeServing: For tasks that need to happen days before (1, 2, etc.) - use this for overnight marinades, dough rising, etc.
- minutesBeforeServing: For day-of timing (e.g., 240, 120, 60, 30, 0) - use this for prep and cooking on serving day
- duration: How long this group of steps takes to complete (in minutes)
- requiresOven: If oven is needed, specify temperature (°F), duration (minutes), and rack requirements (heightSlots: 1-5, width: "full" or "half")

IMPORTANT: Each group should have EITHER nightsBeforeServing OR minutesBeforeServing, not both.

Guidelines:
- Use nightsBeforeServing for: marinades, dough rising overnight, curing, long refrigeration
- Use minutesBeforeServing=0 for: final plating, last-minute garnishes, serving
- Use minutesBeforeServing=30-60 for: final cooking, reheating
- Use minutesBeforeServing=120-240 for: main prep work
- Consider natural workflow: prep → cook → finish
- Duration should reflect active + passive time for that group
- Suggest logical reordering if current order doesn't make sense

Return suggestions for ALL groups with their IDs preserved.`,
        prompt: timingSuggestionTrigger,
        model: "anthropic:claude-sonnet-4-5",
        schema: {
          type: "object",
          properties: {
            stepGroups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  nightsBeforeServing: { type: "number" },
                  minutesBeforeServing: { type: "number" },
                  duration: { type: "number" },
                  requiresOven: {
                    type: "object",
                    properties: {
                      temperature: { type: "number" },
                      duration: { type: "number" },
                      racksNeeded: {
                        type: "object",
                        properties: {
                          heightSlots: { type: "number" },
                          width: { type: "string", enum: ["full", "half"] },
                        },
                      },
                    },
                  },
                },
                required: ["id"],
              },
            },
          },
        },
      });

    // LLM Wait Time Suggestion state
    const waitTimeSuggestionTrigger = cell<string>("");

    const { result: waitTimeSuggestions, pending: waitTimeSuggestionPending } =
      generateObject({
        system:
          `You are a recipe timing assistant. Analyze recipe step groups and suggest maximum wait times.

For each step group, analyze the steps and suggest maxWaitMinutes - how long the output of this step group can wait before the next step without losing quality.

Examples:
- Dough rising: maxWaitMinutes could be 60-120 (can wait a bit, but will overproof)
- Cooked pasta: maxWaitMinutes = 5-10 (gets sticky quickly)
- Roasted vegetables: maxWaitMinutes = 30-60 (stays warm and good)
- Sautéed items: maxWaitMinutes = 10-15 (best served immediately)
- Cold salads: maxWaitMinutes = 120-240 (can wait longer)
- Baked items cooling: maxWaitMinutes = 0 (proceed immediately to next step)
- Marinated items: maxWaitMinutes = 0 (proceed to cooking when ready)
- Final plating: maxWaitMinutes = 5-15 (serve quickly)

Consider:
- Temperature sensitivity (hot items cool, cold items warm)
- Texture changes (crispy becomes soggy, liquids absorb)
- Food safety (dairy, meat, seafood have shorter wait times)
- Chemical processes (oxidation, enzymatic browning)

Return suggestions for ALL groups with their IDs preserved.`,
        prompt: waitTimeSuggestionTrigger,
        model: "anthropic:claude-sonnet-4-5",
        schema: {
          type: "object",
          properties: {
            stepGroups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  maxWaitMinutes: { type: "number" },
                },
                required: ["id", "maxWaitMinutes"],
              },
            },
          },
        },
      });

    // NOTE: Auto-apply derives were removed because derives cannot mutate cells (no .set() method available).
    // Use the "Apply" buttons with the applyTimingSuggestions and applyWaitTimeSuggestions handlers instead.
    // These handlers work correctly because handlers CAN call .set() on cells.

    return {
      [NAME]: str`🍳 ${displayName}`,
      [UI]: (
        <ct-vstack gap={1} style="padding: 12px; max-width: 800px;">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: "0", fontSize: "20px" }}>{displayName}</h1>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <ct-button
                onClick={createCookingView({ name, servings, ingredients, stepGroups })}
                variant="secondary"
              >
                👨‍🍳 Create Cooking View
              </ct-button>
              <div style={{ fontSize: "13px", color: "#666" }}>
                {totalTime} min total
              </div>
            </div>
          </div>

          {/* Recipe Input Section - Notes with Image Upload */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Recipe Input</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <ct-image-input
                    onct-change={handleImageUpload({ notes })}
                  >
                    Upload Image
                  </ct-image-input>
                  <ct-button
                    onClick={triggerExtraction({ notes, extractTrigger })}
                    disabled={extractionPending}
                  >
                    {extractionPending
                      ? "Extracting..."
                      : "Extract Recipe Data"}
                  </ct-button>
                </div>
              </div>
              <ct-code-editor
                $value={notes}
                $mentionable={mentionable}
                $mentioned={mentioned}
                onbacklink-click={handleCharmLinkClick({})}
                onbacklink-create={handleNewBacklink({ mentionable })}
                language="text/markdown"
                theme="light"
                wordWrap
                tabIndent
                placeholder="Paste a recipe here, upload an image, then click 'Extract Recipe Data' to auto-fill fields..."
                style="min-height: 150px;"
              />
            </ct-vstack>
          </ct-card>

          {/* Scaling Controls */}
          <ct-card>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <strong style={{ fontSize: "14px" }}>Scale Recipe:</strong>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 0.5 })}
                variant="secondary"
              >
                ÷ 2 (Half)
              </ct-button>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 2 })}
                variant="secondary"
              >
                × 2 (Double)
              </ct-button>
              <ct-button
                onClick={scaleRecipe({ servings, ingredients, scaleFactor: 1.5 })}
                variant="secondary"
              >
                × 1.5
              </ct-button>
            </div>
          </ct-card>

          {/* Basic Info Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px" }}>Basic Info</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Recipe Name
                  </label>
                  <ct-input
                    $value={name}
                    placeholder="e.g., Chocolate Chip Cookies"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Cuisine
                  </label>
                  <ct-input
                    $value={cuisine}
                    placeholder="e.g., Italian, Thai"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Servings
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${servings}`}
                    min="1"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Yield
                  </label>
                  <ct-input
                    $value={recipeYield}
                    placeholder="e.g., 12 cookies, 1 loaf"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Difficulty
                  </label>
                  <ct-select
                    $value={difficulty}
                    items={[
                      { label: "Easy", value: "easy" },
                      { label: "Medium", value: "medium" },
                      { label: "Hard", value: "hard" },
                    ]}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Prep Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${prepTime}`}
                    min="0"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Cook Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${cookTime}`}
                    min="0"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Rest Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${restTime}`}
                    min="0"
                    placeholder="Time to rest after cooking"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Hold Time (min)
                  </label>
                  <ct-input
                    type="number"
                    $value={str`${holdTime}`}
                    min="0"
                    placeholder="Time dish can wait"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    Category
                  </label>
                  <ct-select
                    $value={category}
                    items={[
                      { label: "Appetizer", value: "appetizer" },
                      { label: "Main", value: "main" },
                      { label: "Side", value: "side" },
                      { label: "Starch", value: "starch" },
                      { label: "Vegetable", value: "vegetable" },
                      { label: "Dessert", value: "dessert" },
                      { label: "Bread", value: "bread" },
                      { label: "Other", value: "other" },
                    ]}
                  />
                </div>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Ingredients Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Ingredients ({ingredientCount})</h3>
                <ct-button onClick={addIngredient({ ingredients })}>
                  + Add Ingredient
                </ct-button>
              </div>

              <ct-vstack gap={1}>
                {ingredients.map((ingredient) => (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr auto",
                      gap: "8px",
                      alignItems: "center",
                      padding: "8px",
                      border: "1px solid #eee",
                      borderRadius: "4px",
                    }}
                  >
                    <ct-input
                      $value={ingredient.item}
                      placeholder="Ingredient name"
                    />
                    <ct-input
                      $value={ingredient.amount}
                      placeholder="Amount"
                    />
                    <ct-select
                      $value={ingredient.unit}
                      items={UNIT_ITEMS}
                    />
                    <ct-button
                      onClick={removeIngredient({ ingredients, ingredient })}
                      style={{ padding: "4px 8px", fontSize: "18px" }}
                    >
                      ×
                    </ct-button>
                  </div>
                ))}
              </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Dietary Analysis Section */}
          <ct-card>
            <div>
              <h4 style={{ margin: "0 0 8px 0" }}>Dietary Analysis</h4>
              {derive(
                { pending: analyzer.analysisPending, dc: analyzer.dietaryCompatibility },
                ({ pending, dc }) => {
                  if (pending) {
                    return <div style={{ fontStyle: "italic", color: "#666" }}>
                      Analyzing dietary compatibility...
                    </div>;
                  }

                  if (!dc || (dc.compatible.length === 0 && dc.incompatible.length === 0)) {
                    return <div style={{ fontStyle: "italic", color: "#666" }}>
                      Add ingredients to see dietary analysis
                    </div>;
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {dc.compatible.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "600", color: "#059669", marginBottom: "4px" }}>
                            ✓ Compatible:
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {dc.compatible.map((tag: string) => (
                              <span style={{
                                padding: "2px 8px",
                                background: "#d1fae5",
                                borderRadius: "12px",
                                fontSize: "12px",
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {dc.warnings.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "600", color: "#dc2626", marginBottom: "4px" }}>
                            ⚠️ Warnings:
                          </div>
                          <ul style={{ margin: "0", paddingLeft: "20px", fontSize: "13px" }}>
                            {dc.warnings.map((warning: string) => (
                              <li>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {dc.primaryIngredients.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                            Main Ingredients:
                          </div>
                          <div style={{ fontSize: "13px", color: "#666" }}>
                            {dc.primaryIngredients.join(", ")}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </ct-card>

          {/* Step Groups Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: "0", fontSize: "14px" }}>Step Groups ({stepGroupCount})</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <ct-button
                    onClick={triggerTimingSuggestion({ stepGroups, timingSuggestionTrigger })}
                    disabled={derive(stepGroups, (groups) => groups.length === 0) || timingSuggestionPending}
                    variant="secondary"
                  >
                    {timingSuggestionPending ? "Analyzing..." : "Organize by Timing"}
                  </ct-button>
                  <ct-button
                    onClick={triggerWaitTimeSuggestion({ stepGroups, waitTimeSuggestionTrigger })}
                    disabled={derive(stepGroups, (groups) => groups.length === 0) || waitTimeSuggestionPending}
                    variant="secondary"
                  >
                    {waitTimeSuggestionPending ? "Analyzing..." : "Suggest Wait Times"}
                  </ct-button>
                  <ct-button onClick={addStepGroup({ stepGroups })}>
                    + Add Group
                  </ct-button>
                </div>
              </div>

              <ct-vstack gap={1}>
                {stepGroups.map((stepGroup, groupIndex) => (
                  <ct-card style={{ background: "#f9fafb" }}>
                    <ct-vstack gap={1}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <ct-button
                            onClick={moveGroupUp({ stepGroups, stepGroup })}
                            disabled={groupIndex === 0}
                            style={{ padding: "2px 6px", fontSize: "14px", lineHeight: "1" }}
                          >
                            ↑
                          </ct-button>
                          <ct-button
                            onClick={moveGroupDown({ stepGroups, stepGroup })}
                            disabled={derive(stepGroups, (groups) => groupIndex >= groups.length - 1)}
                            style={{ padding: "2px 6px", fontSize: "14px", lineHeight: "1" }}
                          >
                            ↓
                          </ct-button>
                        </div>
                        <ct-input
                          $value={stepGroup.name}
                          placeholder="Group name (e.g., Prep, Cooking)"
                          style="flex: 1; fontWeight: 600;"
                        />
                        <ct-button
                          onClick={removeStepGroup({ stepGroups, stepGroup })}
                          style={{ padding: "4px 8px", fontSize: "18px" }}
                        >
                          × Remove Group
                        </ct-button>
                      </div>

                      {/* Timing Metadata */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "8px",
                        padding: "8px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "4px",
                      }}>
                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Timing
                          </label>
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <ct-input
                              type="number"
                              $value={str`${stepGroup.nightsBeforeServing}`}
                              min="0"
                              placeholder="Nights"
                              style="flex: 1; fontSize: 13px;"
                            />
                            <span style={{ fontSize: "11px", color: "#999" }}>nights OR</span>
                            <ct-input
                              type="number"
                              $value={str`${stepGroup.minutesBeforeServing}`}
                              min="0"
                              placeholder="Minutes"
                              style="flex: 1; fontSize: 13px;"
                            />
                            <span style={{ fontSize: "11px", color: "#999" }}>min before</span>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Duration (min)
                          </label>
                          <ct-input
                            type="number"
                            $value={str`${stepGroup.duration}`}
                            min="0"
                            placeholder="How long this takes"
                            style="fontSize: 13px;"
                          />
                        </div>

                        <div style={{ gridColumn: "1 / -1" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Max Wait Time (min)
                          </label>
                          <ct-input
                            type="number"
                            $value={str`${stepGroup.maxWaitMinutes}`}
                            min="0"
                            placeholder="How long this can wait"
                            style="fontSize: 13px;"
                          />
                        </div>
                      </div>

                      {/* Oven Requirements */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr",
                        gap: "8px",
                        padding: "8px",
                        background: "#fff3cd",
                        border: "1px solid #ffc107",
                        borderRadius: "4px",
                      }}>
                        <div style={{ gridColumn: "1 / -1", fontSize: "12px", fontWeight: "600", color: "#856404", marginBottom: "4px" }}>
                          🔥 Oven Requirements (optional)
                        </div>

                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Temp (°F)
                          </label>
                          <ct-input
                            type="number"
                            $value={str`${derive(stepGroup, (g) => g.requiresOven?.temperature ?? "")}`}
                            onct-change={updateOvenTemp({ stepGroup })}
                            min="0"
                            placeholder="350"
                            style="fontSize: 13px;"
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Duration (min)
                          </label>
                          <ct-input
                            type="number"
                            $value={str`${derive(stepGroup, (g) => g.requiresOven?.duration ?? "")}`}
                            onct-change={updateOvenDuration({ stepGroup })}
                            min="0"
                            placeholder="30"
                            style="fontSize: 13px;"
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Height Slots
                          </label>
                          <ct-input
                            type="number"
                            $value={str`${derive(stepGroup, (g) => g.requiresOven?.racksNeeded?.heightSlots ?? "")}`}
                            onct-change={updateOvenHeightSlots({ stepGroup })}
                            min="1"
                            placeholder="1-5"
                            style="fontSize: 13px;"
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: "500", color: "#666" }}>
                            Rack Width
                          </label>
                          <ct-select
                            $value={derive(stepGroup, (g) => g.requiresOven?.racksNeeded?.width ?? "")}
                            onct-change={updateOvenRackWidth({ stepGroup })}
                            items={[
                              { label: "---", value: "" },
                              { label: "Full", value: "full" },
                              { label: "Half", value: "half" },
                            ]}
                            style="fontSize: 13px;"
                          />
                        </div>
                      </div>

                      <ct-vstack gap={1}>
                        {stepGroup.steps.map((step, index) => (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontWeight: "bold", color: "#666", minWidth: "20px" }}>
                              {index + 1}.
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <ct-button
                                onClick={moveStepUp({ stepGroup, stepIndex: index })}
                                disabled={index === 0}
                                style={{ padding: "2px 6px", fontSize: "14px", lineHeight: "1" }}
                              >
                                ↑
                              </ct-button>
                              <ct-button
                                onClick={moveStepDown({ stepGroup, stepIndex: index })}
                                disabled={derive(stepGroup, (g) => index >= g.steps.length - 1)}
                                style={{ padding: "2px 6px", fontSize: "14px", lineHeight: "1" }}
                              >
                                ↓
                              </ct-button>
                            </div>
                            <ct-input
                              $value={step.description}
                              placeholder="Step description..."
                              style="flex: 1;"
                            />
                            <ct-button
                              onClick={removeStepFromGroup({ stepGroup, stepIndex: index })}
                              style={{ padding: "4px 8px", fontSize: "18px" }}
                            >
                              ×
                            </ct-button>
                          </div>
                        ))}
                      </ct-vstack>

                      <ct-button
                        onClick={addStepToGroup({ stepGroup })}
                        variant="secondary"
                        style={{ alignSelf: "flex-start" }}
                      >
                        + Add Step to Group
                      </ct-button>
                    </ct-vstack>
                  </ct-card>
                ))}
              </ct-vstack>
            </ct-vstack>
          </ct-card>

          {/* Tags Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px" }}>Tags</h3>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                  {tags.map((tag) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        background: "#e3f2fd",
                        borderRadius: "16px",
                        fontSize: "14px",
                      }}
                    >
                      <span>{tag}</span>
                      <ct-button
                        onClick={removeTag({ tags, tag })}
                        style={{
                          padding: "0 4px",
                          fontSize: "16px",
                          background: "transparent",
                          border: "none",
                        }}
                      >
                        ×
                      </ct-button>
                    </div>
                  ))}
                </div>

              <ct-message-input
                placeholder="Add tag (e.g., vegetarian, quick, dessert)..."
                appearance="rounded"
                onct-send={addTag({ tags })}
              />
            </ct-vstack>
          </ct-card>

          {/* Source Section */}
          <ct-card>
            <ct-vstack gap={1}>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "14px" }}>Source</h3>
              <ct-input
                $value={source}
                placeholder="Where did this recipe come from? (URL, book, person)"
              />
            </ct-vstack>
          </ct-card>

          {/* Extraction Results Modal */}
          {ifElse(
            hasExtractionResult,
            <ct-card style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "600px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: "1000",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5)",
            }}>
              <ct-vstack gap={1} style="padding: 12px;">
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px" }}>Review Extracted Changes</h3>
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#666" }}>
                  The following changes will be applied to your recipe:
                </p>

                <ct-vstack gap={2}>
                  {changesPreview.map((change) => (
                    <div style={{
                      padding: "6px 10px",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "4px",
                    }}>
                      <ct-vstack gap={0}>
                        <strong style={{ fontSize: "12px" }}>
                          {change.field}
                        </strong>
                        <div style={{ fontSize: "11px", lineHeight: "1.4" }}>
                          {change.field === "Notes"
                            ? (
                              change.to === "(empty)"
                                ? (
                                  <div style={{
                                    color: "#dc2626",
                                    fontStyle: "italic",
                                  }}>
                                    Notes will be cleared
                                  </div>
                                )
                                : change.from === "(empty)"
                                ? (
                                  <div style={{ color: "#16a34a" }}>
                                    {change.to}
                                  </div>
                                )
                                : change.from && change.to
                                ? (
                                  computeWordDiff(change.from, change.to).map(
                                    (part) => {
                                      if (part.type === "removed") {
                                        return (
                                          <span style={{
                                            color: "#dc2626",
                                            textDecoration: "line-through",
                                            backgroundColor: "#fee",
                                          }}>
                                            {part.word}
                                          </span>
                                        );
                                      } else if (part.type === "added") {
                                        return (
                                          <span style={{
                                            color: "#16a34a",
                                            backgroundColor: "#efe",
                                          }}>
                                            {part.word}
                                          </span>
                                        );
                                      } else {
                                        return <span>{part.word}</span>;
                                      }
                                    },
                                  )
                                )
                                : (
                                  <div style={{
                                    color: "#666",
                                    fontStyle: "italic",
                                  }}>
                                    (no diff available)
                                  </div>
                                )
                            )
                            : (
                              <div>
                                <span style={{
                                  color: "#dc2626",
                                  textDecoration: "line-through",
                                  marginRight: "6px",
                                }}>
                                  {change.from}
                                </span>
                                <span style={{ color: "#16a34a" }}>
                                  {change.to}
                                </span>
                              </div>
                            )}
                        </div>
                      </ct-vstack>
                    </div>
                  ))}

                  {/* Show detailed info about complex fields if extracted */}
                  {derive(extractionResult, (result) => {
                    if (!result) return null;

                    return (
                      <ct-vstack gap={2}>
                        {/* Ingredients */}
                        {result?.ingredients && result.ingredients.length > 0 && (
                          <div style={{
                            padding: "6px 10px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "#1e40af",
                          }}>
                            <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                              ✓ {result.ingredients.length} ingredient(s) will be added
                            </div>
                          </div>
                        )}

                        {/* Step Groups - Show Full Details */}
                        {result?.stepGroups && result.stepGroups.length > 0 && (
                          <div style={{
                            padding: "6px 10px",
                            background: "#f0fdf4",
                            border: "1px solid #86efac",
                            borderRadius: "4px",
                            fontSize: "12px",
                          }}>
                            <div style={{ fontWeight: "600", color: "#166534", marginBottom: "6px" }}>
                              ✓ {result.stepGroups.length} step group(s) will be added:
                            </div>
                            {result.stepGroups.map((group: any, index: number) => (
                              <div style={{
                                marginBottom: index < result.stepGroups.length - 1 ? "8px" : "0",
                                paddingLeft: "8px",
                                borderLeft: "2px solid #86efac",
                              }}>
                                <div style={{ fontWeight: "600", color: "#166534", marginBottom: "2px" }}>
                                  {group.name || `Group ${index + 1}`}
                                </div>
                                {group.steps && group.steps.length > 0 && (
                                  <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", color: "#166534" }}>
                                    {group.steps.map((step: any, stepIndex: number) => (
                                      <li style={{ marginBottom: "2px" }}>
                                        {step.description}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Tags */}
                        {result?.tags && result.tags.length > 0 && (
                          <div style={{
                            padding: "6px 10px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "#1e40af",
                          }}>
                            <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                              ✓ {result.tags.length} tag(s) will be added
                            </div>
                          </div>
                        )}
                      </ct-vstack>
                    );
                  })}
                </ct-vstack>

                <div style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "1rem",
                }}>
                  <ct-button
                    onClick={cancelExtraction({ extractedData: extractionResult })}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    onClick={applyExtractedData({
                      extractedData: extractionResult,
                      name,
                      cuisine,
                      servings,
                      difficulty,
                      prepTime,
                      cookTime,
                      restTime,
                      holdTime,
                      category,
                      ingredients,
                      stepGroups,
                      tags,
                      source,
                      notes,
                    })}
                    style={{ backgroundColor: "#2563eb", color: "white" }}
                  >
                    Apply
                  </ct-button>
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}

          {/* Timing Suggestions Modal */}
          {ifElse(
            derive(timingSuggestions, (result) => result && Array.isArray(result.stepGroups)),
            <ct-card style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "600px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: "1000",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5)",
            }}>
              <ct-vstack gap={1} style="padding: 12px;">
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px" }}>Review Timing Suggestions</h3>
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#666" }}>
                  The following timing changes will be applied to your step groups:
                </p>

                <ct-vstack gap={2}>
                  {derive({ timingSuggestions, stepGroups }, ({ timingSuggestions: result, stepGroups: groups }) =>
                    result?.stepGroups?.map((suggestion: any) => {
                      const currentGroupCell = groups.find((g: any) => {
                        const groupData = (g.get ? g.get() : g) as StepGroup;
                        return groupData.id === suggestion.id;
                      });
                      const currentData: StepGroup | null = currentGroupCell
                        ? ((currentGroupCell as any).get ? (currentGroupCell as any).get() : currentGroupCell) as StepGroup
                        : null;

                      return (
                        <div style={{
                          padding: "8px 10px",
                          background: "#f9fafb",
                          border: "1px solid #e5e7eb",
                          borderRadius: "4px",
                        }}>
                          <ct-vstack gap={1}>
                            <strong style={{ fontSize: "13px" }}>
                              {currentData?.name || suggestion.id}
                            </strong>
                            <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
                              {suggestion.nightsBeforeServing !== undefined && (
                                <div>
                                  <span style={{ color: "#666" }}>Nights before:</span>{" "}
                                  <span style={{
                                    color: "#dc2626",
                                    textDecoration: "line-through",
                                    marginRight: "6px",
                                  }}>
                                    {currentData?.nightsBeforeServing ?? "(none)"}
                                  </span>
                                  <span style={{ color: "#16a34a" }}>
                                    {suggestion.nightsBeforeServing}
                                  </span>
                                </div>
                              )}
                              {suggestion.minutesBeforeServing !== undefined && (
                                <div>
                                  <span style={{ color: "#666" }}>Minutes before:</span>{" "}
                                  <span style={{
                                    color: "#dc2626",
                                    textDecoration: "line-through",
                                    marginRight: "6px",
                                  }}>
                                    {currentData?.minutesBeforeServing ?? "(none)"}
                                  </span>
                                  <span style={{ color: "#16a34a" }}>
                                    {suggestion.minutesBeforeServing}
                                  </span>
                                </div>
                              )}
                              {suggestion.duration !== undefined && (
                                <div>
                                  <span style={{ color: "#666" }}>Duration:</span>{" "}
                                  <span style={{
                                    color: "#dc2626",
                                    textDecoration: "line-through",
                                    marginRight: "6px",
                                  }}>
                                    {currentData?.duration ?? "(none)"}
                                  </span>
                                  <span style={{ color: "#16a34a" }}>
                                    {suggestion.duration} min
                                  </span>
                                </div>
                              )}
                            </div>
                          </ct-vstack>
                        </div>
                      );
                    })
                  )}
                </ct-vstack>

                <div style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "1rem",
                }}>
                  <ct-button
                    onClick={handler<Record<string, never>, { timingSuggestions: Cell<any> }>(
                      (_, { timingSuggestions }) => timingSuggestions.set(null)
                    )({ timingSuggestions })}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    onClick={applyTimingSuggestions({ timingSuggestions, stepGroups })}
                    style={{ backgroundColor: "#2563eb", color: "white" }}
                  >
                    Apply
                  </ct-button>
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}

          {/* Wait Time Suggestions Modal */}
          {ifElse(
            derive(waitTimeSuggestions, (result) => result && Array.isArray(result.stepGroups)),
            <ct-card style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "600px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: "1000",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5)",
            }}>
              <ct-vstack gap={1} style="padding: 12px;">
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px" }}>Review Wait Time Suggestions</h3>
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#666" }}>
                  The following wait time changes will be applied to your step groups:
                </p>

                <ct-vstack gap={2}>
                  {derive({ waitTimeSuggestions, stepGroups }, ({ waitTimeSuggestions: result, stepGroups: groups }) =>
                    result?.stepGroups?.map((suggestion: any) => {
                      const currentGroupCell = groups.find((g: any) => {
                        const groupData = (g.get ? g.get() : g) as StepGroup;
                        return groupData.id === suggestion.id;
                      });
                      const currentData: StepGroup | null = currentGroupCell
                        ? ((currentGroupCell as any).get ? (currentGroupCell as any).get() : currentGroupCell) as StepGroup
                        : null;

                      return (
                        <div style={{
                          padding: "8px 10px",
                          background: "#f9fafb",
                          border: "1px solid #e5e7eb",
                          borderRadius: "4px",
                        }}>
                          <ct-vstack gap={1}>
                            <strong style={{ fontSize: "13px" }}>
                              {currentData?.name || suggestion.id}
                            </strong>
                            <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
                              <span style={{ color: "#666" }}>Max wait time:</span>{" "}
                              <span style={{
                                color: "#dc2626",
                                textDecoration: "line-through",
                                marginRight: "6px",
                              }}>
                                {currentData?.maxWaitMinutes ?? "(none)"}
                              </span>
                              <span style={{ color: "#16a34a" }}>
                                {suggestion.maxWaitMinutes} min
                              </span>
                            </div>
                          </ct-vstack>
                        </div>
                      );
                    })
                  )}
                </ct-vstack>

                <div style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "1rem",
                }}>
                  <ct-button
                    onClick={handler<Record<string, never>, { waitTimeSuggestions: Cell<any> }>(
                      (_, { waitTimeSuggestions }) => waitTimeSuggestions.set(null)
                    )({ waitTimeSuggestions })}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    onClick={applyWaitTimeSuggestions({ waitTimeSuggestions, stepGroups })}
                    style={{ backgroundColor: "#2563eb", color: "white" }}
                  >
                    Apply
                  </ct-button>
                </div>
              </ct-vstack>
            </ct-card>,
            <div />
          )}
        </ct-vstack>
      ),
      name,
      cuisine,
      servings,
      yield: recipeYield,
      difficulty,
      prepTime,
      cookTime,
      restTime,
      holdTime,
      category,
      ingredients,
      stepGroups,
      tags,
      notes,
      source,
      ovenRequirements,
      dietaryCompatibility: analyzer.dietaryCompatibility,
      // Pattern tools for omnibot
      getIngredientsList: patternTool(
        ({ ingredients }: { ingredients: Ingredient[] }) => {
          return derive(ingredients, (items) => {
            if (!items || items.length === 0) return "No ingredients";
            return items.map((ing) =>
              `${ing.amount} ${ing.unit} ${ing.item}`
            ).join("\n");
          });
        },
        { ingredients }
      ),
      getInstructions: patternTool(
        ({ stepGroups }: { stepGroups: StepGroup[] }) => {
          return derive(stepGroups, (groups) => {
            if (!groups || groups.length === 0) return "No instructions";
            return groups.map((group) => {
              const timing = group.nightsBeforeServing
                ? `${group.nightsBeforeServing} night(s) before`
                : group.minutesBeforeServing !== undefined
                ? `${group.minutesBeforeServing} min before serving`
                : "no timing specified";
              const duration = group.duration ? ` (${group.duration} min)` : "";
              const steps = group.steps.map((step, idx) =>
                `  ${idx + 1}. ${step.description}`
              ).join("\n");
              return `${group.name} [${timing}]${duration}:\n${steps}`;
            }).join("\n\n");
          });
        },
        { stepGroups }
      ),
      getRecipeSummary: patternTool(
        ({ name, cuisine, servings, prepTime, cookTime }: {
          name: string;
          cuisine: string;
          servings: number;
          prepTime: number;
          cookTime: number;
        }) => {
          return derive({ name, cuisine, servings, prepTime, cookTime }, (data) => {
            const parts = [
              `Recipe: ${data.name || "Untitled"}`,
              data.cuisine ? `Cuisine: ${data.cuisine}` : null,
              `Servings: ${data.servings}`,
              `Prep: ${data.prepTime} min, Cook: ${data.cookTime} min`,
              `Total: ${data.prepTime + data.cookTime} min`,
            ].filter(Boolean);
            return parts.join("\n");
          });
        },
        { name, cuisine, servings, prepTime, cookTime }
      ),
    };
  },
);
