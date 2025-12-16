/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  ImageData,
  llm,
  NAME,
  OpaqueCell,
  OpaqueRef,
  pattern,
  str,
  UI,
} from "commontools";

// Type definitions
interface StoreAisle {
  name: string;
  description: Default<string, "">;
}

type WallPosition =
  | "front" | "left" | "back" | "right"  // Basic positions (kept for compatibility)
  | "front-left" | "front-center" | "front-right"  // Front wall granular
  | "back-left" | "back-center" | "back-right"  // Back wall granular
  | "left-front" | "left-center" | "left-back"  // Left wall granular
  | "right-front" | "right-center" | "right-back";  // Right wall granular

interface DepartmentRecord {
  name: string;
  location: WallPosition;
  description: Default<string, "">;
  icon: Default<string, "🏪">;
}

interface Entrance {
  name: string;
  position: WallPosition;
}

const DEFAULT_DEPARTMENTS = [
  { name: "Bakery", icon: "🥖" },
  { name: "Deli", icon: "🥪" },
  { name: "Produce", icon: "🥬" },
  { name: "Dairy", icon: "🥛" },
  { name: "Frozen Foods", icon: "🧊" },
  { name: "Meat & Seafood", icon: "🥩" },
  { name: "Pharmacy", icon: "💊" },
];

const DEFAULT_DEPARTMENT_NAMES = DEFAULT_DEPARTMENTS.map((d) => d.name);

// Track user-reported item locations for LLM context enhancement
interface ItemLocation {
  itemName: string;           // e.g., "coffee"
  correctAisle: string;       // e.g., "Aisle 9 - Coffee & Seafood"
  incorrectAisle?: string;    // e.g., "Aisle 5 - Condiments" (optional)
  timestamp: number;          // When correction was made
}

// IMPORTANT: If you modify StoreMapInput, also update these files that instantiate StoreMapper:
// - page-creator.tsx
// - space-setup.tsx
// - shopping-list-launcher.tsx (2 places: openStoreMapper and viewStoreMap)
interface StoreMapInput {
  storeName?: Default<string, "">;
  aisles?: Default<StoreAisle[], []>;
  specialDepartments?: Default<DepartmentRecord[], []>; // Assigned departments
  unassignedDepartments?: Default<
    string[],
    ["Bakery", "Deli", "Produce", "Dairy", "Frozen Foods", "Meat & Seafood", "Pharmacy"]
  >; // Unassigned
  entrances?: Default<Entrance[], []>;
  notInStore?: Default<string[], []>;
  inCenterAisles?: Default<string[], []>; // Departments marked as being in center aisles (not perimeter)
  itemLocations?: Default<ItemLocation[], []>; // User corrections
}

/** Store layout mapper with aisles and departments. #storeMap */
interface StoreMapOutput extends StoreMapInput {
  outline: string;
}

// Aisle handlers
const addAisle = handler<unknown, { aisles: Cell<StoreAisle[]> }>(
  (_event, { aisles }) => {
    aisles.push({ name: "", description: "" });
  }
);

const removeAisle = handler<
  unknown,
  { aisles: Cell<Array<Cell<StoreAisle>>>; aisle: Cell<StoreAisle> }
>((_event, { aisles, aisle }) => {
  aisles.remove(aisle);
});

const moveAisleUp = handler<
  unknown,
  { aisles: Cell<Array<Cell<StoreAisle>>>; aisle: Cell<StoreAisle> }
>((_event, { aisles, aisle }) => {
  const currentAisles = aisles.get();
  const index = currentAisles.findIndex((el) => el.equals(aisle));
  if (index > 0) {
    const newAisles = [...currentAisles];
    [newAisles[index - 1], newAisles[index]] = [
      newAisles[index],
      newAisles[index - 1],
    ];
    aisles.set(newAisles);
  }
});

const moveAisleDown = handler<
  unknown,
  { aisles: Cell<Array<Cell<StoreAisle>>>; aisle: Cell<StoreAisle> }
>((_event, { aisles, aisle }) => {
  const currentAisles = aisles.get();
  const index = currentAisles.findIndex((el) => el.equals(aisle));
  if (index >= 0 && index < currentAisles.length - 1) {
    const newAisles = [...currentAisles];
    [newAisles[index], newAisles[index + 1]] = [
      newAisles[index + 1],
      newAisles[index],
    ];
    aisles.set(newAisles);
  }
});

const addFromSuggestion = handler<
  unknown,
  { aisles: Cell<StoreAisle[]>; suggestions: string[]; index: number }
>((_event, { aisles, suggestions, index }) => {
  const suggestion = suggestions[index];
  if (suggestion) {
    aisles.push({ name: suggestion, description: "" });
  }
});

const dismissSuggestion = handler<
  unknown,
  { notInStore: Cell<string[]>; suggestions: string[]; index: number }
>((_event, { notInStore, suggestions, index }) => {
  const suggestion = suggestions[index];
  if (suggestion) {
    notInStore.push(suggestion);
  }
});

// Department handlers - the new workflow!
const addCustomDepartment = handler<
  unknown,
  { unassignedDepartments: Cell<string[]>; customDeptName: Cell<string> }
>((_event, { unassignedDepartments, customDeptName }) => {
  const name = customDeptName.get().trim();
  if (name) {
    unassignedDepartments.push(name);
    customDeptName.set("");
  }
});

const assignDepartment = handler<
  unknown,
  {
    specialDepartments: Cell<DepartmentRecord[]>;
    unassignedDepartments: Cell<string[]>;
    departmentName: string;
    location: WallPosition;
    icon: string;
  }
>(
  (
    _event,
    { specialDepartments, unassignedDepartments, departmentName, location, icon }
  ) => {
    // Remove from unassigned
    const current = unassignedDepartments.get();
    const filtered = current.filter((name) => name !== departmentName);
    unassignedDepartments.set(filtered);

    // Add to assigned
    specialDepartments.push({
      name: departmentName,
      location,
      description: "",
      icon,
    });
  }
);

const unassignDepartment = handler<
  unknown,
  {
    specialDepartments: Cell<Array<Cell<DepartmentRecord>>>;
    unassignedDepartments: Cell<string[]>;
    department: Cell<DepartmentRecord>;
  }
>((_event, { specialDepartments, unassignedDepartments, department }) => {
  const current = specialDepartments.get();
  const index = current.findIndex((el) => el.equals(department));

  if (index >= 0) {
    const deptData = current[index].get();

    // Add back to unassigned
    unassignedDepartments.push(deptData.name);

    // Remove from assigned
    specialDepartments.set(current.toSpliced(index, 1));
  }
});

const dismissDepartment = handler<
  unknown,
  {
    unassignedDepartments: Cell<string[]>;
    notInStore: Cell<string[]>;
    departmentName: string;
  }
>((_event, { unassignedDepartments, notInStore, departmentName }) => {
  // Remove from unassigned
  const current = unassignedDepartments.get();
  const filtered = current.filter((name) => name !== departmentName);
  unassignedDepartments.set(filtered);

  // Add to not in store
  notInStore.push(departmentName);
});

const markAsNormalAisle = handler<
  unknown,
  {
    unassignedDepartments: Cell<string[]>;
    inCenterAisles: Cell<string[]>;
    departmentName: string;
  }
>((_event, { unassignedDepartments, inCenterAisles, departmentName }) => {
  // Remove from unassigned
  const current = unassignedDepartments.get();
  const filtered = current.filter((name) => name !== departmentName);
  unassignedDepartments.set(filtered);

  // Add to inCenterAisles
  inCenterAisles.push(departmentName);
});

// Add single extracted aisle
const addExtractedAisle = handler<
  unknown,
  {
    aisles: Cell<StoreAisle[]>;
    extractedAisle: { name: string; products: string[] };
  }
>((_event, { aisles, extractedAisle }) => {
  // Convert products array to markdown bullets
  const description = extractedAisle.products && extractedAisle.products.length > 0
    ? extractedAisle.products.map(p => `- ${p}`).join('\n')
    : '';

  aisles.push({
    name: extractedAisle.name,
    description,
  });
});

