# Charm Registration - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/packages/charm/src/manager.ts`

---

## The "Cell Soup" Mental Model

⭐⭐ (2 confirmations)

**All cells exist in a shared "soup" within a space. Any cell with a `[UI]` property can be rendered, enabling complex composition between charms.**

### How Cells and Spaces Work

Every cell in the framework exists within a space. Think of a space as a container holding a "soup" of cells that can reference each other. This enables powerful composition:

```typescript
// Pattern A creates some cells
export default pattern<Input, Output>(({ ... }) => {
  const data = cell<MyData>({ ... });

  return {
    [NAME]: "Pattern A",
    [UI]: <div>Pattern A's UI</div>,
    data,  // Exposed for other patterns
  };
});

// Pattern B can reference Pattern A's cells
export default pattern<Input, Output>(({ patternARef }) => {
  // Can access data from Pattern A
  const sharedData = patternARef.data;

  return {
    [NAME]: "Pattern B",
    [UI]: <div>Uses data from: {sharedData.someField}</div>,
  };
});
```

### The [UI] Property

The `[UI]` property (actually the string `"$UI"`) holds VDOM for rendering:

```typescript
import { UI, NAME } from "commontools";

return {
  [NAME]: "My Pattern",
  [UI]: (
    <div>
      <h1>This is rendered when the charm is viewed</h1>
    </div>
  ),
};
```

**Important:** Any cell can have a `[UI]` property - not just top-level charms. This enables patterns to create sub-components that can be rendered independently.

---

## What Makes a "Charm" vs Just a Cell

⭐⭐ (2 confirmations)

**A "charm" is simply a cell that has been registered in the master charm list. Registration happens via `navigateTo()` or `ct charm new`. There is NO filtering based on `[UI]` property.**

### The Key Distinction

This is a crucial mental model:

- ❌ **NOT how it works:** "System finds all cells with UI and filters to show only the ones marked as charms"
- ✅ **How it actually works:** "Charm list is an append-only array. `navigateTo` and `ct charm new` are the only ways to add to it"

Cells with `[UI]` that are never navigated to simply don't appear in the charm list - they're not filtered out, they were never added.

### Why This Matters

This design allows:
1. **Sub-components** - Patterns can create internal UI cells without polluting the charm list
2. **Composition** - Multiple renderable cells can exist, only "top-level" ones become charms
3. **Explicit registration** - You control exactly what appears in the user's charm list

---

## The Registration Mechanism

⭐⭐ (2 confirmations)

**Charms are tracked in a well-known cell (`ALL_CHARMS_ID`). Registration happens automatically when you call `navigateTo()` or deploy via `ct charm new`.**

### The Master Charm List

All charms are stored in a single well-known cell:

```typescript
// From ~/Code/labs/packages/runner/src/builtins/well-known.ts
export const ALL_CHARMS_ID =
  "baedreiahv63wxwgaem4hzjkizl4qncfgvca7pj5cvdon7cukumfon3ioye";
```

The CharmManager loads this cell on initialization:

```typescript
// From ~/Code/labs/packages/charm/src/manager.ts
this.charms = this.runtime.getCellFromEntityId(
  this.space,
  { "/": ALL_CHARMS_ID },
  [],
  charmListSchema,  // { type: "array", items: { not: true, asCell: true } }
);
```

### Registration via navigateTo()

When you call `navigateTo(charmCell)`:

1. The shell's `navigateCallback` is triggered
2. It checks if the charm already exists in the list
3. If not, it calls `charmManager.add([target])`
4. The charm is appended to the master list

```typescript
// From ~/Code/labs/packages/shell/src/lib/runtime.ts (simplified)
navigateCallback: (target) => {
  const id = charmId(target);

  const charms = charmManager.getCharms();
  const existingCharm = charms.get().find((charm) =>
    charmId(charm) === id
  );

  if (!existingCharm) {
    await charmManager.add([target]);  // <-- Registers the charm!
  }

  navigate({ spaceName, charmId: id });
},
```

### Registration via ct charm new

When you deploy with `deno task ct charm new`:

1. The CLI creates the charm via `CharmsController.create()`
2. Internally calls `manager.runPersistent()`
3. Which calls `await this.add([charm])`
4. The charm is appended to the master list

### Practical Example

```typescript
import { handler, navigateTo } from "commontools";

// Creating and registering a new charm from within a pattern
const createNewItem = handler<...>((event, inputs) => {
  // Create the new pattern instance
  const newCharm = MyOtherPattern({ data: inputs.data });

  // navigateTo both:
  // 1. Navigates the UI to the new charm
  // 2. Registers it in the charm list (if not already there)
  return navigateTo(newCharm);
});
```

---

## Source Code References

| File | Purpose |
|------|---------|
| `~/Code/labs/packages/runner/src/builtins/well-known.ts` | `ALL_CHARMS_ID` constant definition |
| `~/Code/labs/packages/charm/src/manager.ts` | CharmManager class, `add()` method, charm list storage |
| `~/Code/labs/packages/shell/src/lib/runtime.ts` | Shell's `navigateCallback` that auto-registers charms |
| `~/Code/labs/packages/runner/src/builtins/navigate-to.ts` | `navigateTo` builtin implementation |
| `~/Code/labs/packages/charm/src/ops/charms-controller.ts` | `CharmsController.create()` for CLI deployments |

---

**Guestbook:**
- ✅ 2025-12-08 - Initial documentation based on framework code deep-dive (verified via labs source)
- ✅ 2025-12-08 - User-provided mental model ("cell soup", navigateTo registration) confirmed accurate

**Related:**
- `folk_wisdom/mentionable-export-pattern.md` - How charms become discoverable via `[[` autocomplete
- `folk_wisdom/patterns.md` - Pattern structure and Input/Output
