# Launcher Link Feature - Product Requirements Document

## Overview

Add an interactive charm linking feature to the Pattern Launcher (`tools/launch.ts`). This allows users to connect charm outputs to charm inputs directly from the CLI, with intelligent suggestions and visual feedback about type compatibility.

## Problem Statement

Currently linking charms requires:
```bash
cd ../labs && deno task ct charm link \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  baedrxxx.../outputField \
  baedryyyy.../inputField
```

**Pain points:**
- Must remember long charm IDs
- Must know the exact field paths
- No visibility into what fields exist on each charm
- No help determining compatible types
- No memory of recently deployed charms

## Goals

1. **Interactive linking**: Visual UI to browse and link charms
2. **Charm history**: Remember deployed charms with their IDs for easy reference
3. **Schema exploration**: Show available input/output fields on each charm
4. **Compatibility hints**: Highlight when types appear compatible (green) vs incompatible (red)
5. **Easy navigation**: Arrow keys to move between charms and fields

## User Experience

### Entry Point

Add "Link charms..." option to the main launcher menu:

```
🚀 Pattern Launcher

Select deployment target (↑/↓ to move, Enter to select):

→ 💻 localhost:8000 (last used)
  🌐 production (toolshed.saga-castor.ts.net)
  🔗 Link charms...
  ⚙️  Take other actions...
```

### Step 1: Select Space

```
🔗 Charm Linker

Select space (↑/↓ to move, Enter to select):
(type to filter)

→ 🔄 alex-1208-1 (last used, 5 charms)
  📅 alex-1208-2 (3 charms)
  ✨ Enter new space name...
```

Shows spaces with charm counts when available.

### Step 2: Select Source Charm (outputs)

```
📤 Select SOURCE charm (provides output):
(type to filter)

  From deployment history:
→ 📄 counter (deployed 5 min ago)
  📄 shopping-list (deployed 1 hour ago)
  📄 todo-app (deployed yesterday)

  Other charms in space:
  📄 gmail-agent (baedrei...3ioye)
  📄 data-store (baedrei...7xwga)
```

Shows:
- Recently deployed charms (from launcher history) first
- Other charms in the space below
- Both name and truncated ID for reference

### Step 3: Select Target Charm (inputs)

Same UI as Step 2, but labeled for TARGET (receives input).

### Step 4: Interactive Field Linking

This is the core interactive experience:

```
🔗 Link Fields

SOURCE: counter                    TARGET: display-panel
────────────────────────────────   ────────────────────────────────
  OUTPUT                             INPUT
→ [count: number]                  → [value: number]        ✅
  [label: string]                    [title: string]
  [history: number[]]                [items: any[]]
  [metadata: object]                 [config: object]
────────────────────────────────   ────────────────────────────────

← → Switch sides  |  ↑ ↓ Navigate  |  Enter Link  |  Q Quit
Current: counter/count → display-panel/value
Type compatibility: ✅ COMPATIBLE (number → number)
```

**Navigation:**
- **← →** (left/right arrows): Switch between SOURCE and TARGET columns
- **↑ ↓** (up/down arrows): Navigate fields within current column
- **Enter**: Create the link
- **Tab**: Jump to the other side's currently highlighted field
- **Q**: Cancel/quit

**Visual Feedback:**
- **✅ Green**: Types appear compatible
- **⚠️ Yellow**: Types might be compatible (e.g., `any` involved)
- **❌ Red**: Types appear incompatible
- **→** indicator shows which side is active

**Type Compatibility Rules:**
```
COMPATIBLE:
- Same primitive type (number→number, string→string)
- any → anything
- anything → any
- array → array (with element type check)
- object → object (structural match check)

POSSIBLY COMPATIBLE:
- unknown types (no schema info)
- any on either side

INCOMPATIBLE:
- Different primitive types (number→string)
- Primitive → array
- Array → primitive
```

### Step 5: Confirmation & Link

```
🔗 Creating link...

  SOURCE: counter/count (number)
  TARGET: display-panel/value (number)

Linking...
✅ Successfully linked counter/count → display-panel/value

Link another? (Y/n)
```

## Technical Design

### Config File Updates

Extend `.launcher-history` to track deployed charms:

```json
{
  "lastSpaceLocal": "alex-1208-1",
  "lastSpaceProd": "prod-space",
  "lastDeploymentTarget": "local",
  "patterns": [
    {
      "path": "/path/to/pattern.tsx",
      "lastUsed": "2025-12-08T12:00:00Z",
      "deployments": [
        {
          "space": "alex-1208-1",
          "charmId": "baedreiahv63wxwgaem4hzjkizl4qncfgvca7pj5cvdon7cukumfon3ioye",
          "deployedAt": "2025-12-08T12:00:00Z",
          "apiUrl": "http://localhost:8000"
        }
      ]
    }
  ],
  "recentCharms": [
    {
      "space": "alex-1208-1",
      "charmId": "baedreiahv...",
      "name": "counter",
      "recipeName": "counter.tsx",
      "deployedAt": "2025-12-08T12:00:00Z",
      "apiUrl": "http://localhost:8000"
    }
  ]
}
```

