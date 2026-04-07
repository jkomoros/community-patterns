# Store Mapper V2 - Enhanced UX PRD

## Problem Statement

Current store-mapper only handles numbered center aisles via photo scanning. Real-world stores have:
1. **Perimeter sections** without numbers (Bakery, Deli, Produce, Dairy)
2. **Multiple aisles per photo** - Makes gap detection crucial
3. **Multiple entrances** - Different entry points require different sort orders
4. **Visual layout matters** - Physical navigation depends on store geometry

## Vision

Create an intuitive store mapping experience that captures the full store layout (center aisles + perimeter + entrances) and uses this spatial understanding to optimize shopping paths based on where you enter.

## Core Insights from Field Testing

### Insight 1: Perimeter Sections Are Common
**Observation:** Bakery, Deli, Produce, Dairy, Frozen, Meat/Seafood are typically along walls without aisle numbers.

**Current Problem:** Photo wizard only extracts numbered aisles, missing ~30% of store.

**Solution Needed:** Quick-add interface for wall sections (no photos required).

### Insight 2: Multiple Aisles Per Photo
**Observation:** Wide-angle shots often capture 2-3 aisle signs at once (e.g., "Aisles 5, 6, 7" visible).

**Current Problem:** If you scan photos showing Aisles 1-3, 6-8, the system should detect gap at 4-5.

**Solution Needed:** Enhanced gap detection becomes MORE important with multi-aisle photos.

### Insight 3: Entrance Location Matters
**Observation:** Large stores have multiple entrances (left, right, center). Your optimal path depends on which one you use.

**Examples:**
```
Target (3 entrances):
- LEFT (Grocery): Start at produce, sweep aisles left→right
- RIGHT (General): Start at home goods, sweep aisles right→left
- CENTER: Split strategy to minimize backtracking

Whole Foods (2 entrances):
- FRONT: Traditional aisle order
- SIDE (Prepared foods): Start at hot bar, reverse aisle order
```

**Solution Needed:** Capture entrance locations during mapping, ask "Which entrance?" when shopping.

## User Experience Design

### Phase 1: Initial Setup
```
┌─────────────────────────────────────┐
│  🏪 Let's Map Your Store            │
│                                     │
│  Store Name: [Andronico's Shattuck] │
│                                     │
│  Where are the entrances?           │
│  (Tap to place entrance markers)    │
│                                     │
│      [  BACK WALL   ]               │
│   ┌──────────────────────┐          │
│ L │                      │ R        │
│ E │   [Store Interior]   │ I        │
│ F │                      │ G        │
│ T │                      │ H        │
│   └──────────────────────┘ T        │
│      [  FRONT     ]                 │
│         🚪 ←Tap here                │
│                                     │
│  [Next: Scan Aisles]                │
└─────────────────────────────────────┘
```

### Phase 2: Photo Scanning (Numbered Aisles)
```
┌─────────────────────────────────────┐
│  📷 Scan Aisle Signs                │
│                                     │
│  [📷 Take Photos]                  │
│                                     │
│  Auto-adding aisles as photos are   │
│  processed...                       │
│                                     │
│  ✓ From Photo 1: Added Aisles 1,2,3│
│  ✓ From Photo 2: Added Aisles 6,7,8│
│                                     │
│  ⚠️ Gaps Detected: 4, 5            │
│                                     │
│  Scanned: A1 A2 A3 A6 A7 A8        │
│  Missing: A4 A5                     │
│                                     │
│  [📷 Take Another Photo]           │
│  [Skip to Perimeter →]             │
│                                     │
│  (Remove any incorrect aisles from  │
│   the list below)                   │
└─────────────────────────────────────┘
```

**Design Decision: Auto-Add (No Review Step)**

Aisles are automatically added as vision LLM processes photos because:
- ✅ Faster workflow - no extra confirmation click
- ✅ Easy to undo - user can remove/edit mistakes from the list
- ✅ Consistent with perimeter presets - one tap, instant feedback
- ✅ Simpler reactive pattern - no complex frame management
- ✅ User is already in editing mode - natural to fix as needed

