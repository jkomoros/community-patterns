# Records + Modules: Design Documents

## Overview

This document contains two parts:
1. **RFC for Framework Author** - Questions and capability requirements for Berni
2. **PRD for record.tsx** - Full product requirements for the pattern

---

# Part 1: RFC - Framework Capabilities for Modular Records

## Context

We want to build a "record" pattern where:
- A record starts as just title + notes (unstructured)
- Modules can be attached as **separate charms** linked via `OpaqueRef<Module>[]`
- Each module is a standalone pattern file (birthday-module.tsx, contact-module.tsx)
- LLM extraction should populate fields across multiple linked module charms
- The record's identity remains stable as modules are added/removed

This architecture follows the "data-up" philosophy: accumulate data first, add structure incrementally via modules.

---

## Research Findings (Answered via Codebase Investigation)

### Q1: Reading/Writing Fields on Linked Charms

**ANSWER: READ ✅ YES, WRITE ❌ NO (directly)**

**Reading works** via `derive()`, `computed()`, or inside `.map()` and JSX contexts:
```typescript
// ✅ Inside .map() - OpaqueRef is unwrapped automatically
{modules.map((module) => (
  <div>{module.moduleLabel}</div>  // Direct property access works
))}

// ✅ Using derive() for reactive access
const birthDate = derive(birthdayModule, m => m.birthDate);

// ✅ Inside computed()
const allSchemas = computed(() => {
  return modules.map(m => m.extractionSchema);
});

// ❌ Direct access outside JSX/map fails
const x = birthdayModule.birthDate;  // Error: "Tried to directly access an opaque value"
```

**Writing requires Stream.send()** - framework enforces write isolation:
```typescript
// ❌ Direct write fails
birthdayModule.birthDate.set("1990-05-15");  // WriteIsolationError

// ✅ Module must expose a Stream for receiving writes
// In birthday-module.tsx:
interface BirthdayModuleOutput {
  birthDate: string;
  setBirthDate: Stream<{ value: string }>;  // Handler exposed as Stream
}

// In record.tsx:
birthdayModule.setBirthDate.send({ value: "1990-05-15" });
```

**Implication**: Modules must expose `Stream<T>` handlers for any field the parent record needs to write.

---

### Q2: Module Schema Discovery

**ANSWER: Export as Output property, read via derive()**

```typescript
// birthday-module.tsx
interface BirthdayModuleOutput {
  moduleType: "birthday";
  moduleLabel: "Birthday";
  extractionSchema: object;  // Exported for parent to read
  // ... data fields
}

// record.tsx - reading schema from linked module
const schema = derive(birthdayModule, m => m.extractionSchema);
```

**Works because**: `derive()` unwraps OpaqueRef reactively.

---

### Q3: Combined LLM Extraction Across Linked Charms

**ANSWER: ❌ NO - Schemas MUST be static**

This is a **KEY ARCHITECTURAL CONSTRAINT**:

```typescript
// ❌ DOES NOT WORK - schema cannot be computed
const dynamicSchema = computed(() => buildSchemaFromModules(modules));
const { result } = generateObject({
  schema: dynamicSchema,  // ERROR: schema must be static
  prompt: notes,
});

// ✅ WORKS - prompt can be dynamic, schema must be static
const { result } = generateObject({
  schema: {  // Static object literal
    type: "object",
    properties: { /* fixed at compile time */ }
  },
  prompt: derive(notes, n => `Extract from: ${n}`),  // Dynamic prompt OK
});
```

**Implications for Architecture** (see "Revised Extraction Strategy" below):
1. Cannot dynamically combine schemas from attached modules
2. Need alternative extraction approach

---

### Q4: Module Contract Enforcement

**ANSWER: TypeScript types + convention (no runtime enforcement)**

```typescript
// Define contract
interface ModuleContract {
  moduleType: string;
  moduleLabel: string;
  moduleIcon: string;
  extractionSchema: object;
  applyExtraction: Stream<{ data: unknown }>;  // For receiving extracted data
}

// Type the array
modules: Default<OpaqueRef<ModuleContract>[], []>
```

