/// <cts-enable />
import { Cell, computed, Default, generateObject, handler, ifElse, ImageData, llm, NAME, navigateTo, OpaqueRef, pattern, str, Stream, UI } from "commontools";
import StoreMapper from "./store-mapper.tsx";

interface ShoppingItem {
  title: string;
  done: Default<boolean, false>;
  aisleSeed?: number;  // Increment to force re-categorization
}

// Store data structure types (aligned with store-mapper-v2)
interface StoreAisle {
  name: string;
  description: string;
}

type WallPosition =
  | "front" | "left" | "back" | "right"  // Basic positions (kept for compatibility)
  | "front-left" | "front-center" | "front-right"  // Front wall granular
  | "back-left" | "back-center" | "back-right"  // Back wall granular
  | "left-front" | "left-center" | "left-back"  // Left wall granular
  | "right-front" | "right-center" | "right-back";  // Right wall granular

interface StoreDepartment {
  name: string;
  location: WallPosition;
  description: string;
}

// Track user-reported item locations for LLM context enhancement
interface ItemLocation {
  itemName: string;           // e.g., "coffee"
  correctAisle: string;       // e.g., "Aisle 9 - Coffee & Snacks"
  incorrectAisle?: string;    // e.g., "Aisle 5 - Condiments" (optional)
  timestamp: number;          // When correction was made
}

interface StoreData {
  aisles: StoreAisle[];
  departments: StoreDepartment[];
  itemLocations: ItemLocation[];  // User-reported corrections
}

// Helper: Convert structured store data to markdown for LLM
function storeDataToMarkdown(data: StoreData | null): string {
  if (!data) return "";

  let markdown = "";

  // Build map of aisle/department -> known items
  const locationToItems = new Map<string, string[]>();
  if (data.itemLocations) {
    data.itemLocations.forEach(loc => {
      const items = locationToItems.get(loc.correctAisle) || [];
      items.push(loc.itemName);
      locationToItems.set(loc.correctAisle, items);
    });
  }

  // Add aisles with embedded known items
  data.aisles.forEach((aisle) => {
    const aisleName = `Aisle ${aisle.name}`;  // aisle.name is now just the number (e.g., "5" or "5A")
    markdown += `# ${aisleName}`;

    // Embed items directly in header (per user feedback)
    const knownItems = locationToItems.get(aisleName);
    if (knownItems && knownItems.length > 0) {
      markdown += ` (Known items: ${knownItems.join(", ")})`;
    }
    markdown += `\n`;
    if (aisle.description) markdown += `${aisle.description}\n`;
    markdown += `\n`;
  });

  // Add departments with embedded known items
  data.departments.forEach(dept => {
    markdown += `# ${dept.name}`;
    if (dept.location) {
      // Convert location to human-readable
      const locationStr = dept.location.replace(/-/g, " ");
      markdown += ` (${locationStr})`;
    }

    // Embed items for departments too
    const knownItems = locationToItems.get(dept.name);
    if (knownItems && knownItems.length > 0) {
      markdown += ` (Known items: ${knownItems.join(", ")})`;
    }
    markdown += `\n`;
    if (dept.description) markdown += `${dept.description}\n`;
    markdown += `\n`;
  });

  return markdown.trim();
}

interface LauncherInput {
  items?: Default<ShoppingItem[], []>;
  storeData?: Default<StoreData | null, null>;  // Structured store layout data
  storeName?: Default<string, "Andronico's on Shattuck">;
}

/** Shopping list with store aisle mapping and sorting. #shoppingListLauncher */
interface LauncherOutput {
  items: ShoppingItem[];
  addItem: OpaqueRef<Stream<{ detail: { message: string } }>>;
  addItems: OpaqueRef<Stream<{ itemNames: string[] }>>;
}

