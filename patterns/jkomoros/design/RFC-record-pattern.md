# RFC: record.tsx — Data-Up Pattern Architecture

## Motivation

Alex has been building patterns **app-down** (person.tsx must be the perfect Person app) instead of **data-up** (accumulate data, grow structure organically). This contradicts the core thesis: "center on data, not apps" — but the patterns are mini-apps.

**The problem with mini-apps**: If patterns are mini-apps first (person.tsx, recipe.tsx), they're only useful when you need the complex/advanced use case. You have to wait until the pattern is "complete enough" to be worth using.

**The unlock with records**: Start accumulating data immediately, even with minimal functionality. Add structure over time as needs emerge. Instead of top-down mini-app creation, it's **bottom-up, emergent, out of the data**.

This is why Alex will actually migrate his Obsidian notes and Airtable CRM: he can start dumping data in today, and grow the structure as he uses it.

---

## Goals

### G1: Stable Entity Handle
The record provides a **stable charm ID** that can be @-referenced elsewhere. As sub-charms are added/removed, the record's identity stays the same.

### G2: Bottom-Up Data Accumulation
Start with just notes, add structure over time. Don't require upfront commitment to a pattern type. A record *becomes* a person record by adding person-relevant sub-charms.

### G3: Layout Management
Record manages how sub-charms are displayed (tabbed, sidebar, grid, stacked). Users can switch layouts and (future) drag-drop to rearrange.

### G4: Easy Stable Pointers
Create pointers to specific sub-charms **once** and reuse them — no repeated searching. If you need "the notes charm", store a reference directly, don't search the array every time.

### G5: Sub-Charms as First-Class Entities
Each sub-charm is a real pattern with its own storage. They happen to live inside a record, but they're not "fields" — they're full charms.

---

## Behavior Sketch

### Core Concept

- **`record.tsx`** — A meta-container. Starts with just title + a notes sub-charm.
- **Sub-charms** — Composable patterns that attach to records (notes, birthday, contact, dietary, etc.)
- The entity ID stays stable as you add/remove sub-charms
- A record *becomes* a person record when you attach person-relevant sub-charms

### User Flows

**Flow 1: Create New Record**
1. User creates new record charm
2. Record auto-creates a `notes.tsx` sub-charm
3. User sees: title bar + notes tab (single sub-charm)
4. User dumps unstructured info into notes
5. "This is John, met him at the conference. john@work.com. He's vegetarian and allergic to nuts."

**Flow 2: Add Sub-Charm**
1. User clicks [+] button in title bar
2. Dropdown shows available sub-charm types (birthday, contact, dietary, etc.)
3. User selects "Contact Info"
4. New sub-charm is created and appears as new tab
5. User can switch between notes and contact tabs

**Flow 3: Grow Structure Over Time**
1. User starts with just notes sub-charm
2. Notices they keep adding contact info → adds Contact sub-charm
3. Later realizes dietary info matters → adds Dietary sub-charm
4. Each extraction pass fills in more structure
5. Record "becomes" a rich person profile organically

### UI Wireframes

**Title Bar (Always Visible)**
```
+------------------------------------------------------------------+
| [Title Input: "John Smith"]    [+] [📐 Layout] [⋮ menu]          |
+------------------------------------------------------------------+
```

**Layout: Tabbed (Default)**
```
+------------------------------------------------------------------+
| [Title: John Smith]                    [+] [📐] [⋮]              |
+------------------------------------------------------------------+
| [📝 Notes] [🎂 Birthday] [📧 Contact] [🥗 Dietary]               |
+------------------------------------------------------------------+
|                                                                   |
|   (Currently selected sub-charm rendered inline)                  |
|                                                                   |
+------------------------------------------------------------------+
```

**Layout: Major + Sidebar**
```
+------------------------------------------------------------------+
| [Title: John Smith]                    [+] [📐] [⋮]              |
+------------------------------------------------------------------+
| +------------------------------------------+ +------------------+ |
| |                                          | | 🎂 Birthday      | |
| |  📝 Notes (main view)                    | |   1990-05-15     | |
| |                                          | +------------------+ |
| |  "This is John, met him at..."           | | 📧 Contact       | |
| |                                          | |   john@work.com  | |
| +------------------------------------------+ +------------------+ |
+------------------------------------------------------------------+
```

**Layout: Grid**
```
+------------------------------------------------------------------+
| +-------------------------+ +-------------------------+           |
| | 📝 Notes                | | 🎂 Birthday             |           |
| +-------------------------+ +-------------------------+           |
| +-------------------------+ +-------------------------+           |
| | 📧 Contact              | | 🥗 Dietary              |           |
| +-------------------------+ +-------------------------+           |
+------------------------------------------------------------------+
```

### Sub-Charms (Planned)