### Phase 3: Perimeter Quick-Add
```
┌─────────────────────────────────────┐
│  🏪 Add Perimeter Sections          │
│                                     │
│  Common sections (tap to add):      │
│                                     │
│  BACK WALL:                         │
│  ✓ Bakery  ✓ Deli  ○ Meat  ○ Fish │
│                                     │
│  LEFT WALL:                         │
│  ✓ Produce  ○ Floral  ○ Wine       │
│                                     │
│  RIGHT WALL:                        │
│  ✓ Dairy  ✓ Frozen  ○ Pharmacy     │
│                                     │
│  Custom: [__________] [+ Add]       │
│                                     │
│  [← Back]  [Preview Layout →]      │
└─────────────────────────────────────┘
```

### Phase 4: Review & Refine
```
┌─────────────────────────────────────┐
│  ✨ Store Layout Preview            │
│                                     │
│    Bakery | Deli | Meat             │
│   ┌────────────────────┐            │
│ P │ A1  A2  A3         │ Dairy      │
│ r │ A4  A5  A6         │ Frozen     │
│ o │ A7  A8             │            │
│ d └────────────────────┘            │
│         🚪 Main                      │
│                                     │
│  Entrances: Main (front-center)     │
│                                     │
│  [Edit Layout]  [✓ Save & Use]     │
└─────────────────────────────────────┘
```

### Shopping Flow: Entrance Selection
```
┌─────────────────────────────────────┐
│  🛒 Shopping at Andronico's         │
│                                     │
│  Which entrance are you using?      │
│                                     │
│  ○ 🚪 Main Entrance (front-center) │
│     → Produce first, then aisles    │
│                                     │
│  ○ 🚪 Side Door (right)             │
│     → Dairy first, reverse aisles   │
│                                     │
│  [Remember my choice ✓]             │
│                                     │
│  Your list will be sorted for the   │
│  fastest path from this entrance.   │
└─────────────────────────────────────┘
```

## Key UX Principles

### 1. Progressive Disclosure
- **Start simple**: Scan aisles with photos
- **Add complexity**: Wall sections optional
- **Advanced**: Multiple entrances for power users

### 2. Smart Gap Detection
When photo shows "Aisles 5, 6, 7":
- Extract all visible aisle numbers
- Compare to expected sequence
- Highlight gaps prominently
- Offer one-tap "scan missing" flow

### 3. Entrance-Aware Sorting
```
Store model includes:
{
  aisles: [
    { number: 1, name: "Beverages", position: "center-left" },
    { number: 2, name: "Snacks", position: "center-left" },
    ...
  ],
  perimeter: [
    { name: "Produce", wall: "left", section: "front" },
    { name: "Bakery", wall: "back", section: "left" },
    { name: "Dairy", wall: "right", section: "middle" },
  ],
  entrances: [
    { name: "Main", position: "front-center", default: true },
    { name: "Side", position: "right-middle" }
  ]
}

Sorting algorithm:
function sortForEntrance(items, entrance, layout) {
  // 1. Group items by location
  // 2. Calculate distance from entrance to each location
  // 3. Generate path that minimizes backtracking
  // 4. Consider one-way aisles if applicable
}
```

## Data Model

```typescript
interface StoreLayout {
  storeName: string;

  // Numbered center aisles
  aisles: Aisle[];

  // Perimeter sections (no numbers)
  perimeter: PerimeterSection[];

  // Entrance points
  entrances: Entrance[];

  // Metadata
  mappedAt: string;
  mappedBy?: string;
  gpsLocation?: { lat: number; lng: number };
}

interface Aisle {
  number: number;
  name: string;
  description?: string;
  position?: "center-left" | "center-middle" | "center-right";
}

interface PerimeterSection {
  name: string;
  wall: "front" | "back" | "left" | "right";
  position?: "left" | "center" | "right"; // For subdividing long walls
  description?: string;
}

interface Entrance {
  name: string;
  position:
    | "front-left" | "front-center" | "front-right"
    | "back-left" | "back-center" | "back-right"
    | "left-front" | "left-middle" | "left-back"
    | "right-front" | "right-middle" | "right-back";
  default?: boolean; // Which entrance is most common
}

interface ShoppingItem {
  title: string;
  done: boolean;
  location?: {
    type: "aisle" | "perimeter";
    identifier: number | string; // Aisle number or section name
  };
}
```

## UI Component Breakdown

### Component 1: `cf-store-diagram`
Visual overhead view of store layout
- Interactive diagram with tap-to-add zones
- Shows aisles, perimeter sections, entrances
- Drag to reposition elements
- Visual feedback for gaps