const ANDRONICOS_DATA: StoreData = {
  aisles: [
    { name: "1", description: "Soda & Beverages\n- Soda\n- Sparkling Water\n- Soft Drinks\n- Beverages" },
    { name: "2", description: "Frozen Foods\n- Breakfast\n- Pizza\n- Vegetables\n- Frozen Dinners" },
    { name: "3", description: "Cleaning & Paper\n- Charcoal / Logs\n- Paper Towels\n- Bath Tissue\n- Cleaning Supplies\n- Laundry" },
    { name: "4", description: "Health & Beauty\n- Oral Care\n- Skin Care\n- Shampoo\n- Hair Care" },
    { name: "5", description: "Pet & Baby\n- Cat Food\n- Dog Food\n- Baby Food\n- Feminine Care\n- Diapers" },
    { name: "6", description: "International & Pasta\n- Asian\n- Hispanic\n- Packaged Dinners\n- Soups\n- Pasta" },
    { name: "7", description: "Condiments & Cereal\n- Condiments\n- Pickles & Olives\n- Cereal\n- Hot Cereal" },
    { name: "8", description: "Baking & Spices\n- Cups & Plates\n- Peanut Butter & Jam\n- Flour\n- Cooking Oil\n- Spices" },
    { name: "9", description: "Coffee & Snacks\n- Coffee\n- Tea\n- Crackers\n- Cookies\n- Popcorn & Nuts" },
    { name: "10", description: "Wine & Candy\n- Wine\n- Juices\n- Candy" },
    { name: "11", description: "Spirits\n- Champagne\n- Spirits\n- Wine\n- Mixers" },
    { name: "12", description: "Beer & Chips\n- Beer\n- Cold Beverages\n- Chips & Salsa\n- Water" },
  ],
  departments: [
    { name: "Bakery", location: "right", description: "Fresh baked goods" },
    { name: "Produce", location: "right", description: "Fresh fruits and vegetables" },
    { name: "Bulk Bins", location: "right", description: "Bulk dry goods, nuts, grains" },
    { name: "Deli", location: "back", description: "Prepared foods and deli meats" },
    { name: "Fromagerie", location: "back", description: "Artisan cheese counter" },
    { name: "Butcher", location: "back", description: "Meat counter" },
    { name: "Seafood", location: "back", description: "Fresh seafood counter" },
    { name: "Dairy", location: "left", description: "Milk, yogurt, cheese" },
    { name: "Eggs", location: "left", description: "Fresh eggs" },
    { name: "Breakfast Meats & Sausage", location: "left", description: "Bacon, sausage, breakfast meats" },
  ],
  itemLocations: [],  // User-reported corrections (initially empty)
};

// Legacy markdown format - keep for backward compatibility with existing data
const ANDRONICOS_OUTLINE = storeDataToMarkdown(ANDRONICOS_DATA);

const showSorted = handler<unknown, { currentView: Cell<"basic" | "sorted"> }>((_event, { currentView }) => {
  currentView.set("sorted");
});

const showBasic = handler<unknown, { currentView: Cell<"basic" | "sorted"> }>((_event, { currentView }) => {
  currentView.set("basic");
});

const removeItem = handler<
  unknown,
  { items: Cell<Array<Cell<ShoppingItem>>>; item: Cell<ShoppingItem> }
>((_event, { items, item }) => {
  const currentItems = items.get();
  const index = currentItems.findIndex((el) => el.equals(item));
  if (index >= 0) {
    items.set(currentItems.toSpliced(index, 1));
  }
});

const retryAisle = handler<
  unknown,
  { item: Cell<ShoppingItem> }
>((_event, { item }) => {
  const current = item.get();
  item.set({ ...current, aisleSeed: (current.aisleSeed || 0) + 1 });
});

const addItem = handler<
  { detail: { message: string } },
  { items: Cell<ShoppingItem[]> }
>(({ detail }, { items }) => {
  items.push({ title: detail.message, done: false });
});

// Handler for omnibot to add multiple items at once
const addItems = handler<
  { itemNames: string[] },
  { items: Cell<ShoppingItem[]> }
>(({ itemNames }, { items }) => {
  itemNames.forEach((name) => {
    if (name && name.trim()) {
      items.push({ title: name.trim(), done: false });
    }
  });
});