// Toggle item selection for merge
const toggleMergeItem = handler<
  unknown,
  {
    selectedMergeItems: Cell<Record<string, string[]>>;
    selectionKey: string;
    itemName: string;
    allItems: string[];
  }
>((_event, { selectedMergeItems, selectionKey, itemName, allItems }) => {
  const current = selectedMergeItems.get();
  const currentSelection = current[selectionKey] || allItems;

  const newSelection = currentSelection.includes(itemName)
    ? currentSelection.filter(item => item !== itemName)
    : [...currentSelection, itemName];

  selectedMergeItems.set({
    ...current,
    [selectionKey]: newSelection,
  });
});

// Merge extracted products into existing aisle (with checkbox selection support)
const mergeExtractedAisle = handler<
  unknown,
  {
    aisles: Cell<Array<Cell<StoreAisle>>>;
    existingAisle: Cell<StoreAisle>;
    newItems: string[];
    selectedMergeItems: Cell<Record<string, string[]>>;
    selectionKey: string;
    hiddenPhotoIds: Cell<string[]>;
    photo: Cell<ImageData>;
    extractedAisles: Array<{ name: string; products: readonly string[] }>;
  }
>((_event, { aisles, existingAisle, newItems, selectedMergeItems, selectionKey, hiddenPhotoIds, photo, extractedAisles }) => {
  const currentData = existingAisle.get();
  const existingDesc = currentData.description || '';

  // Get selected items (default to all if not in map)
  const selectedItems = selectedMergeItems.get()[selectionKey] || newItems;

  // Only merge selected items
  const itemsToMerge = newItems.filter(item => selectedItems.includes(item));

  // Parse existing items
  const existingItems = parseItems(existingDesc);

  // Detect format
  const format = detectFormat(existingDesc);

  // Combine existing items with selected new items (using suggested capitalization)
  const combined = [...existingItems, ...itemsToMerge];

  // Format back to string
  const newDescription = formatItems(combined, format);

  // Update the aisle
  existingAisle.set({
    ...currentData,
    description: newDescription,
  });

  // Clear selection state for this key after merge
  const currentSelections = selectedMergeItems.get();
  const { [selectionKey]: _, ...remaining } = currentSelections;
  selectedMergeItems.set(remaining);

  // Check if there are any remaining merge opportunities in this photo
  const currentAisles = aisles.get();
  const hasRemainingMerges = extractedAisles.some((extracted) => {
    const matchingAisle = currentAisles.find(
      (existing) =>
        existing.get().name.trim().toLowerCase() === extracted.name.trim().toLowerCase()
    );
    if (!matchingAisle) return false;

    const analysis = analyzeOverlap(
      matchingAisle.get().description || '',
      [...(extracted.products || [])]
    );
    return analysis.hasNewItems;
  });

  // Hide photo if no more merges are needed
  if (!hasRemainingMerges) {
    const photoData = photo.get();
    const currentHidden = hiddenPhotoIds.get();
    if (!currentHidden.includes(photoData.id)) {
      hiddenPhotoIds.set([...currentHidden, photoData.id]);
    }
  }
});

// Batch add all non-conflicting aisles from a photo extraction
const batchAddNonConflicting = handler<
  unknown,
  {
    aisles: Cell<StoreAisle[]>;
    extractedAisles: Array<{ name: string; products: string[] }>;
    uploadedPhotos: Cell<Array<Cell<ImageData>>>;
    photo: Cell<ImageData>;
    hiddenPhotoIds: Cell<string[]>;
  }
>((_event, { aisles, extractedAisles, uploadedPhotos, photo, hiddenPhotoIds }) => {
  const currentAisles = aisles.get();

  // Filter to only non-conflicting aisles (with whitespace normalization)
  const nonConflicting = extractedAisles.filter((extracted) => {
    return !currentAisles.some(
      (existing) =>
        existing.name.trim().toLowerCase() === extracted.name.trim().toLowerCase()
    );
  });

  // Add all non-conflicting aisles with markdown bullets
  nonConflicting.forEach((aisle) => {
    const description = aisle.products && aisle.products.length > 0
      ? aisle.products.map(p => `- ${p}`).join('\n')
      : '';

    aisles.push({
      name: aisle.name,
      description,
    });
  });

  // Hide the photo after accepting its aisles
  const photoData = photo.get();
  const currentHidden = hiddenPhotoIds.get();
  if (!currentHidden.includes(photoData.id)) {
    hiddenPhotoIds.set([...currentHidden, photoData.id]);
  }
});

// Batch add non-conflicting aisles from ALL photos at once
// This handler uses the computed batchAllPhotosData to know what to add
const batchAddAllPhotosNonConflicting = handler<
  unknown,
  {
    aisles: Cell<StoreAisle[]>;
    uploadedPhotos: Cell<Array<Cell<ImageData>>>;
    batchData: {
      aislesToAdd: Array<{ name: string; description: string }>;
      photosToDelete: Array<string>; // photo names
    };
  }
>((_event, { aisles, uploadedPhotos, batchData }) => {
  // Add all non-conflicting aisles
  batchData.aislesToAdd.forEach((aisle: { name: string; description: string }) => {
    aisles.push(aisle);
  });

  // Note: We don't auto-delete photos after adding aisles anymore.
  // This prevents the photo analysis reset bug where remaining photos
  // would reset to "Analyzing..." when uploadedPhotos array changes.
  // Users can manually delete photos using the delete button.
});

// Entrance handlers
const addEntrance = handler<
  unknown,
  { entrances: Cell<Entrance[]>; position: WallPosition; name: string }
>((_event, { entrances, position, name }) => {
  entrances.push({ name, position });
});

const removeEntrance = handler<
  unknown,
  { entrances: Cell<Array<Cell<Entrance>>>; entrance: Cell<Entrance> }
>((_event, { entrances, entrance }) => {
  entrances.remove(entrance);
});

const toggleEntrancesComplete = handler<
  unknown,
  { entrancesComplete: Cell<boolean> }
>((_event, { entrancesComplete }) => {
  entrancesComplete.set(!entrancesComplete.get());
});

// Copy outline to clipboard
const copyOutline = handler<unknown, { outline: string }>(
  (_event, { outline }) => {
    const nav = (globalThis as any).navigator;
    if (nav?.clipboard) {
      nav.clipboard.writeText(outline).catch((err: unknown) => {
        console.error("Failed to copy:", err);
      });
    }
  }
);

// Delete photo handler
const deletePhoto = handler<
  unknown,
  { hiddenPhotoIds: Cell<string[]>; photo: Cell<ImageData> }
>((_event, { hiddenPhotoIds, photo }) => {
  // Instead of splicing the array (which shifts indices and breaks map identity),
  // just mark the photo as hidden. This preserves array indices and keeps
  // extraction state intact for remaining photos.
  const photoData = photo.get();
  const currentHidden = hiddenPhotoIds.get();
  if (!currentHidden.includes(photoData.id)) {
    hiddenPhotoIds.set([...currentHidden, photoData.id]);
  }
});

// Delete correction handler
const deleteCorrection = handler<
  unknown,
  { itemLocations: Cell<Array<Cell<ItemLocation>>>; correction: Cell<ItemLocation> }
>((_event, { itemLocations, correction }) => {
  itemLocations.remove(correction);
});

// Add new item location correction
const addItemLocation = handler<
  unknown,
  {
    itemLocations: Cell<ItemLocation[]>;
    newItemName: Cell<string>;
    newCorrectAisle: Cell<string>;
    newIncorrectAisle: Cell<string>;
  }
>((_event, { itemLocations, newItemName, newCorrectAisle, newIncorrectAisle }) => {
  const itemName = newItemName.get().trim();
  const correctAisle = newCorrectAisle.get().trim();
  const incorrectAisle = newIncorrectAisle.get().trim();

  if (itemName && correctAisle) {
    itemLocations.push({
      itemName,
      correctAisle,
      incorrectAisle: incorrectAisle || undefined,
      timestamp: Date.now(),
    });

    // Clear form fields
    newItemName.set("");
    newCorrectAisle.set("");
    newIncorrectAisle.set("");
  }
});