### Component 2: `wall-section-picker`
Quick-add for perimeter sections
- Grouped by wall (Back, Left, Right)
- Common presets (Bakery, Produce, Dairy, etc.)
- Custom text input
- One-tap to add

### Component 3: `entrance-selector`
Choose which entrance you're using
- Shows entrance options from mapping
- Preview of sort order from each entrance
- Remember preference per device
- Visual indicator on store diagram

## Updated Wizard Flow

### Step 1: Store Basics
```
Store Name: [____________]
Address: [____________] (optional, for GPS)
```

### Step 2: Mark Entrances
```
Where can customers enter this store?

[Visual store diagram]
Tap on the edges to mark entrances.

Common: Front-center ✓
       Front-left  ○
       Right-middle ○
```

### Step 3: Scan Center Aisles
```
📷 Scan Aisle Signs

Tips:
- Take wide shots to capture multiple aisles
- We'll detect gaps automatically
- Skip if no numbered aisles

[📷 Take Photos]
```

After each photo:
```
✓ This photo: Aisles 1, 2, 3

Total scanned: 1, 2, 3
⚠️ Recommended: Continue scanning...
```

### Step 4: Gap Resolution
```
⚠️ Missing Aisles Detected

We found: 1, 2, 3, 7, 8, 9
Gaps: 4, 5, 6

For each gap:
Aisle 4: [📷 Scan] [✏️ Add] [Skip]
Aisle 5: [📷 Scan] [✏️ Add] [Skip]
Aisle 6: [📷 Scan] [✏️ Add] [Skip]

[Continue →]
```

### Step 5: Perimeter Sections
```
🏪 Perimeter Sections

Add sections along the walls (no photos needed):

BACK WALL:  □ Bakery  □ Deli  □ Meat  □ Seafood
LEFT WALL:  □ Produce □ Floral □ Wine Bar
RIGHT WALL: □ Dairy   □ Frozen □ Pharmacy

Custom: [__________] [+ Add to Back/Left/Right ▾]

[← Back]  [Preview Layout →]
```

### Step 6: Visual Layout Review
```
✨ Store Layout Complete

    [Bakery] [Deli] [Meat]
   ┌─────────────────────┐
[P]│ 1  2  3  4  5  6  7 │[D]
[r]│                     │[a]
[o]│                     │[i]
[d]└─────────────────────┘[r]
           🚪 🚪
        Main  Side

17 locations mapped
2 entrances marked

[Edit] [Save & Use This Mapping]
```

## Sorting Algorithm Design

```typescript
function optimizePath(
  items: ShoppingItem[],
  layout: StoreLayout,
  entranceUsed: string
): ShoppingItem[] {

  const entrance = layout.entrances.find(e => e.name === entranceUsed);

  // Calculate zones based on entrance
  const zones = calculateZones(layout, entrance.position);

  // Example for front-center entrance:
  // Zone 1: Nearest perimeter (front walls)
  // Zone 2: Left aisles (1 → N/2)
  // Zone 3: Right aisles (N/2+1 → N)
  // Zone 4: Back perimeter

  // Assign each item to a zone
  const itemsByZone = items.map(item => ({
    item,
    zone: determineZone(item, layout),
    distance: calculateDistance(item, entrance, layout)
  }));

  // Sort by zone, then by distance within zone
  return itemsByZone
    .sort((a, b) => {
      if (a.zone !== b.zone) return a.zone - b.zone;
      return a.distance - b.distance;
    })
    .map(x => x.item);
}
```

## Implementation Phases

### Phase 1: Enhanced Photo Scanning ✓ (Current)
- Multi-aisle extraction from single photo
- Gap detection
- Manual aisle addition

### Phase 2: Perimeter Sections (NEW)
- Wall section quick-add UI
- Update data model to include perimeter
- Integrate perimeter into sorting

### Phase 3: Visual Layout (NEW)
- Interactive store diagram component
- Drag-and-drop section positioning
- Visual entrance markers
- Real-time layout preview

### Phase 4: Entrance-Aware Sorting (NEW)
- Mark entrances during mapping
- "Which entrance?" selector during shopping
- Path optimization algorithm
- Remember user preference

### Phase 5: GPS + Community Sharing (FUTURE)
- GPS-based mapping lookup
- Share mappings with others at same location
- Verification system (upvotes)
- Store chain templates