Framework doesn't enforce at runtime, but TypeScript catches violations at compile time.

---

### Q5: Creating Module Instances from Record

**ANSWER: Call pattern function directly, then push to array**

```typescript
import BirthdayModule from "./modules/birthday-module.tsx";

const addBirthdayModule = handler<unknown, {
  modules: Cell<OpaqueRef<ModuleContract>[]>;
  entityId: string;
}>((_event, { modules, entityId }) => {
  // Create new module charm
  const newModule = BirthdayModule({ parentRecordId: entityId });

  // Add to array (creates the link)
  modules.push(newModule);
});
```

**Lifecycle notes:**
- Removing from array does NOT delete the charm (just removes reference)
- Charm continues to exist in space
- Can be re-added or discovered via `wish()`

---

### Q6: Inline vs Linked Rendering

**ANSWER: Both work, can mix**

```tsx
// Option A: Full module UI via ct-render
{modules.map((module) => (
  <ct-render $cell={module} />
))}

// Option B: Custom rendering with derive()
{modules.map((module) => (
  <div>
    <h3>{derive(module, m => `${m.moduleIcon} ${m.moduleLabel}`)}</h3>
    <div>Birth date: {derive(module, m => m.birthDate)}</div>
  </div>
))}

// Option C: Mix - some inline, link to full view
{modules.map((module) => (
  <ct-card>
    <div>{derive(module, m => m.moduleLabel)}</div>
    <ct-button onClick={() => navigateTo(module)}>Open Full View</ct-button>
  </ct-card>
))}
```

---

### Q7: Backlinks / Reverse Discovery

**ANSWER: Store parentRecordId explicitly**

No automatic backlink discovery. Module stores parent ID:

```typescript
// birthday-module.tsx
interface BirthdayModuleInput {
  parentRecordId?: Default<string, "">;  // Set when created
  // ...
}

// To find parent, use wish() with the ID
const parent = wish<RecordOutput>({
  query: `#record ${parentRecordId}`,  // Or filter by ID
});
```

---

### Q8: Module Lifecycle Events

**ANSWER: None - handle in add/remove handlers**

No `onAttached`/`onDetached` hooks. Initialize in creation, clean up in removal handler.

---

## Summary of Framework Capabilities

| Need | Status | Solution |
|------|--------|----------|
| Read fields on OpaqueRef | ✅ YES | `derive()`, `computed()`, JSX/map context |
| Write fields on OpaqueRef | ❌ NO | Module must expose `Stream<T>` handler |
| Dynamic schema for generateObject | ❌ NO | **Schemas must be static** |
| Module contract enforcement | ✅ Partial | TypeScript types (no runtime) |
| Create + link charm | ✅ YES | `Pattern({})` then `array.push()` |
| Inline rendering | ✅ YES | `<ct-render>` or custom via `derive()` |
| Schema discovery from modules | ✅ YES | Export as Output property, read via `derive()` |
| Backlinks / reverse lookup | ⚠️ Manual | Store `parentRecordId`, use `wish()` |
| Lifecycle hooks | ❌ NO | Handle in add/remove handlers |

---

## Revised Extraction Strategy (Given Static Schema Constraint)

Since schemas cannot be dynamic, we have three options:

### Option A: Per-Module Extraction (Recommended)

Each module handles its own extraction independently:

```typescript
// record.tsx triggers extraction
const triggerExtraction = handler((_, { modules, notes }) => {
  for (const module of modules.get()) {
    // Send notes to each module's extraction handler
    module.extractFromNotes.send({ notes: notes.get() });
  }
});

