# Controller Module Pattern: Sub-Charms That Modify Parent State

**Status**: superstition (framework author confirmed, needs broader validation)
**Date**: 2025-12-19
**Author**: Claude + jkomoros

## Problem

You have a modular architecture where sub-charms (child patterns) need to modify the parent's state. For example:
- A TypePicker that adds modules to a Record's `subCharms` array
- A QuickAdd module that inserts new items into a parent list
- A Settings module that toggles features in the parent

How do you let a child pattern modify parent state while surviving JSON serialization (e.g., when created via backlinks)?

## Solution: Pass Parent Cells as INPUT

Pass the parent's Cells directly to the child pattern as INPUT parameters. The framework converts these to SigilLinks that survive serialization.

```typescript
// Parent pattern (record.tsx)
const typePickerCharm = TypePickerModule({
  parentSubCharms: subCharms,           // Cell<SubCharmEntry[]>
  parentTrashedSubCharms: trashedSubCharms,  // Cell<TrashedSubCharmEntry[]>
} as any);  // Cast needed to bypass Opaque type requirements
```

```typescript
// Child pattern (type-picker-module.tsx)
interface TypePickerInput {
  parentSubCharms: Cell<SubCharmEntry[]>;
  parentTrashedSubCharms: Cell<TrashedSubCharmEntry[]>;
  dismissed?: Default<boolean, false>;
}

export const TypePickerModule = pattern<TypePickerInput, TypePickerOutput>(
  ({ parentSubCharms, parentTrashedSubCharms, dismissed }) => {
    // Child can read and write parent Cells
    const applyTemplate = handler<...>((_event, { parentSubCharms, ... }) => {
      const current = parentSubCharms.get() || [];
      // Modify and set back
      parentSubCharms.set(updatedList);
      parentTrashedSubCharms.push(newItem);
    });

    return {
      [NAME]: "...",
      [UI]: (...),
      dismissed,
    };
  }
);
```

## Why This Works

1. **Framework converts Cells to SigilLinks** - When you pass a Cell as INPUT, `convertCellsToLinks()` automatically converts it to a SigilLink with `overwrite: "redirect"`

2. **SigilLinks survive JSON serialization** - The link format is JSON-safe:
   ```json
   { "/": { "link@1": { "id": "...", "path": [...], "space": "..." } } }
   ```

3. **Links are restored on deserialization** - When the charm is recreated (e.g., via backlink), the SigilLinks are converted back to Cell references pointing to the original parent Cells

4. **`overwrite: "redirect"` means writes go to source** - When the child calls `.set()` or `.push()`, the change is applied to the parent's Cell, not a copy

## Framework Author Confirmation

From PR #182 (2025-12-18):
> "yes, pass them in at construction and you co-own it"

This confirms that passing parent Cells as constructor arguments is the intended pattern for composed patterns that need to share and modify state.

## When to Use This Pattern

**Use Controller Modules when:**
- Child needs to ADD/REMOVE items from parent's array
- Child needs to modify parent's structure (not just its own data)
- You want the child to be a separate charm (can be trashed/restored)
- The modification logic belongs conceptually to the child

**Don't use when:**
- Child only needs to export data (use Data-Up pattern instead)
- Parent can handle the logic directly (use Handler pattern)
- Communication is event-based (use Custom Events)

## Complete Example: TypePicker

```typescript
// type-picker-module.tsx

interface TypePickerInput {
  parentSubCharms: Cell<SubCharmEntry[]>;
  parentTrashedSubCharms: Cell<TrashedSubCharmEntry[]>;
  dismissed?: Default<boolean, false>;
}

// Handler that modifies parent state
const applyTemplate = handler<
  unknown,
  {
    parentSubCharms: Cell<SubCharmEntry[]>;
    parentTrashedSubCharms: Cell<TrashedSubCharmEntry[]>;
    templateId: string;
  }
>((_event, { parentSubCharms, parentTrashedSubCharms, templateId }) => {
  const current = parentSubCharms.get() || [];

  // Find existing modules
  const notesEntry = current.find((e) => e?.type === "notes");
  const selfEntry = current.find((e) => e?.type === "type-picker");

  // Create new modules from template
  const templateEntries = createTemplateModules(templateId);
  const newModules = templateEntries.filter((e) => e.type !== "notes");

  // Update parent's subCharms array
  const updatedList = [
    notesEntry,
    ...newModules,
    ...current.filter((e) => e?.type !== "notes" && e?.type !== "type-picker"),
  ];
  parentSubCharms.set(updatedList);

  // Trash self (move to parent's trash)
  if (selfEntry) {
    parentTrashedSubCharms.push({
      ...selfEntry,
      trashedAt: new Date().toISOString(),
    });
  }
});

export const TypePickerModule = pattern<TypePickerInput, TypePickerOutput>(
  ({ parentSubCharms, parentTrashedSubCharms, dismissed }) => {
    return {
      [NAME]: "Choose Type",
      [UI]: (
        <div>
          {templates.map((template) => (
            <button
              onClick={applyTemplate({
                parentSubCharms,
                parentTrashedSubCharms,
                templateId: template.id,
              })}
            >
              {template.icon} {template.name}
            </button>
          ))}
        </div>
      ),
      dismissed,
    };
  }
);
```

## Caveats

1. **Circular dependencies** - If the child imports from a registry that imports the child, you get circular deps. Import the child pattern directly in the parent instead.

2. **Restore from trash** - When a controller module is restored from trash, the parent Cell references are preserved (stored as SigilLinks in the charm object).

3. **Testing** - Test both CLI creation and backlink creation paths to ensure serialization works correctly.

## Related Patterns

- **Two-Lift Pattern** (`2025-12-19-auto-init-use-two-lift-pattern.md`) - How to auto-initialize controller modules
- **Composed Patterns Share Cells** (`2025-12-18-composed-patterns-share-cells-directly.md`) - Framework author guidance on Cell sharing

## Real-World Usage

- `patterns/jkomoros/record/record.tsx` - Parent that creates TypePicker with parent Cells
- `patterns/jkomoros/record/sub-charms/type-picker-module.tsx` - Controller module that modifies parent state
