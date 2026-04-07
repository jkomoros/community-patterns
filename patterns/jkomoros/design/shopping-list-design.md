# Smart Shopping List - Design Document

## Investor Demo Script

### The Pitch
"Let me show you how CommonTools makes shopping lists actually useful. Watch how AI automatically organizes your list by store aisle - and how anyone can create their own store layouts."

### Demo Flow (5 minutes)

#### Part 1: Bootstrap the Demo (30 seconds)
```
Action: Create space "alex-shopping-demo-1"
Action: Deploy demo-setup pattern
Result: Space initialized with charm-creator configured
```

**What the investor sees:**
- Clean new space
- Charm creator ready with "Shopping List" as an option

#### Part 2: Create Shopping List (1 minute)
```
Action: Click "Create Shopping List" in charm-creator
Result: New shopping list charm appears
Action: Add items via text input:
  - "milk"
  - "apples"
  - "ground beef"
  - "bread"
  - "ice cream"
  - "coffee"
Action: Ask omnibot: "Add bananas and shampoo to my shopping list"
Result: Items appear immediately
```

**What the investor sees:**
- Fast, simple list creation
- Omnibot integration works seamlessly
- "This looks like any shopping list... so far"

#### Part 3: The Magic - Aisle Sorting (2 minutes)
```
Action: Switch to mobile view (browser tools or resize)
Result: List adapts to mobile layout
Result: Button appears: "📍 Sort by Aisle (Kroger Main St)"
```

**What the investor sees:**
- Mobile-first design
- Context-aware button (GPS would enable this in real app)

```
Action: Click "Sort by Aisle"
Result: Modal appears: "Analyzing your items..." with spinner
Result: (1-2 seconds) List reorganizes by aisle:

  Aisle 1 - Produce
  ☐ apples
  ☐ bananas

  Aisle 3 - Dairy & Eggs
  ☐ milk

  Aisle 4 - Meat & Seafood
  ☐ ground beef

  Aisle 5 - Frozen Foods
  ☐ ice cream

  Aisle 6 - Beverages
  ☐ coffee

  Aisle 12 - Health & Beauty
  ☐ shampoo

Action: Check off "apples" in sorted view
Result: Apples strike-through in sorted view
Action: Switch back to basic list view
Result: Apples also checked there (shared data!)
```

**What the investor sees:**
- Instant AI categorization
- Real grocery store layout
- Edits sync across views
- "This would save me 10 minutes every shopping trip"

#### Part 4: The Kicker - Store Setup (1.5 minutes)
```
Action: Click "Set up a new store" button
Result: Store-setup-wizard appears
```

**UI shows:**
- Store name input: "Target on Broadway"
- Instructions: "Take photos of aisle signs as you walk through the store"
- Simulated camera button (for demo)

```
Action: Click "Simulate Aisle Photos" button
Result: Shows mockup images of aisle signs:
  - Photo 1: "Aisle 1 - Produce & Fresh Flowers"
  - Photo 2: "Aisle 2 - Breakfast & Cereal"
  - etc.
Action: Click "Generate Layout"
Result: Modal: "Processing images..." (2 seconds)
Result: Shows generated markdown outline
Action: Click "Save & Publish"
Result: "Target on Broadway Shopping List" created
Result: Shown on map where others nearby can find it
```

**What the investor sees:**
- User-generated store layouts
- Photo → structured data (aspirational but believable)
- Network effects: "Everyone who shops at this store benefits"
- "Wait, you're building a crowd-sourced database of every store layout in the world?"

#### Part 5: Close (30 seconds)
```
Action: Show both shopping list views side-by-side
Action: Add one more item via omnibot: "Add paper towels"
Result: Appears in basic list immediately
Result: After 1 second, auto-categorized to "Aisle 11 - Paper & Cleaning"
```

**What the investor sees:**
- Real-time updates
- AI working in the background
- Polished, production-ready feel

### Key Demo Moments to Nail

1. **Omnibot integration** - Must work flawlessly, shows platform capabilities
2. **The sorting moment** - Needs to feel like magic (1-2 sec latency max)
3. **Shared data sync** - Check item in one view, see it update in other
4. **Store setup** - This is the "aha!" moment for the business model
5. **Mobile responsiveness** - Smooth transitions, no janky layouts

## Product Requirements

### User Story
As a shopper, I want my shopping list to automatically organize items by store aisle, so I can shop more efficiently without manually sorting items.

### Core Features

1. **Base Shopping List**
   - Add/remove/check off items
   - Simple text-based items (title, done status)
   - Omnibot can add items via natural language
   - Works as standalone pattern
   - **Demo button**: "Set up a new store" (opens wizard)