## Detailed Component Specs

### `cf-store-diagram` Component

**Purpose:** Visual overhead view of store layout

**Features:**
- SVG-based interactive diagram
- Tap zones for different areas:
  - Back wall (horizontal bar)
  - Left wall (vertical bar)
  - Right wall (vertical bar)
  - Center (grid for aisles)
  - Entrance markers (door icons)
- Color coding:
  - ✅ Green: Mapped sections
  - ⚠️ Yellow: Gaps detected
  - ⬜ Gray: Unmapped areas
- Responsive to screen size

**Props:**
```typescript
interface StoreLayoutData {
  aisles: Aisle[];
  perimeter: PerimeterSection[];
  entrances: Entrance[];
}

<cf-store-diagram
  layout={storeLayout}
  oncf-entrance-add={handleEntranceAdd}
  oncf-section-edit={handleSectionEdit}
  highlightGaps={true}
/>
```

### `wall-section-picker` Component

**Purpose:** Quick-add UI for perimeter sections

**Features:**
- Grouped by wall (Back, Left, Right)
- Preset buttons for common sections
- Custom text input
- Visual indicators (icons)
- Selected state management

**Props:**
```typescript
<wall-section-picker
  wall="back"
  presets={["Bakery", "Deli", "Meat", "Seafood"]}
  selected={selectedSections}
  oncf-section-toggle={handleToggle}
/>
```

### Enhanced `store-mapper.tsx` Integration

**New State:**
```typescript
interface StoreMapperState {
  storeName: string;

  // Phase 1: Entrances
  entrances: Entrance[];

  // Phase 2: Photo scanning (aisles)
  aisles: Aisle[];
  scannedPhotos: string[]; // Image data URLs
  detectedGaps: number[];

  // Phase 3: Perimeter
  perimeter: PerimeterSection[];

  // Current wizard step
  currentPhase: "entrances" | "aisles" | "gaps" | "perimeter" | "review";
}
```

**Wizard Navigation:**
```typescript
const wizardSteps = [
  { id: "entrances", title: "Mark Entrances", icon: "🚪" },
  { id: "aisles", title: "Scan Aisles", icon: "📷" },
  { id: "gaps", title: "Fill Gaps", icon: "⚠️", conditional: hasGaps },
  { id: "perimeter", title: "Add Perimeter", icon: "🏪" },
  { id: "review", title: "Review", icon: "✨" },
];
```

## Shopping Experience Changes

### Current Flow:
```
1. Open shopping list
2. Click "Sort by Aisle"
3. See items sorted by aisle number
```

### New Flow:
```
1. Open shopping list
2. Click "Sort by Aisle"
3. → IF multiple entrances:
     "Which entrance are you using today?"
     [ Main (front) | Side (right) ]
     [Remember this entrance ✓]
4. See items sorted by optimal path from that entrance
```

### Sort Order Examples

**Traditional (single entrance):**
```
Produce (Left wall)
Aisle 1 - Beverages
Aisle 2 - Snacks
...
Aisle 8 - Condiments
Dairy (Right wall)
Frozen (Right wall)
Bakery (Back wall)
```

**Optimized (from right entrance):**
```
Dairy (Right wall - START HERE)
Frozen (Right wall)
Aisle 8 - Condiments
Aisle 7 - Breakfast
...
Aisle 1 - Beverages
Produce (Left wall)
Bakery (Back wall)
```

## Technical Considerations

### Multi-Aisle Photo Processing

**Current:** Vision LLM returns one aisle per call
**New:** Parse array of aisles from single photo

```typescript
// Vision prompt update:
"Extract ALL aisle numbers and names visible in this photo.
Return as JSON array:
[
  {\"number\": 1, \"name\": \"Beverages\"},
  {\"number\": 2, \"name\": \"Snacks\"}
]"
```

### Gap Detection Algorithm

```typescript
function detectGaps(scannedAisles: number[]): number[] {
  const sorted = scannedAisles.sort((a, b) => a - b);
  const gaps: number[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // If gap > 1, add missing numbers
    for (let gap = current + 1; gap < next; gap++) {
      gaps.push(gap);
    }
  }

  return gaps;
}
```

### Path Optimization