// birthday-module.tsx handles its own extraction
const { result } = generateObject({
  schema: BIRTHDAY_SCHEMA,  // Static, module-specific
  prompt: extractionTrigger,
  system: "Extract birthday information only...",
});
```

**Pros**: Clean separation, each module owns its schema
**Cons**: Multiple LLM calls (one per module), no cross-module context

### Option B: Static Combined Schema

Define ALL possible module schemas upfront in record.tsx:

```typescript
// record.tsx - static schema with all possible modules
const COMBINED_SCHEMA = {
  type: "object",
  properties: {
    birthday: { type: "object", properties: { birthDate: {...}, birthYear: {...} } },
    contact: { type: "object", properties: { emails: {...}, phones: {...} } },
    dietary: { type: "object", properties: { allergies: {...}, preferences: {...} } },
    // ... all modules defined statically
  },
};

const { result } = generateObject({
  schema: COMBINED_SCHEMA,
  prompt: notes,
  system: `Extract data for these active modules: ${activeModuleTypes.join(", ")}`,
});

// Then push relevant portions to each module
for (const module of modules) {
  const data = result[module.moduleType];
  if (data) module.applyExtraction.send({ data });
}
```

**Pros**: Single LLM call, cross-module context
**Cons**: Record must know all module schemas upfront, less extensible

### Option C: Two-Phase Extraction

First extract to generic structure, then interpret:

```typescript
// Phase 1: Generic extraction in record.tsx
const { result: rawExtraction } = generateObject({
  schema: {
    type: "object",
    properties: {
      entities: { type: "array", items: { type: "object", properties: {
        type: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
      }}}
    }
  },
  prompt: notes,
  system: "Extract all structured data as key-value pairs with type hints...",
});

// Phase 2: Each module interprets relevant entities
for (const module of modules) {
  const relevantData = rawExtraction.entities.filter(e =>
    module.acceptsEntityTypes.includes(e.type)
  );
  module.interpretExtraction.send({ entities: relevantData });
}
```

**Pros**: Flexible, modules interpret independently
**Cons**: Two LLM calls (or complex single prompt), lossy translation

### Recommendation: Option A (Per-Module) for MVP

Start with per-module extraction for simplicity and clean architecture. Can optimize to Option B later if performance is an issue.

---

# Part 2: PRD - record.tsx Pattern

## Goals

### G1: Stable Entity Handle
The record provides a **stable charm ID** that can be @-referenced elsewhere. As sub-charms are added/removed, the record's identity stays the same.

### G2: Bottom-Up Data Accumulation
Start with just notes, add structure over time. Don't require upfront commitment to a pattern type. A record *becomes* a person record by adding person-relevant sub-charms.

### G3: Layout Management
Record manages how sub-charms are displayed (tabbed, sidebar, grid, stacked). Users can switch layouts and (future) drag-drop to rearrange.

### G4: Easy Stable Pointers
Create pointers to specific sub-charms **once** and reuse them - no repeated searching. If you need "the notes charm", store a reference directly, don't search the array every time.

### G5: Sub-Charms as First-Class Entities
Each sub-charm is a real pattern with its own storage. They happen to live inside a record, but they're not "fields" - they're full charms.

---

## Motivation: Why This Matters Now

### The Swarm Philosophy

From "Seeding the Swarm": We optimize for **Useful Charm Interactions (UCI)** - moments when someone uses a charm and would rate their anger at losing it as 8+ out of 10. Not demo views. Not test runs. Real interactions with real stakes where the charm provides real value.

**The Paradox We Must Escape**: We've been trying to build demos that everyone agrees are perfect. But when your value proposition is "perfectly personal software tailored to individual needs," trying to find one demo that excites everyone contradicts the vision.

**The Pattern We Must Break**: Historically, we've bitten off massive chunks - complex multi-user systems with real-time sync and beautiful UIs - before we had basic patterns working reliably. We'd spend more time debating where to run than actually learning to crawl.

**The Key Insight**: We each already intuitively know what we want to build and use. That personal intuition is our compass. As long as we build in a way that creates shared components and patterns - climbing the same mountain from different paths - we'll naturally converge on powerful abstractions.

### The Shift

We're making a fundamental shift:
- From research mode → To product mode
- From planning perfection → To shipping daily
- From coordinated demos → To emergent usage
- From outside-in design → To inside-out growth
- From hypothetical users → To ourselves as users

### Core Insight: Data-Up, Not App-Down

We've been building **app-down** (person.tsx must be the perfect Person app) instead of **data-up** (accumulate data, grow structure organically).

This contradicts our core thesis. We say "center on data, not apps" but we're building mini-apps.

**Flip the mental model: Record first, modules second.**

Instead of `note.tsx` → `person.tsx` → `family.tsx` as separate patterns with overlapping features, create:
- **`record.tsx`** — A universal container. Starts as just a notes field + title.
- **Modules** — Composable feature bundles that attach to records (Birthday, Gift Tracker, Professional Contact, Dietary Preferences, etc.)

The entity ID stays stable as you add/remove modules. A record *becomes* a person record when you attach person-relevant modules—not by being created as a different pattern type.

---

## The Unlock: Why This Changes Everything

**The problem with mini-apps**: If patterns are mini-apps first (person.tsx, recipe.tsx), they're only useful when you need the complex/advanced use case. You have to wait until the pattern is "complete enough" to be worth using.

**The unlock with records**: Start accumulating data immediately, even with minimal functionality. Add structure over time as needs emerge. Instead of top-down mini-app creation, it's **bottom-up, emergent, out of the data**.

This is why I (Alex) will actually migrate my Obsidian notes and Airtable CRM: I can start dumping data in today, and grow the structure as I use it.

---

## Problem Statement

We're not living in the fabric yet. Despite 50+ patterns, nobody has migrated their daily workflows into Common Tools. Two blockers:

1. **Data fragility** - Fear of loss from storage wipes during development
2. **Pattern fragility** - Patterns are over-ambitious demos, not robust daily tools

The second is deeper: we've been building patterns that try to be complete apps upfront, rather than allowing structure to emerge from use.

---

## Implementation Sketch

### Core Data Model

**Wrapper pattern**: Sub-charms wrapped with layout metadata. Rely on framework object identity (no `[ID]` symbol needed).

```typescript
// Wrapper adds layout info to underlying charm
interface PositionedCharm {
  charm: OpaqueRef<any>;           // The actual sub-charm
  layoutPosition: number;           // Position in layout
  role?: "primary" | "secondary";   // Optional semantic hint
}