const openStoreMapper = handler<unknown, { storeName: string }>((_event, { storeName }) => {
  return navigateTo(StoreMapper({
    storeName: storeName || "My Store",
    aisles: [],
    specialDepartments: [],
    unassignedDepartments: ["Bakery", "Deli", "Produce", "Dairy", "Frozen Foods", "Meat & Seafood", "Pharmacy"],
    entrances: [],
    notInStore: [],
    inCenterAisles: [],
    itemLocations: [],
  }));
});

// Handler to view existing store mapping (for demo: shows what the community created)
const viewStoreMap = handler<unknown, { storeName: string; storeData: Cell<StoreData | null> }>(
  (_event, { storeName, storeData }) => {
    const currentStoreData = storeData.get();
    // For demo: Use ANDRONICOS_DATA if storeName is "Andronico's on Shattuck" and no data linked
    // But preserve itemLocations from storeData if they exist
    const useAndronicos = (storeName === "Andronico's on Shattuck" && (!currentStoreData || (currentStoreData.aisles.length === 0 && currentStoreData.departments.length === 0)));
    const dataToUse = useAndronicos
      ? { ...ANDRONICOS_DATA, itemLocations: currentStoreData?.itemLocations || [] }
      : currentStoreData;

    // Convert structured data to store mapper format
    const aisles = (dataToUse?.aisles || []).map((aisle) => ({
      name: aisle.name,  // aisle.name is now just the number (e.g., "5" or "5A")
      description: aisle.description,
    }));

    const specialDepartments = (dataToUse?.departments || []).map(dept => ({
      name: dept.name,
      location: dept.location,
      description: dept.description,
      icon: "🏪",
    }));

    const departmentNames = ["Bakery", "Deli", "Produce", "Dairy", "Frozen Foods", "Meat & Seafood", "Pharmacy"];
    const assignedDepartmentNames = specialDepartments.map(d => d.name);
    const unassignedDepartments = departmentNames.filter(name => !assignedDepartmentNames.includes(name));

    return navigateTo(StoreMapper({
      storeName: storeName || "Store",
      aisles,
      specialDepartments,
      unassignedDepartments,
      entrances: [{ name: "Main Entrance", position: "front-center" }], // Mock: from "community data"
      notInStore: [],
      inCenterAisles: [],
      itemLocations: [...(dataToUse?.itemLocations || [])],
    }));
  }
);

// Simple handler to store uploaded images - LLM processing happens in recipe body
const handlePhotoUpload = handler<
  { detail: { images: ImageData[] } },
  { uploadedImages: Cell<ImageData[]> }
>(({ detail }, { uploadedImages }) => {
  console.log("Received", detail.images.length, "image(s)");
  uploadedImages.set(detail.images);
});

// Correction state for tracking which item is being corrected
interface CorrectionState {
  item: Cell<ShoppingItem>;
  incorrectAisle: string;
}

// Handler to start correcting an item
const startCorrection = handler<
  unknown,
  {
    item: Cell<ShoppingItem>;
    incorrectAisle: string;
    correctionState: Cell<CorrectionState | null>;
  }
>((_event, { item, incorrectAisle, correctionState }) => {
  console.log("[startCorrection] Setting correction state:", { item: item.get().title, incorrectAisle });
  correctionState.set({ item, incorrectAisle });
  console.log("[startCorrection] Correction state set");
});

// Handler to cancel correction
const cancelCorrection = handler<
  unknown,
  { correctionState: Cell<CorrectionState | null> }
>((_event, { correctionState }) => {
  correctionState.set(null);
});

// Handler to submit aisle correction
const submitCorrection = handler<
  unknown,
  {
    item: Cell<ShoppingItem>;
    incorrectAisle: string;
    correctAisle: string;
    mutableStoreData: Cell<StoreData | null>;
    correctionState: Cell<CorrectionState | null>;
  }