2. **Aisle-Sorted View**
   - Takes same items + store layout outline
   - Uses LLM to assign each item to an aisle
   - Groups and sorts items by aisle order
   - Edits sync back to base list (shared data)
   - Loading states: "Analyzing your items..."
   - **Demo button**: "Back to basic view"

3. **Store-Specific Launcher**
   - Detects mobile viewport → shows "Sort by Aisle" button
   - Pre-configured with Kroger store layout
   - Smooth transitions between views
   - Shows store name badge: "📍 Kroger Main St"

4. **Store-Setup-Wizard** (New!)
   - Collects store name
   - **Demo mode**: "Simulate Aisle Photos" button
   - Shows mockup camera interface
   - Displays uploaded/simulated photos
   - "Generate Layout" → calls LLM to extract structure
   - Shows preview of generated markdown outline
   - "Save & Publish" → creates new curried launcher
   - **(Future) Real mode**: Uses device camera, real image upload

5. **Demo-Setup Pattern** (New!)
   - Bootstrap pattern for new demo spaces
   - Pre-configures charm-creator with "Shopping List" option
   - Sets up omnibot integration for shopping lists
   - Deploys Kroger launcher pattern
   - One-click demo environment

## Technical Architecture

### Pattern Structure

```
shopping-list.tsx
├─ Input: { items: ShoppingItem[] }
├─ Output: { items }
├─ UI: Basic list with checkboxes + add/remove
└─ Buttons: "Set up a new store" (opens wizard)

aisle-sorted-shopping-list.tsx
├─ Input: { items: Cell<ShoppingItem[]>, storeOutline: string, storeName: string }
├─ Output: { items, aisleGroups }
├─ UI: Items grouped by aisle with store name badge
├─ Loading state: "Analyzing your items..." modal
└─ Buttons: "Back to basic view"

shopping-list-launcher.tsx (responsive)
├─ Input: { items: ShoppingItem[] }
├─ Pre-baked: storeOutline = "Kroger Main St layout", storeName = "Kroger Main St"
├─ Creates: basicView = ShoppingList({ items })
├─ Creates: sortedView = AisleSortedList({ items, storeOutline, storeName })
├─ Desktop UI: Side-by-side views
├─ Mobile UI: Single view with "📍 Sort by Aisle (Kroger Main St)" button
└─ State: currentView = cell("basic" | "sorted")

store-setup-wizard.tsx
├─ Input: { onComplete: handler }
├─ Local state: storeName, photos[], generatedOutline
├─ UI Phase 1: Name input + "Simulate Aisle Photos" button
├─ UI Phase 2: Show photos + "Generate Layout" button
├─ UI Phase 3: Preview outline + "Save & Publish" button
├─ Output: Calls onComplete({ storeName, storeOutline })
└─ LLM: Converts photos → markdown outline

demo-setup.tsx
├─ Input: {}
├─ Actions on mount:
│  ├─ Configure wish("/defaultPattern/backlinksIndex") for omnibot
│  ├─ Deploy Kroger launcher to space
│  └─ Create charm-creator with "Shopping List" option
└─ UI: "Demo ready! Create your first shopping list →"
```

### Data Model

```typescript
interface ShoppingItem {
  title: string;
  done: Default<boolean, false>;
}

interface StoreOutline {
  // Markdown format:
  // # Produce
  // - Apples
  // - Bananas
  // # Dairy
  // - Milk
  // - Cheese
  content: string;
}
```

**No [ID] needed** - Items don't need stable IDs since we're not doing complex reordering or front-insertion.

**No sidecar storage needed** - The LLM framework automatically caches results! When an item's title doesn't change, llm() won't re-call. This is perfect for our use case.

### LLM Integration Pattern

```typescript
// In aisle-sorted-shopping-list.tsx recipe body:

const aisleAssignments = items.map((item) => {
  const assignment = llm({
    system: "You are a grocery store assistant. Given a store layout and an item, determine which aisle the item is in.",
    messages: [{
      role: "user",
      content: str`Store layout:\n${storeOutline}\n\nItem: ${item.title}\n\nWhich aisle is this item in? Respond with just the aisle name.`
    }]
  });

  return {
    item,
    aisle: assignment.result,
    pending: assignment.pending
  };
});

// Group by aisle
const grouped = derive(aisleAssignments, (assignments) => {
  const groups = {};
  for (const a of assignments) {
    if (!a.aisle) continue;
    const aisleName = a.aisle || "Unknown";
    if (!groups[aisleName]) groups[aisleName] = [];
    groups[aisleName].push(a.item);
  }
  return groups;
});
```

**Automatic caching**: When `item.title` and `storeOutline` don't change, llm() returns cached result. No manual tracking needed!

### Shared Data Pattern

Both patterns receive the **same Cell reference** to items:

```typescript
// In launcher:
const items = cell([]);  // Or from input

// Both get same Cell ref:
const basicView = ShoppingList({ items });
const sortedView = AisleSortedList({ items, storeOutline });

// Edits in either view update the shared cell
// React automatically propagates changes
```

This is **Pattern Composition** (Level 4 from PATTERNS.md).

## Implementation Plan

### Phase 1: Base Shopping List
- [ ] Simple add/remove/check with handlers
- [ ] Bidirectional binding for checkboxes ($checked)
- [ ] Message input for adding items
- [ ] patternTool export for omnibot integration
- [ ] "Set up a new store" button (opens wizard modal)
- [ ] Polish: empty state, item count, clear completed

### Phase 2: Aisle-Sorted View
- [ ] Accept items Cell + storeOutline + storeName
- [ ] Map items → llm() calls with store context
- [ ] Group by aisle (derive from llm results)
- [ ] Display grouped items with aisle headers
- [ ] Maintain bidirectional binding on shared items
- [ ] Loading state: modal with "Analyzing your items..."
- [ ] Handle "Unknown" category for unmatched items
- [ ] Store name badge: "📍 {storeName}"
- [ ] "Back to basic view" button

### Phase 3: Responsive Launcher
- [ ] Pre-bake Kroger storeOutline + storeName
- [ ] Instantiate both patterns (basicView, sortedView)
- [ ] Desktop: Side-by-side layout (2 columns)
- [ ] Mobile detection: viewport width < 768px
- [ ] Mobile: Single view + "Sort by Aisle" button
- [ ] View toggle state (basic ↔ sorted)
- [ ] Smooth transitions between views
- [ ] Test on actual mobile device

### Phase 4: Store Setup Wizard
- [ ] Three-phase wizard UI
- [ ] Phase 1: Store name input + "Simulate Aisle Photos"
- [ ] Mockup aisle sign images (5-6 photos)
- [ ] Phase 2: Display photos + "Generate Layout"
- [ ] LLM: Extract text from "photos" → markdown outline
- [ ] Phase 3: Preview outline (editable) + "Save & Publish"
- [ ] onComplete handler to create new launcher charm
- [ ] Loading states for LLM processing
- [ ] (Note: Real camera integration deferred)

### Phase 5: Demo Setup Bootstrap
- [ ] Auto-configure space on deploy
- [ ] Set up charm-creator with "Shopping List" option
- [ ] Deploy Kroger launcher pre-configured
- [ ] Wire omnibot to recognize shopping list patterns
- [ ] Success screen: "Demo ready!"
- [ ] Test full bootstrap flow

### Phase 6: Integration & Polish
- [ ] Deploy all patterns to localhost:8000
- [ ] Test full demo flow start-to-finish
- [ ] Verify omnibot: "Add X to shopping list"
- [ ] Test mobile responsiveness (resize browser)
- [ ] Verify LLM categorization accuracy (10 test items)
- [ ] Check loading states and error handling
- [ ] Polish animations and transitions
- [ ] Run through demo script 3x for timing

### Phase 7: Rehearsal
- [ ] Run full demo script with timer
- [ ] Practice transitions between phases
- [ ] Have fallback plan if LLM is slow
- [ ] Screenshot key moments for backup slides
- [ ] Test on actual mobile device (if available)

## Demo Store Layout

For the demo, we'll use this Kroger store layout:

```markdown
# Aisle 1 - Produce
Fresh fruits, vegetables, salads, herbs

# Aisle 2 - Bakery
Bread, bagels, donuts, cakes, tortillas

# Aisle 3 - Dairy & Eggs
Milk, yogurt, cheese, butter, eggs, cream

# Aisle 4 - Meat & Seafood
Beef, chicken, pork, fish, deli meats

# Aisle 5 - Frozen Foods
Ice cream, frozen vegetables, frozen meals, pizza

# Aisle 6 - Beverages
Soda, juice, water, coffee, tea

# Aisle 7 - Snacks & Chips
Chips, crackers, cookies, candy, nuts

# Aisle 8 - Canned Goods & Pantry
Canned vegetables, soup, pasta, rice, beans, sauces

# Aisle 9 - Breakfast & Cereal
Cereal, oatmeal, pancake mix, syrup

# Aisle 10 - Condiments & Spices
Ketchup, mustard, mayo, salad dressing, spices, oil

# Aisle 11 - Paper & Cleaning
Paper towels, toilet paper, cleaning supplies, detergent

# Aisle 12 - Health & Beauty
Shampoo, soap, toothpaste, vitamins, first aid
```

## Deferred Features (Post-Demo)

These features would make the system production-ready but are skipped for the demo:

