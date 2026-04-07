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
- **LLM Integration** (optional): field mappings for extraction routing
- **Data access**: Depends on how sub-charm is created:

**Composed sub-charms** (created inline with record):
- Share Cell inputs directly with parent — no Stream handlers needed
- Parent writes to shared cells; sub-charm reads reactively
- This is the idiomatic pattern for tightly-coupled components

**Wished sub-charms** (discovered via wish()):
- Require Stream handlers due to write isolation
- Parent calls `stream.send()` inside handler with `Stream<T>` type signature
- Use when sub-charm might exist independently

---

## Open Questions for Framework Author

### Original Questions

1. **Charm references in arrays**: What's the idiomatic way to store charm references in an array with wrapper metadata (like `PositionedCharm`)? Is it just `{ charm: SomePattern({}), layoutPosition: 0 }` and the framework handles the reference?

2. **Auto-initialization**: What's the pattern for "on first creation, also create a linked sub-charm"? Is there an initialization hook, or do we check if `subCharms` is empty and populate it?

3. **Direct pointers**: Can we store `notesCharm` as a direct reference to a charm that also lives in `subCharms[0].charm`? Or does duplicating references cause issues?

4. **Object identity**: For finding a specific sub-charm in the array, is `Cell.equals()` the right approach, or is there a better pattern for "find the charm I have a reference to"?

### New Questions (from implementation critique)

5. **Composed vs wished sub-charms**: For sub-charms created inline with the record (not via wish()), can the parent share Cell inputs directly without Stream handlers? Community docs suggest this is idiomatic ("share cells between composed patterns"), but want to confirm.

6. **Single combined schema**: Given generateObject requires static schemas, is a single combined schema (covering all sub-charm fields) the right approach? Or is there a pattern for triggering separate generateObject calls sequentially/in parallel?

7. **Inactive tab rendering**: In tabbed layout, do sub-charms on inactive tabs still execute their reactive flows? The critique noted `ct-render` is needed to force charm execution — does this apply to composed sub-charms too?

8. **Entity reconciliation timing**: For Phase 2+ (array-type entities), what's the recommended pattern for stable entity IDs across extractions? Generate UUID on first extraction and store it? Use content-hash via `refer()`?

---

## Data Flow and Re-Extraction

*This section addresses framework author questions about editing data in sub-charms and entity reconciliation.*

### Architecture Decision: One-Way Extraction with Selective Accept

**Data flows one direction:** Notes → Extraction → Sub-charm (with user approval per field)

This design was chosen because:

1. **Framework alignment**: WriteIsolation enforces one-way cross-charm writes. Sub-charms must expose Stream handlers for the parent to send data — there's no automatic "sync back" mechanism.

2. **Conceptual clarity**: The record IS the source of truth. There's no external CRM or database to sync with. The notes sub-charm holds the unstructured data; structured sub-charms hold the extracted/curated version.

3. **Proven pattern**: Matches person.tsx extraction flow and gmail-importer.tsx sync patterns — both are strictly one-way.

### Re-Extraction Flow

When user adds more notes and clicks "Re-extract":

```
User adds notes → clicks "Re-extract"
                       ↓
         Record snapshots notes into trigger cell
                       ↓
         Single generateObject() with combined static schema
                       ↓
         Compare extracted vs current sub-charm data
                       ↓
         Show per-field diff UI (grouped by sub-charm)
                       ↓
         User selects which fields to accept
                       ↓
         Record routes accepted fields to sub-charms
                       ↓
         Sub-charms update via shared cells or Stream handlers
```

**Key implementation detail**: Due to framework constraint (generateObject schemas must be static), we use a **single combined schema** covering all extractable fields, then route results to appropriate sub-charms:

```typescript
const { result, pending } = generateObject({
  prompt: extractTrigger,  // Snapshot, not raw notes
  schema: {
    type: "object",
    properties: {
      // Birthday fields
      birthDate: { type: "string" },
      birthYear: { type: "number" },
      // Contact fields
      email: { type: "string" },
      phone: { type: "string" },
      // Dietary fields
      allergies: { type: "array", items: { type: "string" } },
      // ... all fields statically defined upfront
    }
  }
});
```

### Per-Field Selective Accept UI

Instead of "replace all or nothing", users can cherry-pick changes:

```
Re-extraction found changes:
┌────────────────────────────────────────────┐
│ Birthday                                    │
│ Current: March 15, 1990                    │
│ Extracted: March 14, 1990                  │
│ [✓ Accept] [Keep Mine]                     │
├────────────────────────────────────────────┤
│ Email                                       │
│ Current: john@personal.com  (user changed) │
│ Extracted: john@work.com                   │
│ [Accept] [✓ Keep Mine]                     │
├────────────────────────────────────────────┤
│ NEW: Phone                                  │
│ Extracted: 555-1234                         │
│ [✓ Accept] [Ignore]                        │
└────────────────────────────────────────────┘
         [Apply Selected] [Cancel]
```

**Why this matters**: User corrected the email. Without per-field selection, they'd have to choose between:
- Accepting all changes (losing their email correction)
- Rejecting all changes (losing the birthday fix + new phone)

Per-field selection lets them keep corrections while accepting new data.

### Why NOT Bidirectional Sync

Bidirectional sync (edits in sub-charm update notes) was rejected:

- **Framework friction**: Would require sub-charm → parent Stream handlers for every field, plus conflict detection
- **Conceptual mismatch**: How would you write `phone: 555-1234` back into prose like "met John at conference, his email is..."?
- **No existing patterns**: Neither gmail-importer nor person.tsx attempt bidirectional sync

### Why NOT Overlay/Delta Model

Overlay model (store base + user deltas separately) was rejected:

- **Complexity**: Every field needs base/override tracking
- **Per-field accept achieves same goal**: Users preserve corrections by declining specific changes, without complex delta storage
- **Conceptual mismatch**: record.tsx IS the source; there's no external system to overlay against

---

## Entity Reconciliation

*Addressing the N:M problem raised by framework author: "when a person splits into N projects and that mapping is a bit fuzzy then redoing the extraction later might end up another number of projects, any data attached to earlier ones gets detached"*

### The Challenge

When re-extracting entities that can multiply (Projects, Tasks, etc.):
- 1 project might become 2 (split)
- 3 projects might become 2 (merge)
- "Phoenix Project" might become "Phoenix Web" (rename)

How do we preserve user data attached to old entities?

### Phased Approach

**Phase 1 (MVP): Type-based matching (1:1)**
- Each sub-charm type appears once: one Birthday module, one Contacts module
- Re-extraction updates the existing sub-charm of that type
- No N:M problem because mapping is inherently 1:1

**Phase 2: Semantic key matching for arrays**
- For entity arrays (Projects, Tasks), use semantic keys:
  - Entity name + approximate context from extraction
  - Fuzzy string matching (Levenshtein distance threshold)
- Show user when entities change:
  ```
  Project changes detected:
  - "Phoenix" → matched existing
  - "Infrastructure" → NEW (add?)
  - "Old Website" → not in new extraction (keep? remove?)
  ```

**Phase 3 (Future): LLM-assisted reconciliation**
- For ambiguous cases: "Did 'Phoenix Project' split into 'Phoenix Web' and 'Phoenix Mobile'?"
- Tombstones for removed entities (mark hidden vs actually delete)
- User can restore hidden entities if extraction was wrong

### Key Insight

The selective accept UI helps with entity reconciliation too:
- **New entities**: Shown as "NEW", user can accept or ignore
- **Missing entities**: "No longer in notes - Keep anyway? Remove?"
- **Ambiguous splits**: Requires Phase 3 UX work, but framework is ready

### Sub-Charm Data Access Patterns

**For composed sub-charms** (recommended for record.tsx):
```typescript
// Sub-charm receives shared cell from parent
interface BirthdayModuleInput {
  data: Default<{ birthDate?: string; birthYear?: number }, {}>;
}

// Parent writes directly to shared cell
birthdayData.set({ birthDate: "1990-03-15", birthYear: 1990 });
```

**For wished sub-charms** (if sub-charm exists independently):
```typescript
interface ExtractionCapableSubCharm<T> {
  // Current data for comparison (read via derive())
  currentData: T;

  // Stream handler for receiving approved extractions
  applyExtraction: Stream<{ fields: Partial<T> }>;
}

// Parent must use handler with Stream<T> signature
const sendToSubCharm = handler<
  { data: Partial<T> },
  { stream: Stream<{ fields: Partial<T> }> }
>(({ data }, { stream }) => {
  stream.send({ fields: data });
});
```

---

## Implementation Notes

*Critical implementation details discovered through framework analysis and pattern critique.*

### Per-Field Selection State

The per-field accept UI requires tracking user selections:

```typescript
// Track which fields user has selected to accept
const fieldSelections = Cell.of<Record<string, boolean>>({});

// When extraction completes, initialize selections (default: accept all)
const initializeSelections = handler<...>((_event, { changesPreview }) => {
  const changes = changesPreview.get();
  const initial: Record<string, boolean> = {};
  for (const change of changes) {
    initial[change.field] = true;  // Default: accept
  }
  fieldSelections.set(initial);
});

// Apply only user-selected fields
const applySelectedFields = handler<...>((_event, state) => {
  const selections = fieldSelections.get();
  const extracted = extractionResult.get();

  for (const [field, selected] of Object.entries(selections)) {
    if (selected && extracted[field] !== undefined) {
      routeFieldToSubCharm(field, extracted[field]);
    }
  }

  // Clear extraction state
  fieldSelections.set({});
});
```

### Edge Case Handling

**Must implement in MVP:**

```typescript
// Disable extract button when pending or notes too short
const canExtract = computed(() =>
  !extractionPending && notes.length > 10
);

// Handle extraction states
const extractionStatus = computed(() => {
  if (extractionPending) return "loading";
  if (!extractionResult) return "idle";
  if (changesPreview.length === 0) return "no-changes";
  return "has-changes";
});

// Use trigger cell pattern (snapshot notes at extraction time)
// This prevents stale extraction if notes change during extraction
const extractTrigger = Cell.of<string>("");

const startExtraction = handler<...>((_event, { notes, extractTrigger }) => {
  extractTrigger.set(`${notes.get()}\n---EXTRACT-${Date.now()}---`);
});
```

**UI states to handle:**
- `loading`: Show spinner, disable extract button
- `idle`: Show "Extract" button
- `no-changes`: Show "No new information found" message
- `has-changes`: Show per-field diff UI

### Reusable Utilities

Copy from person.tsx:
- `compareFields()` from `utils/diff-utils.ts` — compares extracted vs current
- `computeWordDiff()` — highlights word-level changes for notes
- `extractTrigger` pattern — prevents extraction on every keystroke

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