>((_event, { item, incorrectAisle, correctAisle, mutableStoreData, correctionState }) => {
  const currentData = mutableStoreData.get();
  if (!currentData) return;

  const itemName = item.get().title.toLowerCase();

  // Remove existing correction for this item
  const filteredLocations = currentData.itemLocations.filter(
    loc => loc.itemName.toLowerCase() !== itemName
  );

  // Add new correction
  const newLocation: ItemLocation = {
    itemName: item.get().title,
    correctAisle,
    incorrectAisle: incorrectAisle !== "Other" ? incorrectAisle : undefined,
    timestamp: Date.now(),
  };

  // Update store data
  mutableStoreData.set({
    ...currentData,
    itemLocations: [...filteredLocations, newLocation],
  });

  console.log(`[Correction] Stored: ${item.get().title} -> ${correctAisle} (was: ${incorrectAisle})`);

  // Force re-categorization by incrementing seed
  const current = item.get();
  item.set({ ...current, aisleSeed: (current.aisleSeed || 0) + 1 });

  // Close correction panel
  correctionState.set(null);
});

const ShoppingListLauncher = pattern<LauncherInput, LauncherOutput>(
  ({ items, storeData, storeName }) => {
    const currentView = Cell.of<"basic" | "sorted">("basic");
    const isBasicView = computed(() => currentView.get() === "basic");

    // Mutable store data cell to allow runtime corrections
    // For now, just use ANDRONICOS_DATA (not the input storeData) to avoid circular refs
    const mutableStoreData = Cell.of<StoreData | null>(ANDRONICOS_DATA);

    // Cell to track which item is being corrected
    const correctionState = Cell.of<CorrectionState | null>(null);

    // Cell to store uploaded images
    const uploadedImages = Cell.of<ImageData[]>([]);

    // Process uploaded images with vision LLM to extract shopping items
    const imageExtractions = uploadedImages.map((image) => {
      return generateObject({
        model: "anthropic:claude-sonnet-4-5",
        prompt: [
          { type: "image", image: image.data },
          {
            type: "text",
            text: "Extract all shopping/grocery items from this image. Return a JSON array of strings, one item per string. For example: [\"milk\", \"eggs\", \"bread\"]. If you see a shopping list, extract each item. If you see a recipe, extract the ingredients. If you see product photos, list the products.",
          },
        ],
        schema: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "string" } },
          },
          required: ["items"],
        },
      });
    });

    // Handler to add extracted items to shopping list
    const addExtractedItems = handler<
      unknown,
      { items: Cell<ShoppingItem[]>; extractedItems: string[]; uploadedImages: Cell<ImageData[]> }
    >((_event, { items, extractedItems, uploadedImages }) => {
      extractedItems.forEach((itemText: string) => {
        if (itemText && itemText.trim()) {
          const currentItems = items.get();
          const exists = currentItems.some((item: ShoppingItem) =>
            item.title.toLowerCase() === itemText.trim().toLowerCase()
          );
          if (!exists) {
            items.push({ title: itemText.trim(), done: false });
          }
        }
      });
      // Clear images after adding
      uploadedImages.set([]);
    });

    // Demo: Mock community mapping for "Andronico's on Shattuck"
    const hasCommunityMapping = computed(() => {
      const storeDataVal = mutableStoreData.get();
      return storeName === "Andronico's on Shattuck" || (storeDataVal !== null && (storeDataVal.aisles.length > 0 || storeDataVal.departments.length > 0));
    });

    // Computed stats
    const totalCount = computed(() => (items as ShoppingItem[]).length);
    const doneCount = computed(() => (items as ShoppingItem[]).filter(item => item.done).length);
    const remainingCount = computed(() => totalCount.get() - doneCount.get());
    const correctionsCount = computed(() => {
      const data = mutableStoreData.get();
      return (data && data.itemLocations) ? data.itemLocations.length : 0;
    });

    // Categorize each item into an aisle using LLM (per-item for better caching)
    const itemsWithAisles = items.map((item) => {
      const assignment = generateObject({
        model: "anthropic:claude-sonnet-4-5",
        prompt: computed(() => {
            const title = item.title;
            const storeDataVal = mutableStoreData.get();
            const seed = item.aisleSeed || 0;
            // Include seed to force re-evaluation on retry (even though we don't use it)
            const storeMarkdown = storeDataVal ? storeDataToMarkdown(storeDataVal) : ANDRONICOS_OUTLINE;

            // Build list of valid location names from store data
            const validLocations: string[] = [];

            if (storeDataVal) {
              // Add aisles (just "Aisle 1", "Aisle 2", etc.)
              storeDataVal.aisles.forEach(aisle => {
                validLocations.push(`Aisle ${aisle.name}`);
              });

              // Add departments (just the name)
              storeDataVal.departments.forEach(dept => {
                validLocations.push(dept.name);
              });
            }

            validLocations.push("Other");

            console.log(`[LLM Context] Item: ${title}, Seed: ${seed}, Corrections: ${storeDataVal?.itemLocations.length || 0}`);

            return `Store layout (for context):\n${storeMarkdown}\n\nItem: ${title}\n\nDetermine which aisle or department this item is in. You must respond with one of these exact values: ${validLocations.join(", ")}`;
          }),
        schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The aisle or department name (e.g., 'Aisle 1', 'Bakery', 'Other')"
            }
          },
          required: ["location"]
        }
      });

      const aisleName = computed(() => {
        const result = assignment.result;
        console.log(`[Aisle Assignment] Item: ${item.title}, Result:`, result);

        if (!result || !result.location) {
          console.log(`[Aisle Assignment] No location in result for ${item.title}`);
          return "Other";
        }

        const location = result.location.trim();
        console.log(`[Aisle Assignment] Structured result for ${item.title}:`, location);
        return location || "Other";
      });

      // Track status: pending, success, failed, timeout
      const status = computed(() => {
          const isPending = assignment.pending;
          const result = assignment.result;
          if (isPending) return "pending";
          if (result) return "success";
          return "failed";  // No result and not pending = failed or timeout
        }
      );

      return {
        item,
        aisle: aisleName,
        isPending: assignment.pending,
        status,
      };
    });

    // BERNI'S BOXING APPROACH: Wrap items before sorting to preserve cell references
    // 1. Box the items
    const boxedItems = itemsWithAisles.map(assignment => ({ assignment }));

    // 2. Sort boxed items by aisle (cells accessed inside computed auto-materialize)
    const sortedBoxedItems = computed(() => {
      const boxed = boxedItems as Array<{ assignment: { aisle: string; item: ShoppingItem; isPending: boolean; status: string } }>;
      return boxed.slice().sort((a, b) => {
        const aAisle = a.assignment.aisle || "Other";
        const bAisle = b.assignment.aisle || "Other";

        // Put "Other" at the end
        if (aAisle === "Other") return 1;
        if (bAisle === "Other") return -1;

        // Extract aisle number from "Aisle N - Name" format
        const aNum = aAisle.match(/Aisle (\d+)/)?.[1];
        const bNum = bAisle.match(/Aisle (\d+)/)?.[1];

        // Sort by aisle number if both have numbers
        if (aNum && bNum) {
          return parseInt(aNum) - parseInt(bNum);
        }

        // Fall back to alphabetical
        return aAisle.localeCompare(bAisle);
      });
    });

    // 3. Group sorted items by aisle for display with headers and compute completion metrics
    const aisleGroups = computed(() => {
      const sorted = sortedBoxedItems.get();
      const groups: Array<{
        aisleName: string;
        items: typeof sorted;
        totalCount: number;
        doneCount: number;
        percentComplete: number;
        isComplete: boolean;
        isNext: boolean;
      }> = [];
      let currentAisle = "";
      let currentGroup: typeof sorted = [];

      for (const boxed of sorted) {
        const aisle = boxed.assignment.aisle || "Other";
        if (aisle !== currentAisle) {
          if (currentGroup.length > 0) {
            const totalCount = currentGroup.length;
            const doneCount = currentGroup.filter(({ assignment }) => assignment.item.done).length;
            const percentComplete = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
            groups.push({
              aisleName: currentAisle,
              items: currentGroup,
              totalCount,
              doneCount,
              percentComplete,
              isComplete: doneCount === totalCount && totalCount > 0,
              isNext: false, // Will be set below
            });
          }
          currentAisle = aisle;
          currentGroup = [boxed];
        } else {
          currentGroup.push(boxed);
        }
      }

      // Don't forget the last group
      if (currentGroup.length > 0) {
        const totalCount = currentGroup.length;
        const doneCount = currentGroup.filter(({ assignment }) => assignment.item.done).length;
        const percentComplete = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
        groups.push({
          aisleName: currentAisle,
          items: currentGroup,
          totalCount,
          doneCount,
          percentComplete,
          isComplete: doneCount === totalCount && totalCount > 0,
          isNext: false, // Will be set below
        });
      }

      // Mark the first non-complete group as "next"
      const nextGroupIndex = groups.findIndex(g => !g.isComplete);
      if (nextGroupIndex >= 0) {
        groups[nextGroupIndex].isNext = true;
      }

      return groups;
    });

    return {
      [NAME]: str`${storeName || "Andronico's on Shattuck"} Shopping List`,
      addItem: addItem({ items }),
      addItems: addItems({ items }),
      [UI]: (
        <ct-vstack gap={4} style="padding: 1rem; max-width: 800px;">
          {/* Header with stats */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: "8px", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>🛒 {storeName || "Andronico's on Shattuck"}</h2>
              <div style={{ fontSize: "13px", marginTop: "4px", opacity: 0.9 }}>
                {remainingCount} items to get • {doneCount} checked off
                {computed(() => correctionsCount.get() > 0 ? ` • ${correctionsCount.get()} correction${correctionsCount.get() !== 1 ? 's' : ''}` : '')}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {ifElse(
                isBasicView,
                <ct-button onClick={showSorted({ currentView })} variant="secondary" size="sm" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                  📍 Sort by Aisle
                </ct-button>,
                <ct-button onClick={showBasic({ currentView })} variant="secondary" size="sm" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                  ← Quick List
                </ct-button>
              )}
              {/* Show View Map button if community mapping exists */}
              {ifElse(
                hasCommunityMapping,
                <ct-button onClick={viewStoreMap({ storeName, storeData: mutableStoreData })} variant="secondary" size="sm" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                  👁️ View Map
                </ct-button>,
                null
              )}
              {/* Setup/Edit button */}
              <ct-button onClick={openStoreMapper({ storeName })} variant="secondary" size="sm" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                {ifElse(
                  hasCommunityMapping,
                  <span>🗺️ Edit Map</span>,
                  <span>🗺️ Setup Store</span>
                )}
              </ct-button>
            </div>
          </div>

          {/* Basic view - always visible when in basic mode */}
          <ct-vstack gap={2} style={isBasicView ? "display: flex;" : "display: none;"}>
            <div style={{ marginBottom: "1rem" }}>
              <ct-image-input
                capture="environment"
                buttonText="📸 Scan List or Recipe"
                variant="secondary"
                showPreview={false}
                maxSizeBytes={3700000}
                onct-change={handlePhotoUpload({ uploadedImages })}
              />
              {computed(() => {
                const images = uploadedImages.get();
                const extractions = imageExtractions as any[];
                if (images.length === 0) return null;

                // Collect extraction status
                const anyPending = extractions.some((e: any) => e.pending);
                const allExtracted: string[] = [];
                extractions.forEach((e: any) => {
                  if (e.result && e.result.items) {
                    allExtracted.push(...e.result.items);
                  }
                });

                return (
                  <div style={{ padding: "0.75rem", background: "#f0f9ff", border: "1px solid #0ea5e9", borderRadius: "6px", marginTop: "0.5rem" }}>
                    {anyPending ? (
                      <ct-text style="font-size: 0.875rem; color: #0369a1;">
                        🔄 Processing {images.length} image(s)...
                      </ct-text>
                    ) : allExtracted.length > 0 ? (
                      <div>
                        <ct-text style="font-size: 0.875rem; font-weight: 600; color: #0369a1; display: block; margin-bottom: 0.5rem;">
                          ✓ Found {allExtracted.length} item(s): {allExtracted.slice(0, 5).join(", ")}{allExtracted.length > 5 ? "..." : ""}
                        </ct-text>
                        <ct-button size="sm" onClick={addExtractedItems({ items, extractedItems: allExtracted, uploadedImages })}>
                          Add to List
                        </ct-button>
                      </div>
                    ) : (
                      <ct-text style="font-size: 0.875rem; color: #999;">
                        ✓ Uploaded {images.length} image(s) - No items found
                      </ct-text>
                    )}
                  </div>
                );
              })}
            </div>

            {items.map((item) => (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "white", border: "1px solid #e0e0e0", borderRadius: "6px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <ct-checkbox $checked={item.done} />
                <ct-input $value={item.title} placeholder="Enter item..." style="flex: 1; border: none; background: transparent;" />
                <ct-button variant="destructive" size="sm" onClick={removeItem({ items, item })}>
                  ×
                </ct-button>
              </div>
            ))}
            <div style={{ marginTop: "0.5rem" }}>
              <ct-message-input
                placeholder="💬 Type to add item, or ask omnibot..."
                appearance="rounded"
                buttonText="Add"
                onct-send={addItem({ items })}
              />
            </div>
          </ct-vstack>

          {/* Sorted view - Grouped by aisle with headers (using boxing pattern) */}
          <div style={isBasicView ? { display: "none" } : { display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
            {aisleGroups.map((group) => {
              return (
                <div style={{
                  padding: "1rem",
                  background: group.isComplete ? "#f0fdf4" : (group.isNext ? "#fef3c7" : "white"),
                  border: group.isComplete ? "2px solid #86efac" : (group.isNext ? "2px solid #fbbf24" : "1px solid #e0e0e0"),
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}>
                  {/* Aisle header with progress */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {group.isComplete ? (
                        <span style={{ fontSize: "16px" }}>✅</span>
                      ) : group.isNext ? (
                        <span style={{ fontSize: "16px" }}>📍</span>
                      ) : (
                        <span style={{ fontSize: "16px" }}>⚪</span>
                      )}
                      <div style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        color: group.isComplete ? "#166534" : (group.isNext ? "#92400e" : "#667eea"),
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}>
                        {group.aisleName}
                      </div>
                    </div>
                    <div style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: group.isComplete ? "#166534" : (group.isNext ? "#92400e" : "#64748b"),
                      background: group.isComplete ? "#dcfce7" : (group.isNext ? "#fef3c7" : "#f1f5f9"),
                      padding: "4px 8px",
                      borderRadius: "12px",
                    }}>
                      {group.doneCount}/{group.totalCount} • {group.percentComplete}%
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{
                    width: "100%",
                    height: "4px",
                    background: "#e5e7eb",
                    borderRadius: "2px",
                    marginBottom: "12px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${group.percentComplete}%`,
                      height: "100%",
                      background: group.isComplete ? "#22c55e" : (group.isNext ? "#f59e0b" : "#667eea"),
                      transition: "width 0.3s ease",
                    }} />
                  </div>

                  {/* Items in this aisle */}
                  <ct-vstack gap={2}>
                    {group.items.map(({ assignment }) => (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.75rem 1rem",
                        background: assignment.item.done ? "#f9fafb" : "white",
                        border: assignment.item.done ? "1px solid #e5e7eb" : "1px solid #d1d5db",
                        borderRadius: "6px",
                        opacity: assignment.item.done ? 0.6 : 1,
                      }}>
                        <ct-checkbox $checked={assignment.item.done} />
                        <span style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "15px",
                          textDecoration: assignment.item.done ? "line-through" : "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {assignment.item.title}
                          {computed(() => {
                              const data = mutableStoreData.get();
                              const itemTitle = assignment.item.title;
                              if (!data) return null;
                              if (!itemTitle) return null;
                              const itemName = itemTitle.toLowerCase();
                              const hasCorrection = data.itemLocations.some((loc: ItemLocation) =>
                                loc.itemName && loc.itemName.toLowerCase() === itemName
                              );
                              return hasCorrection ? (
                                <span style={{
                                  fontSize: "10px",
                                  color: "#10b981",
                                  marginLeft: "4px",
                                  fontWeight: "600"
                                }}>
                                  ✓
                                </span>
                              ) : null;
                            })}
                        </span>
                        {computed(() => {
                          const statusVal = assignment.status;
                          if (statusVal === "pending") {
                            return <span style={{ fontSize: "11px", color: "#667eea", fontStyle: "italic", flexShrink: 0 }}>🔄 sorting...</span>;
                          }
                          if (statusVal === "failed") {
                            return (
                              <ct-button
                                variant="ghost"
                                size="sm"
                                onClick={retryAisle({ item: assignment.item })}
                                style={{ fontSize: "11px", color: "#ef4444", flexShrink: 0 }}
                              >
                                ⚠️ Retry
                              </ct-button>
                            );
                          }
                          return null;
                        })}
                        <ct-button
                          variant="ghost"
                          size="sm"
                          onClick={startCorrection({
                            item: assignment.item,
                            incorrectAisle: group.aisleName,
                            correctionState,
                          })}
                          style={{ fontSize: "14px", color: "#9ca3af", flexShrink: 0 }}
                        >
                          ✏️
                        </ct-button>
                      </div>
                    ))}
                  </ct-vstack>
                </div>
              );
            })}
          </div>

          {/* Correction Panel - appears at bottom when correcting an item */}
          {computed(() => {
              const state = correctionState.get();
              const currentData = mutableStoreData.get();

              if (!state || !state.item) return null;
              if (!currentData) return null;

            // Get the item title from the cell
            const itemTitle = state.item.get().title;

            // Build list of all available locations
            const allLocations: string[] = [];

            // Add all aisles
            currentData.aisles.forEach((aisle: StoreAisle) => {
              const aisleName = `Aisle ${aisle.name}`;  // aisle.name is now just the number (e.g., "5" or "5A")
              allLocations.push(aisleName);
            });

            // Add all departments
            currentData.departments.forEach((dept: StoreDepartment) => {
              allLocations.push(dept.name);
            });

            // Add "Other" option
            allLocations.push("Other");

            return (
              <div style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                background: "white",
                borderTop: "3px solid #f59e0b",
                boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
                padding: "1.5rem",
                maxHeight: "50vh",
                overflowY: "auto",
                zIndex: 1000,
              }}>
                <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}>
                    <div>
                      <h3 style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#92400e",
                      }}>
                        Where is "{itemTitle}" actually located?
                      </h3>
                      <div style={{ fontSize: "13px", color: "#78716c", marginTop: "4px" }}>
                        Currently in: {state.incorrectAisle}
                      </div>
                    </div>
                    <ct-button
                      variant="ghost"
                      size="sm"
                      onClick={cancelCorrection({ correctionState })}
                    >
                      ✕ Cancel
                    </ct-button>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "0.5rem",
                  }}>
                    {allLocations.map((location) => (
                      <ct-button
                        variant="secondary"
                        size="sm"
                        onClick={submitCorrection({
                          item: state.item,
                          incorrectAisle: state.incorrectAisle,
                          correctAisle: location,
                          mutableStoreData,
                          correctionState,
                        })}
                        style={{
                          textAlign: "left",
                          justifyContent: "flex-start",
                        }}
                      >
                        {location}
                      </ct-button>
                    ))}
                  </div>
                </div>
              </div>
            );
            })}
        </ct-vstack>
      ),
      items,
    };
  }
);

export default ShoppingListLauncher;
