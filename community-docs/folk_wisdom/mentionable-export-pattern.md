# Mentionable Export Pattern

**Status**: Folk Wisdom (confirmed by framework author and code analysis)
**Date**: 2025-11-25
**Confirmed by**: Framework author guidance, BacklinksIndex source code analysis

## Summary

Charms can export a `mentionable` property to make other cells discoverable via the `[[` autocomplete system. This is the recommended way to create new charms programmatically without corrupting storage.

## How It Works

### BacklinksIndex Aggregation

The `BacklinksIndex` pattern (in `labs/packages/patterns/backlinks-index.tsx`) aggregates mentionables from two sources:

1. **All charms in `allCharms`** - Every charm is automatically mentionable
2. **Exported `mentionable` property** - Any items a charm exports via its `mentionable` property

### Mentionable Property Format

The `mentionable` property can be either:

1. **An array of charms**:
   ```typescript
   return {
     // ... other properties
     mentionable: [charm1, charm2, charm3],
   };
   ```

2. **A Cell containing an array** (with `.get()` method):
   ```typescript
   const createdCharms = cell<any[]>([]);
   // ... add charms to createdCharms.push(newCharm)
   return {
     // ... other properties
     mentionable: createdCharms,
   };
   ```

### BacklinksIndex Code

```typescript
const mentionable = derive(allCharms, (charmList) => {
  const cs = charmList ?? [];
  const out: MentionableCharm[] = [];
  for (const c of cs) {
    out.push(c);
    const exported = (c as unknown as {
      mentionable?: MentionableCharm[] | { get?: () => MentionableCharm[] };
    }).mentionable;
    if (Array.isArray(exported)) {
      for (const m of exported) if (m) out.push(m);
    } else if (exported && typeof (exported as any).get === "function") {
      const arr = (exported as { get: () => MentionableCharm[] }).get() ?? [];
      for (const m of arr) if (m) out.push(m);
    }
  }
  return out;
});
```

## Usage Pattern

```typescript
import { cell, Cell, pattern, NAME, UI } from "commontools";
import SomeOtherPattern from "./some-other-pattern.tsx";

export default pattern<Input, Output>(({ ... }) => {
  // Track charms created by this pattern
  const createdCharms = cell<any[]>([]);

  // Handler that creates new charms
  const createCharm = handler<...>((_event, { createdCharms }) => {
    const newCharm = SomeOtherPattern({
      name: "New Item",
      // ... other properties
    });
    createdCharms.push(newCharm);
  });

  return {
    [NAME]: "My Pattern",
    [UI]: <div>...</div>,
    // Export created charms as mentionable
    // BacklinksIndex will pick these up and include them in #mentionable
    mentionable: createdCharms,
  };
});
```

## Important Notes

### DO NOT use allCharms.push()

**NEVER write OpaqueRefs directly to `allCharms`**. The framework author explicitly stated:
- `allCharms` is deprecated and going away
- Writing to `allCharms` can corrupt the space
- Use the `mentionable` export pattern instead

### Current Limitation: Not in All Charms List

As of 2025-11-25, `default-app` does NOT render all mentionables in the sidebar charm list. This is a future feature. However:
- Created charms ARE `[[`-mentionable (appear in autocomplete)
- Created charms CAN be navigated to directly
- This is the correct forward-compatible approach

### Page Refresh May Be Required

After creating new charms via the mentionable export, a page refresh may be needed for them to appear in the `[[` autocomplete. BacklinksIndex recalculates on each derive, but the shell's mention provider may cache results.

## Related Documentation

- `labs/packages/patterns/backlinks-index.tsx` - Source of truth for mentionable aggregation
- `labs/docs/common/PATTERNS.md` - General pattern documentation