interface RecordInput {
  title: Default<string, "">;

  // Array of positioned sub-charms
  subCharms: Default<PositionedCharm[], []>;

  // Stable pointers - stored once, not searched (Goal G4)
  notesCharm?: OpaqueRef<Notes>;    // Direct pointer to notes sub-charm

  // Layout config
  layout: Default<LayoutConfig, { type: "tabbed" }>;
}
```

**On record creation:**
```typescript
// Create notes sub-charm
const notes = Notes({});

// Wrap it with position info
const wrapper = { charm: notes, layoutPosition: 0, role: "primary" };
subCharms.push(wrapper);

// Store direct pointer (Goal G4 - no searching needed later)
notesCharm.set(notes);
```

**Why this works:**
- `notesCharm` is a stable pointer - use it directly, never search
- `subCharms[]` holds wrappers with layout info
- Framework object identity handles equality (no `[ID]` needed)
- Same charm object can be in `subCharms[0].charm` AND `notesCharm`

### Sub-Charms (The Building Blocks)

Sub-charms are standalone patterns that live inside records:
- `notes.tsx` - Free-form text (every record starts with one)
- `birthday-module.tsx` - Birthday tracking
- `contact-module.tsx` - Emails, phones, addresses
- `dietary-module.tsx` - Food preferences/restrictions
- etc.

Each sub-charm:
- Has its own storage and identity
- Can be rendered inline or navigated to
- Exposes `Stream<T>` handlers for cross-charm communication
- Can be moved between records (future)

### Record Creation Flow

**On record creation, a notes sub-charm is automatically created:**

```typescript
// In record.tsx initialization
const notes = Notes({});