1. **GPS-based store detection** - Automatically select the right store layout based on location
2. **Camera capture** - Take photos of aisle signs to generate store layout
3. **Crowd-sourced layouts** - Users publish curried patterns for stores in their area
4. **Assignment persistence** - Store aisle assignments to avoid LLM re-calls (though caching already handles this)
5. **Confidence scoring** - Show LLM confidence and allow manual override
6. **Learning from corrections** - If user moves item to different aisle, remember that

## Questions & Decisions

### Q: Should aisle-sorted pattern store assignments separately?
**A: No** - LLM framework auto-caches, so repeated calls with same item.title return instantly. No need for manual sidecar storage.

### Q: Do items need [ID] for stable identity?
**A: No** - We're not doing front-insertion or complex reordering. item.equals() is sufficient for removal.

### Q: How to handle items that don't match any aisle?
**A: "Other" group** - Items that LLM can't categorize go to an "Other" section at the end.

### Q: Mobile UX - Toggle or side-by-side?
**A: Start with side-by-side** for demo simplicity. Can add toggle later if needed.

### Q: How to make it "as real as possible" without GPS/camera?
**A: Pre-deploy the curried launcher** - Users would find "Kroger Main St Shopping List" in their charms. The experience is the same as if GPS selected it automatically.

## Success Criteria

### Must Have (Demo Blockers)
- [ ] Full demo flow completes in under 5 minutes
- [ ] Omnibot adds items correctly ("Add X to shopping list")
- [ ] "Sort by Aisle" button appears in mobile view
- [ ] LLM categorizes items in < 3 seconds total
- [ ] Items sync between basic and sorted views
- [ ] Store setup wizard completes without errors
- [ ] All buttons work on first click

### Should Have (Demo Polish)
- [ ] Loading states feel smooth (not janky)
- [ ] LLM categorizes 90%+ of test items correctly
- [ ] Mobile layout looks native (not desktop-squeezed)
- [ ] Transitions between views are smooth
- [ ] Empty states have helpful messaging
- [ ] Store name badge looks professional

### Nice to Have (Investor Wow Factor)
- [ ] Subtle animations on item check-off
- [ ] Aisle photos in wizard look realistic
- [ ] "Processing..." modals have personality
- [ ] Map visualization for published stores (mock)
- [ ] Item count badges on aisle headers

### Demo-Killer Bugs (Test Thoroughly)
- [ ] ❌ Omnibot doesn't recognize shopping list
- [ ] ❌ Button doesn't appear in mobile view
- [ ] ❌ LLM calls hang or timeout
- [ ] ❌ Checking item in sorted view doesn't update basic view
- [ ] ❌ Wizard crashes on "Generate Layout"
- [ ] ❌ Multiple rapid clicks cause duplicate items

## File Structure

```
/Users/alex/Code/recipes/recipes/alex/WIP/
├── shopping-list.tsx                    # Base pattern with omnibot
├── aisle-sorted-shopping-list.tsx       # Smart view with LLM sorting
├── shopping-list-launcher.tsx           # Responsive launcher (Kroger)
├── store-setup-wizard.tsx               # First-run store setup flow
├── demo-setup.tsx                       # Bootstrap pattern for demos
├── shopping-list-design.md              # This file
└── lib/                                 # Unmodified upstream references
```

## Demo Environment Setup

```bash
# Create fresh demo space
export CT_API_URL="http://localhost:8000/"
export CT_IDENTITY="/Users/alex/Code/labs/claude.key"

# Deploy demo-setup pattern
/Users/alex/Code/labs/dist/ct charm new \
  --space alex-shopping-demo-1 \
  /Users/alex/Code/recipes/recipes/alex/WIP/demo-setup.tsx

# demo-setup will automatically:
# - Configure charm-creator
# - Deploy Kroger launcher
# - Set up omnibot integration
```

## Demo Day Checklist

### 30 Minutes Before
- [ ] Start localhost:8000 server
- [ ] Clear browser cache
- [ ] Open browser DevTools (for mobile view toggle)
- [ ] Test internet connection (for LLM calls)
- [ ] Have design doc open for reference
- [ ] Backup screenshots ready (if LLM fails)

### 10 Minutes Before
- [ ] Create fresh space: alex-shopping-demo-{N}
- [ ] Deploy demo-setup pattern
- [ ] Verify charm-creator shows "Shopping List"
- [ ] Do quick smoke test (add one item)
- [ ] Close all other browser tabs

### During Demo
- [ ] Speak slowly and clearly
- [ ] Let animations complete before next action
- [ ] Point out "real" vs "aspirational" features
- [ ] If LLM is slow, narrate what's happening
- [ ] End with the big question: "What if every store layout was crowd-sourced?"

### Fallback Plans
- **LLM timeout**: Have pre-sorted list screenshot ready
- **Omnibot fails**: Manually add items, explain omnibot later
- **Mobile button missing**: Use desktop side-by-side view
- **Wizard crashes**: Show mockup slides of wizard flow