| Sub-Charm | Fields | Purpose |
|-----------|--------|---------|
| `notes.tsx` | content, extractedAt | Free-form text (auto-created) |
| `birthday-module.tsx` | birthDate, birthYear, reminderDays | Birthday tracking |
| `contact-module.tsx` | emails[], phones[], address | Contact info |
| `dietary-module.tsx` | allergies[], restrictions[], preferences[] | Food prefs |
| `relationship-module.tsx` | types[], closeness, howWeMet | Relationship context |

---

## Data Model Sketch

### Core Types

```typescript
// Wrapper adds layout info to underlying charm
interface PositionedCharm {
  charm: <reference to sub-charm>;
  layoutPosition: number;
  role?: "primary" | "secondary";
}

type LayoutConfig =
  | { type: "tabbed" }
  | { type: "major-sidebar"; majorIndex: number }
  | { type: "grid"; columns: number }
  | { type: "stacked" };

interface RecordInput {
  title: Default<string, "">;

  // Array of positioned sub-charms
  subCharms: Default<PositionedCharm[], []>;

  // Stable pointer to notes (Goal G4 - no searching)
  notesCharm?: <reference to Notes>;

  // Layout config
  layout: Default<LayoutConfig, { type: "tabbed" }>;
}
```

### Record Creation

On record creation, a notes sub-charm is automatically created and stored in two places:
1. In `subCharms[]` wrapped with layout position
2. In `notesCharm` as direct pointer (Goal G4)

Same charm object lives in both — framework object identity handles equality.

### Sub-Charm Contract

Each sub-charm exposes:
- **Identity**: `subCharmType`, `subCharmLabel`, `subCharmIcon`
- **LLM Integration** (optional): `extractionSchema`, `extractionHints`
- **Write handlers**: Stream handlers for parent to communicate (framework enforces write isolation)

---

## Open Questions for Framework Author

1. **Charm references in arrays**: What's the idiomatic way to store charm references in an array with wrapper metadata (like `PositionedCharm`)? Is it just `{ charm: SomePattern({}), layoutPosition: 0 }` and the framework handles the reference?

2. **Auto-initialization**: What's the pattern for "on first creation, also create a linked sub-charm"? Is there an initialization hook, or do we check if `subCharms` is empty and populate it?

3. **Direct pointers**: Can we store `notesCharm` as a direct reference to a charm that also lives in `subCharms[0].charm`? Or does duplicating references cause issues?

4. **Write isolation**: The research suggests parent can't write to sub-charm fields directly — sub-charms must expose Stream handlers. Is this still the recommended pattern for cross-charm communication?

5. **Object identity**: For finding a specific sub-charm in the array, is `Cell.equals()` the right approach, or is there a better pattern for "find the charm I have a reference to"?

---

## Implementation Sketch

### File Structure
```
patterns/jkomoros/
├── record.tsx                    # Main record pattern (meta-container)
├── notes.tsx                     # Notes sub-charm (auto-created with record)
├── sub-charms/
│   ├── birthday-module.tsx
│   ├── contact-module.tsx
│   └── ...
└── util/
    └── sub-charm-types.ts        # Shared types and contracts
```

### Phased Approach

**Phase 1: Foundation**
- `record.tsx` — meta-container with title + subCharms[]
- `notes.tsx` — notes sub-charm (auto-created with record)
- Basic tabbed layout

**Phase 2: More Sub-Charms**
- birthday, contact, dietary modules
- Add sub-charm via [+] button

**Phase 3: Layouts**
- Major + Sidebar, Grid, Stacked layouts
- Layout switcher UI

**Phase 4: LLM Extraction**
- Each sub-charm handles its own extraction (schemas must be static)
- Record triggers extraction across all sub-charms

---

## Appendix: Framework Research Findings

*This section documents what Alex has learned about framework capabilities through codebase investigation.*

### Reading/Writing Fields on Linked Charms

**Reading works** via `derive()`, `computed()`, or inside `.map()` and JSX contexts.

**Writing requires Stream.send()** — framework enforces write isolation. Sub-charms must expose Stream handlers for any field the parent needs to write.

### LLM Extraction Constraint

**KEY FINDING**: `generateObject` schemas must be static. Cannot dynamically combine schemas from attached sub-charms at runtime.

**Implication**: Each sub-charm handles its own extraction with its own static schema. Record triggers extraction by sending notes to each sub-charm's extraction handler.

### Inline Rendering

Both work:
- Full sub-charm UI via `<ct-render $cell={subCharm} />`
- Custom rendering with `derive()` for specific fields

### Backlinks

No automatic backlink discovery. Sub-charm stores `parentRecordId` explicitly if needed.

### Framework Capabilities Summary

| Capability | Status |
|------------|--------|
| Read fields on linked charm | ✅ via derive(), computed(), JSX |
| Write fields on linked charm | ⚠️ requires Stream handler |
| Dynamic schema for generateObject | ❌ schemas must be static |
| Create + link charm | ✅ Pattern({}) then array.push() |
| Inline rendering | ✅ ct-render or derive() |