// Wrap it with position info
const wrapper: PositionedCharm = {
  charm: notes,
  layoutPosition: 0,
  role: "primary"
};
subCharms.push(wrapper);

// Store direct pointer (Goal G4 - no searching needed later)
notesCharm.set(notes);
```

**Why this works:**
- `notesCharm` is a stable pointer - use it directly, never search
- `subCharms[]` holds wrappers with layout info
- Framework object identity handles equality (no `[ID]` needed)
- Same charm object lives in both `subCharms[0].charm` AND `notesCharm`

### Layouts

Record manages how sub-charms are displayed. Initial layouts:

| Layout | Description | Use Case |
|--------|-------------|----------|
| **Tabbed** | Each sub-charm is a tab | Default, clean for few charms |
| **Major + Sidebar** | One large charm, others stacked in sidebar | Notes as main, modules in sidebar |
| **Grid** | Sub-charms arranged in grid | Dashboard view of multiple charms |
| **Stacked** | All sub-charms vertically stacked | Mobile-friendly, scrollable |

Future: Drag-and-drop to rearrange sub-charms within layouts.

```typescript
type LayoutConfig =
  | { type: "tabbed" }
  | { type: "major-sidebar"; majorIndex: number }
  | { type: "grid"; columns: number }
  | { type: "stacked" };
```

### Sub-Charm Contract

Based on research findings, sub-charms must expose `Stream<T>` handlers for writes (framework enforces write isolation):

```typescript
interface SubCharmContract {
  // Identity (read-only from parent)
  subCharmType: string;       // "notes", "birthday", "contact-info", "dietary"
  subCharmLabel: string;      // Human-readable name
  subCharmIcon: string;       // Emoji

  // LLM Integration (not applicable for notes.tsx)
  extractionSchema?: object;  // JSON Schema for this sub-charm's extraction
  extractionHints?: string;   // System prompt hints for LLM

  // Write handlers (Stream<T> - required for parent to write)
  extractFromNotes?: Stream<{ notes: string }>;  // Trigger extraction from notes
  applyExtraction?: Stream<{ data: unknown }>;   // Apply extracted data directly