// Fuzzy matching utilities for intelligent aisle merging

/**
 * Parse description into array of items
 * Handles both bullet lists and comma-separated formats
 */
function parseItems(description: string): string[] {
  if (!description) return [];

  // Split by newlines OR commas
  const parts = description.split(/[\n,]+/);

  return parts
    .map(item => {
      // Remove bullet markers (-, •, *, numbers like "1.")
      return item.replace(/^[\s\-•*]*([\d]+\.)?\s*/, '').trim();
    })
    .filter(item => item.length > 0);
}

/**
 * Normalize item for comparison (lowercase, trim, collapse whitespace)
 */
function normalizeItem(item: string): string {
  return item.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two items match using fuzzy logic:
 * 1. Exact match (after normalization)
 * 2. Substring match
 * 3. Levenshtein distance (≤10% or ≤2 edits)
 */
function matchScore(item1: string, item2: string): boolean {
  const norm1 = normalizeItem(item1);
  const norm2 = normalizeItem(item2);

  // Exact match
  if (norm1 === norm2) return true;

  // Substring match
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Levenshtein match
  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  const threshold = Math.max(2, Math.ceil(maxLength * 0.1)); // 10% or 2 edits minimum

  return distance <= threshold;
}

/**
 * Detect format of description (bullets vs commas)
 */
function detectFormat(description: string): 'bullets' | 'commas' {
  if (!description) return 'bullets'; // Default to bullets

  // Check for bullet markers
  if (/\n[\s\-•*]/.test(description)) {
    return 'bullets';
  }

  return 'commas';
}

/**
 * Format items array back to string
 */
function formatItems(items: string[], format: 'bullets' | 'commas'): string {
  if (format === 'bullets') {
    return items.map(item => `- ${item}`).join('\n');
  } else {
    return items.join(', ');
  }
}

/**
 * Analyze overlap between existing aisle description and suggested products
 * Returns items that overlap and items that are new
 */
interface OverlapAnalysis {
  overlap: Array<{ existing: string; suggested: string }>;
  newItems: string[];
  hasOverlap: boolean;
  hasNewItems: boolean;
}

function analyzeOverlap(existingDesc: string, suggestedProducts: string[]): OverlapAnalysis {
  const existingItems = parseItems(existingDesc);
  const normalizedExisting = new Map(existingItems.map(item => [normalizeItem(item), item]));

  const overlap: Array<{ existing: string; suggested: string }> = [];
  const newItems: string[] = [];

  for (const suggested of suggestedProducts) {
    let foundMatch = false;

    // Check for fuzzy match against all existing items
    for (const [normExisting, originalExisting] of normalizedExisting.entries()) {
      if (matchScore(originalExisting, suggested)) {
        overlap.push({ existing: originalExisting, suggested });
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      newItems.push(suggested);
    }
  }

  return {
    overlap,
    newItems,
    hasOverlap: overlap.length > 0,
    hasNewItems: newItems.length > 0,
  };
}

const StoreMapper = pattern<StoreMapInput, StoreMapOutput>(
  ({ storeName, aisles, specialDepartments, unassignedDepartments, entrances, notInStore, inCenterAisles, itemLocations }) => {
    const uploadedPhotos = cell<ImageData[]>([]);
    const hiddenPhotoIds = cell<string[]>([]); // Track deleted photos without splicing array
    const customDeptName = cell<string>("");
    const entranceCount = computed(() => entrances.length);
    const entrancesComplete = cell<boolean>(false);

    // Helper to check if an entrance position is already used
    const isEntranceUsed = (position: WallPosition) => {
      return derive(entrances, (ents) => ents.some(e => e.position === position));
    };

    // Form fields for adding item location corrections
    const newItemName = cell<string>("");
    const newCorrectAisle = cell<string>("");
    const newIncorrectAisle = cell<string>("");

    // Track selected items for merge (key: "${photoName}-${aisleName}", value: array of selected item names)
    const selectedMergeItems = cell<Record<string, string[]>>({});

    // Process uploaded photos
    // Note: Photos are NOT auto-deleted after "Add All" to prevent the photo extraction
    // reset bug. When uploadedPhotos array changes, this .map() re-evaluates and creates
    // new generateObject calls, resetting all photos to "Analyzing...". Users can manually
    // delete photos using the delete button.
    const photoExtractions = uploadedPhotos.map((photo, photoIndex) => {
      const extraction = generateObject({
        system:
          'You are analyzing photos from a grocery store. Your task is to extract ALL visible aisle signs and return them as JSON.\n\nIMPORTANT: You MUST return a JSON object with an "aisles" array, even if you only see one aisle or partial information.\n\nFor each aisle sign you see:\n- Extract ONLY the aisle number (e.g., "8", "12", "5A", "5B") - DO NOT include the word "Aisle"\n- Extract each product category as a separate item in the products array\n- Include partially visible signs - do your best to read them\n\nExample output:\n{\n  "aisles": [\n    {"name": "8", "products": ["Bread", "Cereal", "Coffee"]},\n    {"name": "9", "products": ["Snacks", "Chips"]}\n  ]\n}',
        prompt: derive(photo, (p) => {
          // Safety check: photo might be undefined after deletion
          if (!p || !p.data) return [];
          return [
            { type: "image" as const, image: p.data },
            {
              type: "text" as const,
              text: "Look at this grocery store photo and extract ALL aisle signs you can see. Return a JSON object with an 'aisles' array containing objects with 'name' (just the number like '5' or '5A', NOT 'Aisle 5') and 'products' (array of strings) fields. Each product category should be a separate item in the products array. Read any text on hanging signs, endcaps, or aisle markers.",
            },
          ];
        }),
        schema: {
          type: "object",
          properties: {
            aisles: {
              type: "array",
              description: "List of aisles detected in the photo",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Aisle number only (e.g., '8', '5A', '12') - do NOT include the word 'Aisle'",
                  },
                  products: {
                    type: "array",
                    description: "Array of product categories in this aisle",
                    items: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
        model: "anthropic:claude-sonnet-4-5",
      });

      // Debug: Track pending state changes
      const pendingDebug = derive(extraction.pending, (pending) => {
        console.log(`[EXTRACTION ${photoIndex}] Photo ${photo.name} pending:`, pending, `at ${new Date().toISOString()}`);
        return pending;
      });

      return {
        photo: photo, // Include photo reference for deletion
        photoName: photo.name,
        extractedAisles: derive(extraction.result, (result) => {
          // Debug: log what we're receiving (stringify to see actual data)
          console.log(`[EXTRACTION ${photoIndex}] Photo ${photo.name} result:`, JSON.stringify(result, null, 2));
          console.log(`[EXTRACTION ${photoIndex}] Photo ${photo.name} aisles:`, result?.aisles);

          // Ensure we always have a valid structure with aisles array
          // generateObject may return {} instead of {aisles: []} on empty results
          return {
            aisles: (result && result.aisles) || []
          };
        }),
        pending: pendingDebug,
      };
    });

    // Derive formatted outline for export
    const outline = derive(
      { storeName, aisles, departments: specialDepartments },
      ({ storeName, aisles, departments }) => {
        const lines: string[] = [];

        // Add center aisles
        aisles.forEach((aisle) => {
          const header = `# Aisle ${aisle.name}`;  // Add "Aisle" prefix for export
          const desc = aisle.description || "(no description)";
          lines.push(`${header}\n${desc}`);
        });

        // Add special departments
        departments.forEach((dept) => {
          const header = `# ${dept.name} (${dept.location})`;
          const desc = dept.description || "(no description)";
          lines.push(`${header}\n${desc}`);
        });

        return lines.join("\n\n");
      }
    );

    // Counts for display
    const aisleCount = computed(() => aisles.length);
    const departmentCount = computed(() => specialDepartments.length);

    // Compute total non-conflicting aisles across all photos
    const totalNonConflictingAisles = computed(() => {
      const currentAisles = aisles;
      let totalCount = 0;

      photoExtractions.forEach((extraction) => {
        const pending = extraction.pending;
        const extractedData = extraction.extractedAisles;

        // Skip if still analyzing or no results
        if (pending || !extractedData || !extractedData.aisles || extractedData.aisles.length === 0) {
          return;
        }

        // Get valid aisles from this photo
        const validAisles = extractedData.aisles.filter(
          (a: any) => a && a.name && a.products && Array.isArray(a.products)
        );

        // Count non-conflicting aisles
        const nonConflictCount = validAisles.filter((extracted: any) => {
          return !currentAisles.some(
            (existing) =>
              existing.name.trim().toLowerCase() === extracted.name.trim().toLowerCase()
          );
        }).length;

        totalCount += nonConflictCount;
      });

      return totalCount;
    });

    // Compute batch data: all non-conflicting aisles to add from all photos
    const batchAllPhotosData = computed(() => {
      const currentAisles = aisles;
      const aislesToAdd: Array<{ name: string; description: string }> = [];

      photoExtractions.forEach((extraction) => {
        const pending = extraction.pending;
        const extractedData = extraction.extractedAisles;

        // Skip if still analyzing or no results
        if (pending || !extractedData || !extractedData.aisles || extractedData.aisles.length === 0) {
          return;
        }

        // Get valid aisles from this photo
        const validAisles = extractedData.aisles.filter(
          (a: any) => a && a.name && a.products && Array.isArray(a.products)
        );

        // Filter to only non-conflicting aisles
        const nonConflicting = validAisles.filter((extracted: any) => {
          return !currentAisles.some(
            (existing) =>
              existing.name.trim().toLowerCase() === extracted.name.trim().toLowerCase()
          );
        });

        // Collect aisles to add with markdown bullets
        nonConflicting.forEach((aisle: any) => {
          const description = aisle.products && aisle.products.length > 0
            ? aisle.products.map((p: string) => `- ${p}`).join('\n')
            : '';

          aislesToAdd.push({
            name: aisle.name,
            description,
          });
        });
      });

      return { aislesToAdd, photosToDelete: [] };
    });

    // Boxing pattern for sorting: wrap aisles to preserve cell references
    // 1. Box the aisles
    const boxedAisles = aisles.map(aisle => ({ aisle }));

    // 2. Sort boxed aisles lexicographically with natural number handling
    const sortedBoxedAisles = derive(boxedAisles, (boxed) => {
      return boxed.slice().sort((a, b) =>
        a.aisle.name.localeCompare(b.aisle.name, undefined, { numeric: true })
      );
    });
    const totalSections = derive(
      [aisleCount, departmentCount],
      ([a, d]) => a + d
    );
    const unassignedCount = computed(() => unassignedDepartments.length);

    // Gap detection for numbered aisles
    const detectedGaps = computed(() => {
      const numbered = (aisles as unknown as StoreAisle[])
        .map((a) => a.name.match(/^(\d+)/)?.[1])  // Extract just leading digits from name like "5" or "5A"
        .filter(Boolean)
        .map((n) => parseInt(n!))
        .sort((a, b) => a - b);

      const gaps: string[] = [];
      for (let i = 0; i < numbered.length - 1; i++) {
        for (
          let missing = numbered[i] + 1;
          missing < numbered[i + 1];
          missing++
        ) {
          gaps.push(`${missing}`);  // Store just the number (e.g., "6" not "Aisle 6")
        }
      }
      return gaps;
    });

    // Pre-compute aisle names for LLM prompt (avoid .map() inside derive)
    const aisleNamesForLLM = computed(() =>
      (aisles as unknown as StoreAisle[]).map((a) => `Aisle ${a.name}`).join("\n") || "(none)"
    );

    // LLM suggestions for common sections
    const commonSectionsLLM = llm({
      system: `Analyze this grocery store map and suggest common sections that might be missing.

Common sections: Produce, Bakery, Deli, Meat/Butcher, Dairy, Frozen Foods, Pharmacy

CRITICAL:
- Do NOT suggest numbered aisles (gaps are detected separately)
- Do NOT suggest anything in "Not in Store" list
- For items in "In Center Aisles" list: ONLY suggest IF no aisle name contains that department
- Return max 3 common section suggestions
- Format: One per line, just the name (e.g., "Bakery" or "Deli Counter")
- If nothing missing, return empty`,

      messages: derive(
        { name: storeName, aisleNames: aisleNamesForLLM, excluded: notInStore, centerAisleDepts: inCenterAisles },
        ({ name, aisleNames, excluded, centerAisleDepts }) => [
          {
            role: "user" as const,
            content: `Store: ${name || "Unknown"}

Aisles:
${aisleNames}

Not in Store: ${excluded.join(", ") || "None"}

In Center Aisles (suggest ONLY if not in any aisle name above): ${centerAisleDepts.join(", ") || "None"}

What common sections might be missing?`,
          },
        ]
      ),
      model: "anthropic:claude-sonnet-4-5",
    });

    const llmSuggestions = computed(() => {
      const result = commonSectionsLLM.result as unknown as string | null;
      if (!result || typeof result !== "string") return [];
      return result
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && s.length > 0);
    });

    // Pre-compute JSX for detected gaps (cannot .map() over derive results in JSX)
    // Inside computed(), reactive values are auto-unwrapped, so detectedGaps is already a plain array
    const detectedGapsButtons = computed(() => {
      const gaps = detectedGaps as unknown as string[];
      return gaps.map((gapName: string, index: number) => (
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            className="suggestion-btn suggestion-btn-gap"
            onClick={addFromSuggestion({
              aisles,
              suggestions: detectedGaps,
              index,
            })}
          >
            + {gapName}
          </button>
          <button
            className="suggestion-dismiss-btn"
            onClick={dismissSuggestion({
              notInStore,
              suggestions: detectedGaps,
              index,
            })}
          >
            ×
          </button>
        </div>
      ));
    });

    // Pre-compute JSX for LLM suggestions (cannot .map() over derive results in JSX)
    // Inside computed(), reactive values are auto-unwrapped, so llmSuggestions is already a plain array
    const llmSuggestionsButtons = computed(() => {
      const suggestions = llmSuggestions as unknown as string[];
      return suggestions.map((suggestion: string, index: number) => (
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            className="suggestion-btn"
            onClick={addFromSuggestion({
              aisles,
              suggestions: llmSuggestions,
              index,
            })}
          >
            + {suggestion}
          </button>
          <button
            className="suggestion-dismiss-btn"
            onClick={dismissSuggestion({
              notInStore,
              suggestions: llmSuggestions,
              index,
            })}
          >
            ×
          </button>
        </div>
      ));
    });

    // Group assigned departments by wall (handles both basic and granular positions)
    const departmentsByWall = computed(() => {
      const byWall: Record<string, DepartmentRecord[]> = {
        front: [],
        back: [],
        left: [],
        right: [],
      };

      for (const dept of specialDepartments) {
        if (dept.location) {
          // Extract the main wall from granular positions (e.g., "front-left" -> "front")
          const mainWall = dept.location.split('-')[0] as "front" | "back" | "left" | "right";
          if (byWall[mainWall]) {
            byWall[mainWall].push(dept);
          }
        }
      }

      return byWall;
    });

    // Filter unassigned to exclude dismissed departments and those in center aisles
    const visibleUnassigned = computed(() => {
      return unassignedDepartments.filter(
        (name) => !notInStore.includes(name) && !inCenterAisles.includes(name)
      );
    });

    // Helpers for conditional rendering
    const hasGaps = derive(detectedGaps, (gaps) => gaps.length > 0);
    const hasLLMSuggestions = derive(
      llmSuggestions,
      (sugs) => sugs.length > 0
    );
    const hasNotInStore = computed(() => notInStore.length > 0);
    const hasUnassigned = computed(() => visibleUnassigned.length > 0);
    const hasAssigned = computed(() => specialDepartments.length > 0);
    const visibleUnassignedCount = computed(() => visibleUnassigned.length);
    const llmPending = commonSectionsLLM.pending;
    const hasCorrections = computed(() => itemLocations.length > 0);
    const correctionsCount = computed(() => itemLocations.length);

    return {
      [NAME]: str`🗺️ ${derive(storeName, (name) => name || "(Untitled map)")}`,
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
          <style>{`
            @media (max-width: 768px) {
              /* Mobile-specific overrides */
              ct-input {
                font-size: 16px !important; /* Prevent zoom on iOS */
              }

              ct-button {
                -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
                touch-action: manipulation;
              }
            }

            /* Wall color scheme */
            .wall-label-front { color: #3b82f6; }
            .wall-label-back { color: #f97316; }
            .wall-label-left { color: #10b981; }
            .wall-label-right { color: #a855f7; }

            ct-button.wall-btn-front::part(button) {
              background-color: #eff6ff;
              color: #1e40af;
              border-color: #3b82f6;
            }
            ct-button.wall-btn-back::part(button) {
              background-color: #fff7ed;
              color: #c2410c;
              border-color: #f97316;
            }
            ct-button.wall-btn-left::part(button) {
              background-color: #f0fdf4;
              color: #047857;
              border-color: #10b981;
            }
            ct-button.wall-btn-right::part(button) {
              background-color: #faf5ff;
              color: #7e22ce;
              border-color: #a855f7;
            }

            .wall-display-front {
              background: #eff6ff !important;
              border: 1px solid #3b82f6 !important;
            }
            .wall-display-back {
              background: #fff7ed !important;
              border: 1px solid #f97316 !important;
            }
            .wall-display-left {
              background: #f0fdf4 !important;
              border: 1px solid #10b981 !important;
            }
            .wall-display-right {
              background: #faf5ff !important;
              border: 1px solid #a855f7 !important;
            }

            /* Suggestion button styles */
            .suggestion-btn {
              font-size: 13px;
              padding: 8px 14px;
              background: #3b82f6;
              color: white;
              border: none;
              borderRadius: 6px;
              cursor: pointer;
              font-weight: 500;
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
              transition: all 0.2s ease;
            }
            .suggestion-btn:hover {
              background: #2563eb;
              transform: translateY(-1px);
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }

            .suggestion-btn-gap {
              background: #f97316;
            }
            .suggestion-btn-gap:hover {
              background: #ea580c;
            }

            .suggestion-dismiss-btn {
              font-size: 16px;
              padding: 6px 10px;
              background: #f3f4f6;
              color: #6b7280;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              line-height: 1;
              transition: all 0.2s ease;
            }
            .suggestion-dismiss-btn:hover {
              background: #ef4444;
              color: white;
              border-color: #ef4444;
            }
          `}</style>
          {/* Header */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "24px" }}>
              🗺️ Store Map v2
            </h2>
            <ct-input
              $value={storeName}
              placeholder="Enter store name (e.g., Kroger Main St)"
              style="font-size: 16px; font-weight: 500;"
            />
            <div
              style={{ marginTop: "0.5rem", fontSize: "13px", color: "#666" }}
            >
              {totalSections} sections ({aisleCount} aisles, {departmentCount}{" "}
              departments) • {entranceCount}{" "}
              {derive(entranceCount, (c) =>
                c === 1 ? "entrance" : "entrances"
              )}
            </div>
          </div>

          {/* Entrance Markers */}
          <div
            style={{
              marginBottom: "2rem",
              padding: "1rem",
              background: "#fef3c7",
              border: "1px solid #fbbf24",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
              }}
            >
              <h3
                style={{
                  margin: "0",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#92400e",
                }}
              >
                🚪 Store Entrances
              </h3>
              {ifElse(
                entrancesComplete,
                <ct-button
                  size="sm"
                  variant="default"
                  onClick={toggleEntrancesComplete({ entrancesComplete })}
                  style={{
                    fontSize: "12px",
                    padding: "4px 10px",
                    minHeight: "28px",
                  }}
                >
                  ✓ Entrances Complete ({entranceCount})
                </ct-button>,
                null
              )}
            </div>
            {ifElse(
              entrancesComplete,
              null,
              <div
                style={{
                  fontSize: "13px",
                  color: "#78350f",
                  marginBottom: "1rem",
                }}
              >
                Mark where customer entrances are located:
              </div>
            )}

            {/* Entrance buttons - granular positioning (hidden when complete) */}
            {ifElse(
              entrancesComplete,
              null,
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "1rem" }}>
              {/* Front Wall */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#3b82f6" }}>
                  Front:
                </div>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-front"
                  disabled={isEntranceUsed("front-left")}
                  onClick={addEntrance({ entrances, position: "front-left", name: "Front-Left Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Left
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-front"
                  disabled={isEntranceUsed("front-center")}
                  onClick={addEntrance({ entrances, position: "front-center", name: "Front-Center Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Center
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-front"
                  disabled={isEntranceUsed("front-right")}
                  onClick={addEntrance({ entrances, position: "front-right", name: "Front-Right Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Right
                </ct-button>
              </div>

              {/* Back Wall */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#f97316" }}>
                  Back:
                </div>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-back"
                  disabled={isEntranceUsed("back-left")}
                  onClick={addEntrance({ entrances, position: "back-left", name: "Back-Left Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Left
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-back"
                  disabled={isEntranceUsed("back-center")}
                  onClick={addEntrance({ entrances, position: "back-center", name: "Back-Center Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Center
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-back"
                  disabled={isEntranceUsed("back-right")}
                  onClick={addEntrance({ entrances, position: "back-right", name: "Back-Right Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Right
                </ct-button>
              </div>

              {/* Left Wall */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#10b981" }}>
                  Left:
                </div>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-left"
                  disabled={isEntranceUsed("left-front")}
                  onClick={addEntrance({ entrances, position: "left-front", name: "Left-Front Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Front
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-left"
                  disabled={isEntranceUsed("left-center")}
                  onClick={addEntrance({ entrances, position: "left-center", name: "Left-Center Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Center
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-left"
                  disabled={isEntranceUsed("left-back")}
                  onClick={addEntrance({ entrances, position: "left-back", name: "Left-Back Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Back
                </ct-button>
              </div>

              {/* Right Wall */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#a855f7" }}>
                  Right:
                </div>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-right"
                  disabled={isEntranceUsed("right-front")}
                  onClick={addEntrance({ entrances, position: "right-front", name: "Right-Front Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Front
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-right"
                  disabled={isEntranceUsed("right-center")}
                  onClick={addEntrance({ entrances, position: "right-center", name: "Right-Center Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Center
                </ct-button>
                <ct-button
                  size="sm"
                  variant="outline"
                  className="wall-btn-right"
                  disabled={isEntranceUsed("right-back")}
                  onClick={addEntrance({ entrances, position: "right-back", name: "Right-Back Entrance" })}
                  style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                >
                  Back
                </ct-button>
              </div>
            </div>
            )}

            {/* "No more entrances" button - show when at least one entrance added AND not yet complete */}
            {ifElse(
              entrancesComplete,
              null,
              ifElse(
                derive(entranceCount, (c) => c > 0),
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                  <ct-button
                    size="sm"
                    variant="secondary"
                    onClick={toggleEntrancesComplete({ entrancesComplete })}
                    style={{
                      fontSize: "13px",
                      padding: "8px 16px",
                      minHeight: "36px",
                    }}
                  >
                    ✓ No More Entrances
                  </ct-button>
                </div>,
                null
              )
            )}

            {/* Show added entrances */}
            {ifElse(
              derive(entranceCount, (c) => c > 0),
              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#92400e",
                    marginBottom: "0.5rem",
                  }}
                >
                  Added Entrances ({entranceCount}):
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  {entrances.map((entrance: OpaqueRef<Entrance>) => {
                    // Determine color based on wall position
                    const wallColorClass = derive(entrance.position, (pos) => {
                      if (pos.startsWith("front")) return "wall-display-front";
                      if (pos.startsWith("back")) return "wall-display-back";
                      if (pos.startsWith("left")) return "wall-display-left";
                      if (pos.startsWith("right")) return "wall-display-right";
                      return "";
                    });

                    return (
                      <div
                        className={wallColorClass}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          fontSize: "13px",
                          minHeight: "36px",
                        }}
                      >
                        <span style={{ fontWeight: "600" }}>
                          {derive(entrance, e => e.position)}
                        </span>
                        <ct-button
                          size="sm"
                          variant="destructive"
                          onClick={removeEntrance({ entrances, entrance })}
                          style={{
                            fontSize: "12px",
                            padding: "4px 8px",
                            minWidth: "unset",
                            minHeight: "28px",
                          }}
                        >
                          ×
                        </ct-button>
                      </div>
                    );
                  })}
                </div>
              </div>,
              null
            )}
          </div>

          {/* Corrections Management Section */}
          <div
            style={{
              marginBottom: "2rem",
              padding: "1rem",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
            }}
          >
            <h3
              style={{
                margin: "0 0 0.75rem 0",
                fontSize: "14px",
                fontWeight: "600",
                color: "#166534",
              }}
            >
              ✓ Item Location Corrections {ifElse(
                hasCorrections,
                <span>({correctionsCount})</span>,
                null
              )}
            </h3>
            <div
              style={{
                fontSize: "13px",
                color: "#166534",
                marginBottom: "1rem",
              }}
            >
              Track items that are in different aisles than expected:
            </div>

            {/* Add new correction form */}
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                background: "white",
                border: "1px solid #86efac",
                borderRadius: "4px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "600", color: "#166534", marginBottom: "0.5rem" }}>
                Add New Correction:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <ct-input
                  $value={newItemName}
                  placeholder="Item name (e.g., coffee)"
                  style="font-size: 13px;"
                />
                <ct-input
                  $value={newCorrectAisle}
                  placeholder="Correct aisle (e.g., Aisle 9 - Coffee & Seafood)"
                  style="font-size: 13px;"
                />
                <ct-input
                  $value={newIncorrectAisle}
                  placeholder="Incorrect aisle (optional)"
                  style="font-size: 13px;"
                />
                <ct-button
                  size="sm"
                  variant="default"
                  onClick={addItemLocation({
                    itemLocations,
                    newItemName,
                    newCorrectAisle,
                    newIncorrectAisle,
                  })}
                  style={{
                    fontSize: "13px",
                    padding: "8px 16px",
                    alignSelf: "flex-start",
                  }}
                >
                  + Add Correction
                </ct-button>
              </div>
            </div>

            {/* Existing corrections list */}
            {ifElse(
              hasCorrections,
              <div>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#166534", marginBottom: "0.5rem" }}>
                  Saved Corrections ({correctionsCount}):
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {itemLocations.map((correction: OpaqueRef<ItemLocation>) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "white",
                      border: "1px solid #86efac",
                      borderRadius: "4px",
                      fontSize: "13px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "600", color: "#166534", marginBottom: "2px" }}>
                        {derive(correction, c => c.itemName)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {derive(correction, c =>
                          c.incorrectAisle
                            ? `Was in ${c.incorrectAisle} → Now in ${c.correctAisle}`
                            : `Located in ${c.correctAisle}`
                        )}
                      </div>
                    </div>
                    <ct-button
                      size="sm"
                      variant="destructive"
                      onClick={deleteCorrection({ itemLocations, correction })}
                      style={{
                        fontSize: "12px",
                        padding: "4px 8px",
                        minWidth: "unset",
                        minHeight: "28px",
                      }}
                    >
                      × Delete
                    </ct-button>
                  </div>
                  ))}
                </div>
              </div>,
              null
            )}
          </div>

          {/* Unassigned Departments - NEW WORKFLOW! */}
          {ifElse(
            hasUnassigned,
            <div
              style={{
                marginBottom: "2rem",
                padding: "1rem",
                background: "#f0f9ff",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
              }}
            >
              <h3
                style={{
                  margin: "0 0 0.75rem 0",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#1e40af",
                }}
              >
                🏪 Assign Perimeter Departments ({visibleUnassignedCount})
              </h3>
              <div
                style={{
                  fontSize: "13px",
                  color: "#475569",
                  marginBottom: "1rem",
                }}
              >
                Choose which wall each department is on, or mark N/A if not in this store:
              </div>

              {/* Add custom department */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                  alignItems: "center",
                }}
              >
                <ct-input
                  $value={customDeptName}
                  placeholder="Add custom department..."
                  style="flex: 1; font-size: 13px;"
                />
                <ct-button
                  size="sm"
                  variant="secondary"
                  onClick={addCustomDepartment({
                    unassignedDepartments,
                    customDeptName,
                  })}
                >
                  + Add
                </ct-button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {visibleUnassigned.map((deptName) => {
                  const deptInfo = DEFAULT_DEPARTMENTS.find(
                    (d) => d.name === deptName
                  ) || { name: deptName, icon: "🏪" };

                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          width: "140px",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {deptInfo.icon} {deptName}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {/* Front Wall */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#3b82f6" }}>
                            Front:
                          </div>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-front"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "front-left",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Left
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-front"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "front-center",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Center
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-front"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "front-right",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Right
                          </ct-button>
                        </div>

                        {/* Back Wall */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#f97316" }}>
                            Back:
                          </div>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-back"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "back-left",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Left
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-back"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "back-center",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Center
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-back"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "back-right",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Right
                          </ct-button>
                        </div>

                        {/* Left Wall */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#10b981" }}>
                            Left:
                          </div>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-left"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "left-front",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Front
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-left"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "left-center",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Center
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-left"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "left-back",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Back
                          </ct-button>
                        </div>

                        {/* Right Wall */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#a855f7" }}>
                            Right:
                          </div>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-right"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "right-front",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Front
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-right"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "right-center",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Center
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="outline"
                            className="wall-btn-right"
                            onClick={assignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              departmentName: deptName,
                              location: "right-back",
                              icon: deptInfo.icon,
                            })}
                            style="font-size: 13px; padding: 6px 12px; min-height: 36px;"
                          >
                            Back
                          </ct-button>
                        </div>

                        {/* N/A and Normal Aisle options */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                          <div style={{ width: "70px", fontSize: "12px", fontWeight: "600", color: "#666" }}>
                          </div>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={markAsNormalAisle({
                              unassignedDepartments,
                              inCenterAisles,
                              departmentName: deptName,
                            })}
                            style={{
                              fontSize: "13px",
                              padding: "6px 12px",
                              minHeight: "36px",
                              color: "#1e40af",
                            }}
                          >
                            Normal Aisle
                          </ct-button>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={dismissDepartment({
                              unassignedDepartments,
                              notInStore,
                              departmentName: deptName,
                            })}
                            style={{
                              fontSize: "13px",
                              padding: "6px 12px",
                              minHeight: "36px",
                              color: "#666",
                            }}
                          >
                            Not in Store
                          </ct-button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>,
            null
          )}

          {/* Assigned Departments - Grouped by Wall */}
          {ifElse(
            hasAssigned,
            <div style={{ marginBottom: "2rem" }}>
              <h3
                style={{
                  margin: "0 0 0.75rem 0",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                Assigned Perimeter Departments ({departmentCount})
              </h3>

              {/* Front Wall */}
              {ifElse(
                derive(
                  departmentsByWall,
                  (byWall) => byWall.front.length > 0
                ),
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Front Wall:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    {specialDepartments
                      .filter((dept) => derive(dept, d => d.location.startsWith("front")))
                      .map((dept: OpaqueRef<DepartmentRecord>) => (
                        <div
                          className="wall-display-front"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            minHeight: "36px",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600" }}>
                              {derive(dept, d => `${d.icon} ${d.name}`)}
                            </div>
                            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                              {derive(dept, d => d.location)}
                            </div>
                          </div>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={unassignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              department: dept,
                            })}
                            style={{
                              fontSize: "12px",
                              padding: "4px 8px",
                              minWidth: "unset",
                              minHeight: "28px",
                            }}
                          >
                            ×
                          </ct-button>
                        </div>
                      ))}
                  </div>
                </div>,
                null
              )}

              {/* Back Wall */}
              {ifElse(
                derive(
                  departmentsByWall,
                  (byWall) => byWall.back.length > 0
                ),
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Back Wall:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    {specialDepartments
                      .filter((dept) => derive(dept, d => d.location.startsWith("back")))
                      .map((dept: OpaqueRef<DepartmentRecord>) => (
                        <div
                          className="wall-display-back"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            minHeight: "36px",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600" }}>
                              {derive(dept, d => `${d.icon} ${d.name}`)}
                            </div>
                            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                              {derive(dept, d => d.location)}
                            </div>
                          </div>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={unassignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              department: dept,
                            })}
                            style={{
                              fontSize: "12px",
                              padding: "4px 8px",
                              minWidth: "unset",
                              minHeight: "28px",
                            }}
                          >
                            ×
                          </ct-button>
                        </div>
                      ))}
                  </div>
                </div>,
                null
              )}

              {/* Left Wall */}
              {ifElse(
                derive(
                  departmentsByWall,
                  (byWall) => byWall.left.length > 0
                ),
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Left Wall:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    {specialDepartments
                      .filter((dept) => derive(dept, d => d.location.startsWith("left")))
                      .map((dept: OpaqueRef<DepartmentRecord>) => (
                        <div
                          className="wall-display-left"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            minHeight: "36px",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600" }}>
                              {derive(dept, d => `${d.icon} ${d.name}`)}
                            </div>
                            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                              {derive(dept, d => d.location)}
                            </div>
                          </div>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={unassignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              department: dept,
                            })}
                            style={{
                              fontSize: "12px",
                              padding: "4px 8px",
                              minWidth: "unset",
                              minHeight: "28px",
                            }}
                          >
                            ×
                          </ct-button>
                        </div>
                      ))}
                  </div>
                </div>,
                null
              )}

              {/* Right Wall */}
              {ifElse(
                derive(
                  departmentsByWall,
                  (byWall) => byWall.right.length > 0
                ),
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Right Wall:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    {specialDepartments
                      .filter((dept) => derive(dept, d => d.location.startsWith("right")))
                      .map((dept: OpaqueRef<DepartmentRecord>) => (
                        <div
                          className="wall-display-right"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            minHeight: "36px",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "600" }}>
                              {derive(dept, d => `${d.icon} ${d.name}`)}
                            </div>
                            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                              {derive(dept, d => d.location)}
                            </div>
                          </div>
                          <ct-button
                            size="sm"
                            variant="ghost"
                            onClick={unassignDepartment({
                              specialDepartments,
                              unassignedDepartments,
                              department: dept,
                            })}
                            style={{
                              fontSize: "12px",
                              padding: "4px 8px",
                              minWidth: "unset",
                              minHeight: "28px",
                            }}
                          >
                            ×
                          </ct-button>
                        </div>
                      ))}
                  </div>
                </div>,
                null
              )}
            </div>,
            null
          )}

          {/* Center Aisles List */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3
              style={{
                margin: "0 0 0.75rem 0",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Center Aisles (Numbered) - {aisleCount} total
            </h3>
          </div>

          <ct-vstack gap="4">
            {sortedBoxedAisles.map(({ aisle }) => (
              <div
                style={{
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  padding: "1rem",
                  background: "white",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: "500", marginRight: "8px" }}>
                    Aisle
                  </div>
                  <ct-input
                    $value={aisle.name}
                    placeholder="e.g., 5 or 5A"
                    pattern="^\d+[A-Za-z]?$"
                    title="Enter a positive number with optional single letter (e.g., 5, 5A, 12B)"
                    style="flex: 1; font-weight: 500;"
                  />
                  <ct-button
                    variant="destructive"
                    size="sm"
                    onClick={removeAisle({ aisles, aisle })}
                  >
                    ×
                  </ct-button>
                </div>

                <ct-code-editor
                  $value={aisle.description}
                  placeholder="What's in this aisle? (e.g., Fruits, vegetables, salads, herbs)"
                  language="text/markdown"
                  theme="light"
                  wordWrap
                  style="min-height: 60px; border: 1px solid #e0e0e0; border-radius: 4px;"
                />
              </div>
            ))}

            {/* Add aisle buttons */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <ct-button onClick={addAisle({ aisles })}>+ Add Aisle</ct-button>

              <ct-image-input
                multiple
                maxImages={50}
                maxSizeBytes={4000000}
                showPreview={false}
                buttonText="📷 Scan Aisle Signs"
                variant="secondary"
                $images={uploadedPhotos}
              />
            </div>
          </ct-vstack>

          {/* Photo Extraction Results */}
          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem 0",
                fontSize: "14px",
                fontWeight: "600",
                color: "#166534",
              }}
            >
              📸 Photo Analysis Results
            </h3>
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                marginBottom: "1rem",
                fontStyle: "italic",
              }}
            >
              Upload photos of aisle signs (up to 50). Each photo will be analyzed and results shown below:
            </div>
            {/* Batch add all button */}
            {ifElse(
              derive(totalNonConflictingAisles, (count) => count > 0),
              <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
                <ct-button
                  variant="default"
                  onClick={batchAddAllPhotosNonConflicting({
                    aisles,
                    uploadedPhotos,
                    batchData: batchAllPhotosData,
                  })}
                  style={{
                    fontWeight: "600",
                    padding: "8px 16px",
                  }}
                >
                  + Add All {totalNonConflictingAisles} New Aisles from All Photos
                </ct-button>
              </div>,
              null
            )}
            <ct-vstack gap="4">
              {photoExtractions.map((extraction) => {
                // Check if this photo is hidden
                const photoId = extraction.photo.id;
                const isHidden = computed(() => hiddenPhotoIds.get().includes(photoId));

                return ifElse(
                  isHidden,
                  null, // Don't render if hidden
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "white",
                      borderRadius: "6px",
                      border: "1px solid #86efac",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#166534",
                        marginBottom: "0.5rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>📷 {extraction.photoName}</span>
                      <ct-button
                        size="sm"
                        variant="destructive"
                        onClick={deletePhoto({ hiddenPhotoIds, photo: extraction.photo })}
                        style={{
                          fontSize: "11px",
                          padding: "2px 6px",
                          minWidth: "unset",
                        }}
                      >
                        🗑️ Delete
                      </ct-button>
                    </div>
                  {derive(
                    { pending: extraction.pending, extractedData: extraction.extractedAisles, currentAisles: aisles },
                    ({ pending, extractedData, currentAisles }) => {
                      // Track ALL reactive inputs - this re-evaluates whenever ANY change

                      // Show pending state while analyzing
                      if (pending) {
                        return (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#16a34a",
                              fontStyle: "italic",
                            }}
                          >
                            Analyzing photo...
                          </div>
                        );
                      }

                      // Check if we have results after analysis completes
                      if (
                        !extractedData ||
                        !extractedData.aisles ||
                        extractedData.aisles.length === 0
                      ) {
                        return (
                          <div style={{ fontSize: "12px", color: "#999" }}>
                            No aisles detected
                          </div>
                        );
                      }

                      // Compute conflict counts
                      const validAisles = extractedData.aisles.filter(
                        (a: any) => a && a.name && a.products && Array.isArray(a.products)
                      );
                      const conflictCount = validAisles.filter((extracted: any) =>
                        currentAisles.some(
                          (existing) =>
                            existing.name.trim().toLowerCase() ===
                            extracted.name.trim().toLowerCase()
                        )
                      ).length;
                      const nonConflictCount = validAisles.length - conflictCount;

                      // Show the extracted aisles
                      return (
                        <div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#166534",
                              marginBottom: "0.5rem",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              Found {extractedData.aisles.length}{" "}
                              {extractedData.aisles.length === 1
                                ? "aisle"
                                : "aisles"}
                              {conflictCount > 0 ? (
                                <span style={{ color: "#92400e", fontWeight: "600", marginLeft: "0.5rem" }}>
                                  ({nonConflictCount} new, {conflictCount} conflict{conflictCount === 1 ? "" : "s"})
                                </span>
                              ) : null}
                            </div>
                            {nonConflictCount > 0 ? (
                              <ct-button
                                size="sm"
                                variant="default"
                                onClick={batchAddNonConflicting({
                                  aisles,
                                  extractedAisles: validAisles,
                                  uploadedPhotos,
                                  photo: extraction.photo,
                                  hiddenPhotoIds,
                                })}
                                style={{
                                  fontSize: "11px",
                                  padding: "4px 10px",
                                  fontWeight: "600",
                                }}
                              >
                                + Add All {nonConflictCount} New
                              </ct-button>
                            ) : <></>}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.5rem",
                            }}
                          >
                            {validAisles.map(
                              (extractedAisle: any, idx: number) => {
                                // Find matching aisle by number (with normalization for whitespace)
                                const matchingAisle = currentAisles.find(
                                  (a) =>
                                    a.name.trim().toLowerCase() ===
                                    extractedAisle.name.trim().toLowerCase()
                                );

                                // If there's a matching aisle, perform overlap analysis
                                const overlapAnalysis = matchingAisle
                                  ? analyzeOverlap(
                                      matchingAisle.description || '',
                                      extractedAisle.products || []
                                    )
                                  : null;

                                return (
                                  <div
                                    style={{
                                      padding: "8px",
                                      background: matchingAisle
                                        ? "#fff9ec"
                                        : "#f0fdf4",
                                      border: matchingAisle
                                        ? "1px solid #fbbf24"
                                        : "1px solid #86efac",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                    }}
                                  >
                                    {matchingAisle && overlapAnalysis ? (
                                      // Aisle exists - show overlap analysis
                                      <div>
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            color: "#92400e",
                                            marginBottom: "6px",
                                            fontSize: "12px",
                                          }}
                                        >
                                          Aisle {extractedAisle.name} (matches existing aisle)
                                        </div>

                                        {overlapAnalysis && overlapAnalysis.hasOverlap && overlapAnalysis.overlap && overlapAnalysis.overlap.length > 0 ? (
                                          <div style={{ marginBottom: "4px" }}>
                                            <div style={{ color: "#059669", fontSize: "10px", marginBottom: "2px" }}>
                                              ✓ Already in aisle: {overlapAnalysis.overlap.filter(o => o && o.suggested).map(o => o.suggested).join(', ')}
                                            </div>
                                          </div>
                                        ) : <></>}

                                        {overlapAnalysis && overlapAnalysis.hasNewItems && overlapAnalysis.newItems && overlapAnalysis.newItems.length > 0 ? (
                                          <div style={{ marginBottom: "4px" }}>
                                            <div style={{ color: "#166534", fontSize: "10px", marginBottom: "4px", fontWeight: "600" }}>
                                              Select items to add:
                                            </div>
                                            {overlapAnalysis.newItems.filter(item => item).map((item) => {
                                              const selKey = `${extraction.photoName}-${extractedAisle.name}`;
                                              // Use derive to access cell state
                                              const isChecked = derive(selectedMergeItems, (selections: Record<string, string[]>) => {
                                                const selected = selections[selKey] || overlapAnalysis.newItems;
                                                return selected.includes(item);
                                              });

                                              return (
                                                <label style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px", cursor: "pointer" }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onClick={toggleMergeItem({
                                                      selectedMergeItems,
                                                      selectionKey: selKey,
                                                      itemName: item,
                                                      allItems: overlapAnalysis.newItems,
                                                    })}
                                                    style={{ cursor: "pointer" }}
                                                  />
                                                  <span style={{ fontSize: "10px", color: "#166534" }}>{item}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        ) : <></>}

                                        {overlapAnalysis && !overlapAnalysis.hasNewItems ? (
                                          <div style={{ color: "#999", fontSize: "10px", fontStyle: "italic" }}>
                                            (all items already in aisle - nothing new to add)
                                          </div>
                                        ) : overlapAnalysis && overlapAnalysis.newItems && overlapAnalysis.newItems.length > 0 ? (
                                          <div style={{ marginTop: "6px", display: "flex", justifyContent: "flex-end" }}>
                                            <ct-button
                                              size="sm"
                                              variant="default"
                                              onClick={mergeExtractedAisle({
                                                aisles,
                                                existingAisle: matchingAisle,
                                                newItems: overlapAnalysis.newItems.filter(item => item),
                                                selectedMergeItems,
                                                selectionKey: `${extraction.photoName}-${extractedAisle.name}`,
                                                hiddenPhotoIds,
                                                photo: extraction.photo,
                                                extractedAisles: validAisles,
                                              })}
                                              style={{
                                                fontSize: "10px",
                                                padding: "4px 8px",
                                              }}
                                            >
                                              + Merge Selected into Aisle {extractedAisle.name}
                                            </ct-button>
                                          </div>
                                        ) : <></>}
                                      </div>
                                    ) : (
                                      // New aisle - show all products
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                        }}
                                      >
                                        <div>
                                          <div
                                            style={{
                                              fontWeight: "600",
                                              color: "#166534",
                                            }}
                                          >
                                            Aisle {extractedAisle.name}
                                          </div>
                                          <div style={{ color: "#666", fontSize: "10px", lineHeight: "1.4" }}>
                                            {extractedAisle.products && extractedAisle.products.length > 0
                                              ? `+ Will add: ${extractedAisle.products.join(', ')}`
                                              : "(no products)"}
                                          </div>
                                        </div>
                                        <ct-button
                                          size="sm"
                                          variant="secondary"
                                          onClick={addExtractedAisle({
                                            aisles,
                                            extractedAisle,
                                          })}
                                          style={{
                                            fontSize: "10px",
                                            padding: "4px 8px",
                                          }}
                                        >
                                          + Add Aisle {extractedAisle.name}
                                        </ct-button>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                  </div>
              ); // Close ifElse
            })}
            </ct-vstack>
          </div>

          {/* Preview section */}
          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: "#f5f5f5",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                📄 Outline Preview
              </h3>
              {ifElse(
                derive(totalSections, (count) => count > 0),
                <ct-button
                  size="sm"
                  variant="secondary"
                  onClick={copyOutline({ outline })}
                  style={{ fontSize: "12px", padding: "4px 12px" }}
                >
                  📋 Copy
                </ct-button>,
                null
              )}
            </div>
            {ifElse(
              derive(totalSections, (count) => count > 0),
              <pre
                style={{
                  fontSize: "12px",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                }}
              >
                {outline}
              </pre>,
              <div
                style={{ fontSize: "13px", color: "#999", fontStyle: "italic" }}
              >
                Add aisles or perimeter departments to see preview
              </div>
            )}
          </div>

          {/* Gap Detection */}
          {ifElse(
            hasGaps,
            <div
              style={{
                marginTop: "2rem",
                padding: "1rem",
                background: "#fff3cd",
                border: "2px solid #ff9800",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#e65100",
                  }}
                >
                  ⚠️ Missing Aisles Detected
                </div>
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#5d4037",
                  marginBottom: "0.75rem",
                }}
              >
                These aisle numbers appear to be missing:
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
              >
                {detectedGapsButtons}
              </div>
            </div>,
            null
          )}

          {/* LLM Suggestions */}
          {ifElse(
            hasLLMSuggestions,
            <div
              style={{
                marginTop: "2rem",
                padding: "1rem",
                background: "#f0f9ff",
                border: "1px solid #3b82f6",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#1e40af",
                  }}
                >
                  💡 Suggested Sections
                </div>
                {ifElse(
                  llmPending,
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#667eea",
                      fontStyle: "italic",
                    }}
                  >
                    analyzing...
                  </span>,
                  null
                )}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#1e3a8a",
                  marginBottom: "0.75rem",
                }}
              >
                Common sections you might want to add:
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
              >
                {llmSuggestionsButtons}
              </div>
            </div>,
            null
          )}

          {/* Not in store list */}
          {ifElse(
            hasNotInStore,
            <div style={{ marginTop: "1rem", fontSize: "13px", color: "#666" }}>
              Not in this store:{" "}
              {derive(notInStore, (list) => list.join(", "))}
            </div>,
            null
          )}
        </div>
      ),
      storeName,
      aisles,
      specialDepartments,
      unassignedDepartments,
      entrances,
      notInStore,
      inCenterAisles,
      itemLocations,
      outline,
    };
  }
);

export default StoreMapper;