```typescript
function calculateOptimalPath(
  items: ShoppingItem[],
  layout: StoreLayout,
  entrance: Entrance
): PathSegment[] {

  // 1. Map items to physical locations
  const locatedItems = items.map(item => ({
    item,
    location: findItemLocation(item, layout)
  }));

  // 2. Calculate entrance position in store coordinates
  const startPos = entranceToCoordinates(entrance.position);

  // 3. Group items by physical proximity
  const clusters = clusterByLocation(locatedItems);

  // 4. Order clusters to minimize total walking distance
  const orderedClusters = travelingSalesmanApprox(clusters, startPos);

  // 5. Within each cluster, order by logical flow
  return orderedClusters.flatMap(cluster =>
    sortCluster(cluster, layout)
  );
}
```

## Mockup: Integrated Experience

### Mapping a New Store (Full Flow)

```
Step 1: "Let's map Andronico's"
→ Enter store name
→ (Future: Add entrance markers)

Step 2: Walk around, take 3-4 wide photos
→ Photo 1: Vision LLM auto-adds Aisles 1,2,3
→ Photo 2: Vision LLM auto-adds Aisles 5,6,7
→ Photo 3: Vision LLM auto-adds Aisles 9,10
→ Aisles appear immediately in list

Step 3: Check for gaps
→ Gap detection shows: "Missing 4, 8"
→ Take one more photo
→ Auto-adds Aisles 4, 8
→ All complete!

Step 4: Add perimeter sections
→ One-tap presets: Produce, Bakery, Deli, Dairy, Frozen
→ Done in 10 seconds

Step 5: Review & edit
→ Remove any mistakes
→ Edit descriptions if needed
→ Save

Total time: 2-3 minutes
```

**UX Principle: Trust + Easy Undo**
- Vision LLM auto-adds aisles (trust the AI)
- Easy remove buttons if something is wrong (easy undo)
- Faster than confirmation dialogs

### Using the Mapping (Shopping)

```
1. Open shopping list with 15 items
2. "Sort by Aisle"
3. "Using Main entrance today?"
   → Yes [Remember ✓]
4. List sorted:
   - Produce: lettuce, tomatoes
   - Aisle 1: milk
   - Aisle 3: pasta
   - Aisle 7: cereal
   - Frozen: ice cream
   - Bakery: bread
5. Efficient path, no backtracking!
```

## Success Metrics

### For Mapping Experience:
- ✅ Can map entire store in < 5 minutes
- ✅ Perimeter sections added in < 30 seconds
- ✅ Gap detection catches 95%+ of missing aisles
- ✅ Visual layout gives confidence in mapping accuracy

### For Shopping Experience:
- ✅ Items sorted for optimal path from chosen entrance
- ✅ Users complete shopping 20-30% faster
- ✅ Zero backtracking for well-organized stores
- ✅ Clear visual understanding of where to go

## Open Questions

1. **Entrance naming conventions?**
   - Auto-name: "Main", "Side", "Rear" vs.
   - User-named: "Parking Lot", "Street Side"

2. **Aisle direction?**
   - Do we need to track which side of an aisle items are on?
   - Or is aisle number sufficient?

3. **Store rotation?**
   - Does the diagram need to support rotation for different orientations?
   - Or always show "front" at bottom?

4. **Default entrance behavior?**
   - Always ask which entrance?
   - Remember last used?
   - GPS-based auto-detection (if entrance locations known)?

5. **Multi-aisle photos priority?**
   - Should UI encourage "take fewer wide photos" vs "one photo per aisle"?
   - Trade-off: Efficiency vs. accuracy

## Next Steps

1. Review this PRD and refine based on feedback
2. Design mockups for each wizard step
3. Implement cf-store-diagram component
4. Add perimeter section support to data model
5. Update photo processing to handle multi-aisle extraction
6. Implement entrance-aware path optimization
7. Test with real Andronico's images

## Files to Create/Modify

**New Files:**
- `store-mapper-v2.tsx` - Enhanced wizard with all phases
- `cf-store-diagram.tsx` - Visual layout component (if in labs)
- `wall-section-picker.tsx` - Perimeter section UI
- `entrance-selector.tsx` - Choose which entrance
- `path-optimizer.ts` - Sorting algorithm

**Modified Files:**
- `shopping-list-launcher.tsx` - Entrance selection UI
- `store-mapper.tsx` - Migrate to v2 or extend

**Data/Types:**
- `store-layout-schema.tsx` - Shared TypeScript types