  // Optional: Parent reference
  parentRecordId?: string;
}
```

**Why Stream handlers?** Framework enforces write isolation - parent record cannot directly call `.set()` on sub-charm fields. Sub-charms must expose explicit write channels.

---

## Planned Sub-Charms (v1)

### 0. Notes (`notes.tsx`) — Required, Auto-Created

**Every record starts with this sub-charm automatically created.**

**Fields:**
- `content: string` — Free-form text content
- `extractedAt?: string` — Timestamp of last extraction (to show what's changed)

**UI:**
- Full-width text editor
- "Extract to Modules" button
- Shows extraction history/diff

**Extraction hints:** Not applicable — notes is the source, not a target

---

### 1. Birthday Module (`birthday-module.tsx`)
**Fields:**
- `birthDate: string` (YYYY-MM-DD)
- `birthYear: number | null` (if only year known)
- `reminderDays: number[]` (days before to remind)

**Extraction hints:** "Extract birthday, birth date, or age information"

---

### 2. Contact Module (`contact-module.tsx`)
**Fields:**
- `emails: Array<{ type: "work" | "home" | "other", value: string }>`
- `phones: Array<{ type: "mobile" | "work" | "home", value: string }>`
- `address: string`

**Extraction hints:** "Extract email addresses, phone numbers, and physical addresses"

---

### 3. Dietary Module (`dietary-module.tsx`)
**Fields:**
- `allergies: string[]`
- `restrictions: string[]` (vegetarian, kosher, etc.)
- `preferences: string[]` (likes)
- `dislikes: string[]`

**Extraction hints:** "Extract food allergies, dietary restrictions, preferences, and dislikes"

---

### 4. Relationship Module (`relationship-module.tsx`)
**Fields:**
- `types: Array<"friend" | "colleague" | "family" | ...>`
- `closeness: "intimate" | "close" | "casual" | "distant"`
- `howWeMet: string`
- `origins: string[]` (contexts: "work", "school", etc.)

**Extraction hints:** "Extract relationship type, how we met, and relationship closeness"

---

### 5. Social Links Module (`social-module.tsx`)
**Fields:**
- `links: Array<{ platform: string, handle: string, url?: string }>`

**Extraction hints:** "Extract social media handles and profiles"

---

### 6. Tags Module (`tags-module.tsx`)
**Fields:**
- `tags: string[]`
- `categories: string[]`

**Extraction hints:** "Extract tags, categories, or labels"

---

## User Flows

### Flow 1: Create New Record
1. User creates new record charm
2. Record auto-creates a `notes.tsx` sub-charm and stores it:
   - In `subCharms[]` wrapped as `{ charm: notes, layoutPosition: 0, role: "primary" }`
   - In `notesCharm` as direct pointer (Goal G4)
3. User sees: title bar + notes tab (single sub-charm)
4. User dumps unstructured info into notes
5. "This is John, met him at the conference. john@work.com. He's vegetarian and allergic to nuts."

### Flow 2: Add Sub-Charm
1. User clicks [+] button in title bar
2. Dropdown shows available sub-charm types (birthday, contact, dietary, etc.)
3. User selects "Contact Info"
4. New `contact-module.tsx` charm is created and wrapped:
   - `{ charm: newContact, layoutPosition: subCharms.length }`
5. Sub-charm appears as new tab (or sidebar item, depending on layout)
6. User can switch between notes and contact tabs

### Flow 3: Extract Data (Per-Module Strategy)

Based on research: schemas must be static, so each sub-charm handles its own extraction.

1. User clicks "Extract from Notes" (in notes sub-charm or record header)
2. Record reads notes content via `derive(notesCharm, n => n.content)`
3. Record sends notes to each attached sub-charm via `subCharm.extractFromNotes.send({ notes })`
4. Each sub-charm runs its own `generateObject` with its static schema
5. Each sub-charm shows extraction preview internally
6. User reviews/confirms per sub-charm
7. Sub-charm updates its own fields

**Why per-module?** Framework constraint: `generateObject` schemas must be static. Cannot dynamically combine schemas at runtime.

### Flow 4: Grow Structure Over Time
1. User starts with just notes sub-charm
2. Notices they keep adding contact info → adds Contact sub-charm
3. Later realizes dietary info matters → adds Dietary sub-charm
4. Each extraction pass fills in more structure
5. Record "becomes" a rich person profile organically

---

## UI Design

### Title Bar (Always Visible)
```
+------------------------------------------------------------------+
| [Title Input: "John Smith"]    [+] [📐 Layout] [⋮ menu]          |
+------------------------------------------------------------------+
```
- **Title**: Editable, becomes record's display name
- **[+]**: Add sub-charm dropdown (birthday, contact, dietary, etc.)
- **[📐 Layout]**: Switch between layouts (tabbed, sidebar, grid, stacked)
- **[⋮ menu]**: Record-level actions (delete, export, etc.)

### Layout: Tabbed (Default)
```
+------------------------------------------------------------------+
| [Title: John Smith]                    [+] [📐] [⋮]              |
+------------------------------------------------------------------+
| [📝 Notes] [🎂 Birthday] [📧 Contact] [🥗 Dietary]    [×remove]  |
+------------------------------------------------------------------+
|                                                                   |
|   (Currently selected sub-charm rendered via <ct-render>)         |
|                                                                   |
|   +-----------------------------------------------------------+   |
|   | Notes content here...                                     |   |
|   | "This is John, met him at the conference..."              |   |
|   +-----------------------------------------------------------+   |
|                                                                   |
+------------------------------------------------------------------+
```

### Layout: Major + Sidebar
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
| |                                          | +------------------+ |
| |                                          | | 🥗 Dietary       | |
| |                                          | |   vegetarian     | |
| +------------------------------------------+ +------------------+ |
+------------------------------------------------------------------+
```