### New Data Structures

```typescript
interface CharmDeployment {
  space: string;
  charmId: string;
  deployedAt: string;
  apiUrl: string;
}

interface RecentCharm {
  space: string;
  charmId: string;
  name?: string;
  recipeName?: string;
  deployedAt: string;
  apiUrl: string;
}

interface CharmField {
  path: string[];          // e.g., ["users", "0", "email"]
  type: string;            // e.g., "string", "number", "object", "array"
  fullPath: string;        // e.g., "users/0/email"
  value?: unknown;         // Current value (for type inference)
}

interface CharmSchema {
  charmId: string;
  name?: string;
  inputs: CharmField[];    // Flattened input fields
  outputs: CharmField[];   // Flattened output fields
}
```

### Core Functions

```typescript
// Get all charms in a space with their schemas
async function getSpaceCharms(
  space: string,
  apiUrl: string,
  labsDir: string
): Promise<CharmSchema[]>

// Flatten an object into field paths with types
function flattenToFields(
  obj: unknown,
  basePath: string[] = []
): CharmField[]

// Check type compatibility between two fields
function checkTypeCompatibility(
  source: CharmField,
  target: CharmField
): "compatible" | "maybe" | "incompatible"

// Create a link between charms
async function createLink(
  space: string,
  apiUrl: string,
  sourceCharmId: string,
  sourcePath: string[],
  targetCharmId: string,
  targetPath: string[],
  labsDir: string
): Promise<void>

// Interactive two-column field selector
async function interactiveFieldLinker(
  sourceCharm: CharmSchema,
  targetCharm: CharmSchema
): Promise<{ sourcePath: string[]; targetPath: string[] } | null>
```

### CLI Commands Used

```bash
# List charms in space
deno task ct charm ls --space $SPACE --api-url $API_URL --identity $IDENTITY

# Inspect a charm (get source/result data)
deno task ct charm inspect --space $SPACE --charm $CHARM_ID --api-url $API_URL --identity $IDENTITY --json

# Create a link
deno task ct charm link --space $SPACE --api-url $API_URL --identity $IDENTITY $SOURCE_PATH $TARGET_PATH
```

### Type Inference Strategy

Since we get actual values from `inspect`, not schema definitions:

1. **Primitive detection**: `typeof value` gives us `string`, `number`, `boolean`, `object`
2. **Array detection**: `Array.isArray(value)`
3. **Null handling**: `value === null` → treat as `any`
4. **Object structure**: Recursively analyze nested objects
5. **Empty arrays**: Can't determine element type, treat as `any[]`

```typescript
function inferType(value: unknown): string {
  if (value === null || value === undefined) return "any";
  if (Array.isArray(value)) {
    if (value.length === 0) return "any[]";
    return `${inferType(value[0])}[]`;
  }
  if (typeof value === "object") return "object";
  return typeof value; // "string", "number", "boolean"
}
```

## Implementation Phases

### Phase 1: Infrastructure (This PR)
- [ ] Update config to store charm deployment history
- [ ] Capture charm ID when deploying via launcher
- [ ] Add "Link charms..." menu option (placeholder)

### Phase 2: Basic Linking
- [ ] Space selection with charm counts
- [ ] Charm selection (source and target)
- [ ] Simple field listing (flat, no nested)
- [ ] Basic link creation

### Phase 3: Interactive Field Browser
- [ ] Two-column display
- [ ] Left/right navigation between columns
- [ ] Up/down navigation within columns
- [ ] Type inference and display

### Phase 4: Type Compatibility
- [ ] Type compatibility checking
- [ ] Visual feedback (colors)
- [ ] Compatibility hints

### Phase 5: Polish
- [ ] Nested field expansion (drill into objects)
- [ ] Type filtering (show only compatible targets)
- [ ] Link history / undo
- [ ] "Link another?" flow

## Edge Cases

1. **Empty space**: "No charms in space. Deploy a pattern first."
2. **Charm has no outputs**: Show message, can't be source
3. **Charm has no inputs**: Show message, can't be target
4. **Circular links**: Warn but allow (system handles)
5. **Self-linking**: Allow (charm output → own input)
6. **Already linked**: Show existing link, offer to replace

## Non-Requirements (V1)

- ❌ Unlinking / removing links
- ❌ Viewing existing links graph
- ❌ Batch linking operations
- ❌ Link validation/testing
- ❌ Production deployment linking (start with localhost only)

## Success Criteria

1. Can link two charms without typing any IDs
2. Can see what fields are available on each charm
3. Get visual feedback about type compatibility
4. History makes finding recently deployed charms instant
5. Full operation in < 30 seconds

## Open Questions

1. **Nested fields**: How deep should we show?
   - *Proposal*: Show top-level, allow "expand" action

2. **Large objects**: What if a charm has 50+ fields?
   - *Proposal*: Type-to-filter within field list

3. **Array elements**: Link to specific index or whole array?
   - *Proposal*: Show both options, default to whole array

4. **Well-known IDs**: Support linking well-known charm list?
   - *Proposal*: Phase 2, after basics work

---

**End of PRD**