### Layout: Grid
```
+------------------------------------------------------------------+
| [Title: John Smith]                    [+] [📐] [⋮]              |
+------------------------------------------------------------------+
| +-------------------------+ +-------------------------+           |
| | 📝 Notes                | | 🎂 Birthday             |           |
| | "This is John..."       | | 1990-05-15              |           |
| +-------------------------+ +-------------------------+           |
| +-------------------------+ +-------------------------+           |
| | 📧 Contact              | | 🥗 Dietary              |           |
| | john@work.com           | | vegetarian, nut allergy |           |
| +-------------------------+ +-------------------------+           |
+------------------------------------------------------------------+
```

### Extraction Preview Modal
```
+--------------------------------------------------+
| Review Extracted Data                            |
+--------------------------------------------------+
| From notes:                                      |
| "met him at conference, john@work.com, vegetarian|
|  and allergic to nuts"                           |
+--------------------------------------------------+
| 📧 Contact Info:                                 |
|   + email: john@work.com (work)                  |
|                                                  |
| 🥗 Dietary:                                      |
|   + allergies: ["nuts"]                          |
|   + restrictions: ["vegetarian"]                 |
+--------------------------------------------------+
| Remaining notes:                                 |
| "met him at conference"                          |
+--------------------------------------------------+
| [Cancel]                        [Apply Changes]  |
+--------------------------------------------------+
```

---

## Technical Architecture

### File Structure
```
patterns/jkomoros/
├── record.tsx                    # Main record pattern (meta-container)
├── notes.tsx                     # Notes sub-charm (auto-created with record)
├── sub-charms/
│   ├── birthday-module.tsx
│   ├── contact-module.tsx
│   ├── dietary-module.tsx
│   ├── relationship-module.tsx
│   ├── social-module.tsx
│   └── tags-module.tsx
└── util/
    └── sub-charm-types.ts        # Shared types and contracts
```

### Record Data Model

**Wrapper pattern**: Sub-charms wrapped with layout metadata. Rely on framework object identity (no `[ID]` symbol needed).

```typescript
// Wrapper adds layout info to underlying charm
interface PositionedCharm {
  charm: OpaqueRef<any>;           // The actual sub-charm
  layoutPosition: number;           // Position in layout
  role?: "primary" | "secondary";   // Optional semantic hint
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

  // Stable pointers - stored once, not searched (Goal G4)
  notesCharm?: OpaqueRef<Notes>;    // Direct pointer to notes sub-charm

  // Layout config
  layout: Default<LayoutConfig, { type: "tabbed" }>;

  // Metadata
  createdAt?: Default<string, "">;
}

interface RecordOutput extends RecordInput {
  // Display
  displayName: string;  // title or "(Untitled Record)"
  subCharmCount: number;

  // For external queries
  profile: RecordInput;
}
```

### Module Data Model (Example: Contact)
```typescript
interface ContactModuleInput {
  parentRecordId?: Default<string, "">;
  emails?: Default<EmailEntry[], []>;
  phones?: Default<PhoneEntry[], []>;
  address?: Default<string, "">;
}

interface ContactModuleOutput extends ContactModuleInput {
  // Contract fields
  moduleType: "contact-info";
  moduleLabel: "Contact Info";
  moduleIcon: "📧";
  extractionSchema: object;

  // Display
  primaryEmail: string;
  primaryPhone: string;
}
```

---

## Success Criteria

- [ ] Can create a record (auto-creates notes sub-charm)
- [ ] Can dump unstructured text into notes sub-charm
- [ ] Can add/remove sub-charms without data loss
- [ ] Record charm ID remains stable through sub-charm changes (Goal G1)
- [ ] `notesCharm` pointer provides direct access without searching (Goal G4)
- [ ] LLM extraction populates correct sub-charm fields via per-module strategy
- [ ] Can switch between layouts (tabbed, sidebar, grid, stacked)
- [ ] Can migrate existing person.tsx data to record + sub-charms
- [ ] At least one person using records for daily note capture (UCI target)

---

## Migration Path

### From person.tsx to record + sub-charms

1. Create `migratePersonToRecord()` utility
2. Maps person.tsx fields to appropriate sub-charms:
   - `displayName, givenName, familyName` → record title
   - `emails, phones` → contact sub-charm
   - `birthday` → birthday sub-charm
   - `relationshipTypes, closeness` → relationship sub-charm
   - `socialLinks` → social sub-charm
   - `notes` → notes sub-charm content

3. person.tsx could become a "preset" that:
   - Creates a record
   - Auto-attaches person-relevant sub-charms (contact, birthday, relationship)
   - Provides person-specific UI chrome

---

## Open Questions

1. **Sub-charm discovery**: Import directly or use `wish("#record-sub-charm")`?
2. **Sub-charm uniqueness**: Can a record have two contact sub-charms? Should it?
3. **Nested sub-charms**: Can a sub-charm contain other sub-charms?
4. **Sub-charm templates**: Pre-configured sub-charm sets (e.g., "Person" = contact + birthday + relationship)?
5. **Drag-drop reordering**: How does layoutPosition update when user rearranges?

---

## Implementation Phases

### Phase 1: Foundation
- `record.tsx` — meta-container with title + subCharms[]
- `notes.tsx` — notes sub-charm (auto-created with record)
- PositionedCharm wrapper structure
- Basic tabbed layout
- notesCharm stable pointer (Goal G4)

### Phase 2: More Sub-Charms
- `birthday-module.tsx`
- `contact-module.tsx`
- `dietary-module.tsx`
- Add sub-charm via [+] button
- Inline rendering via `<ct-render>`

### Phase 3: Layouts
- Major + Sidebar layout
- Grid layout
- Stacked layout
- Layout switcher UI

### Phase 4: LLM Extraction (Per-Module)
- Each sub-charm implements its own `generateObject` with static schema
- Sub-charm exposes `extractFromNotes: Stream<{ notes: string }>` handler
- Extraction preview in each sub-charm
- Record triggers extraction across all sub-charms via `Stream.send()`

### Phase 5: Polish
- `relationship-module.tsx`
- `social-module.tsx`
- `tags-module.tsx`
- Sub-charm suggestions based on notes content
- Migration utility from person.tsx

---

## What This Unlocks

This isn't just about robustness—it's about **matching the fabric's philosophy at the pattern layer**:

- ✅ Data accumulates independent of apps
- ✅ Structure emerges from use, not upfront design
- ✅ Modules are the "infinite software" at pattern scale
- ✅ Same data, different views based on attached modules

We've been building apps on a fabric designed to transcend apps. Time to stop.

---

## Framework Capabilities Summary (Research Complete)

| Capability | Status | Implementation |
|------------|--------|----------------|
| Read fields on OpaqueRef | ✅ YES | `derive()`, `computed()`, JSX/map context |
| Write fields on OpaqueRef | ⚠️ Indirect | Module must expose `Stream<T>` handler |
| Dynamic schema for generateObject | ❌ NO | Schemas must be static - use per-module extraction |
| Create + link charm | ✅ YES | `Pattern({})` then `array.push()` |
| Inline rendering of linked charms | ✅ YES | `<ct-render>` or custom via `derive()` |
| Backlinks / reverse lookup | ⚠️ Manual | Store `parentRecordId`, use `wish()` |

**No blocking questions for Berni** - all capabilities are now understood. The architecture adapts to framework constraints (per-module extraction instead of combined schema).

---

## Critical Files for Implementation

| File | Purpose |
|------|---------|
| `patterns/jkomoros/meal-orchestrator.tsx` | OpaqueRef[] composition, Stream.send(), charm linking |
| `patterns/jkomoros/person.tsx` | LLM extraction patterns, generateObject usage |
| `patterns/jkomoros/page-creator.tsx` | Creating charms programmatically |
| `~/Code/labs/docs/common/CHARM_LINKING.md` | Cross-charm communication patterns |
| `~/Code/labs/docs/common/LLM.md` | generateObject constraints and usage |
