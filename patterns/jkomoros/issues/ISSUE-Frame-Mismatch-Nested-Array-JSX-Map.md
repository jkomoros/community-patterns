# Issue: Frame Mismatch Error When Mapping Over Nested Array in JSX

## Summary

A "Frame mismatch" error occurs when mapping over a nested array property in JSX. The error appears both during deployment and in the browser console when the pattern runs.

## Use Case

**Pattern:** assumption-surfacer

**What you're trying to accomplish:**
- Display a list of "assumptions" where each assumption has an array of "alternatives"
- Each assumption is rendered with its alternatives listed (radio buttons, spans, etc.)
- The assumption data comes from a Cell that gets populated via `generateObject`

**Why you need this behavior:**
- Classic nested data structure: parent items with child items
- Very common UI pattern (e.g., categories with items, messages with attachments)

## Minimal Reproduction

### Pattern That TRIGGERS the Error

File: `patterns/jkomoros/WIP/frame-mismatch-repro-3.tsx`

Key elements:
1. Nested type structure: `Assumption` contains `alternatives: Alternative[]`
2. JSX that maps over the outer array AND the nested array

```typescript
interface Alternative {
  value: string;
  description?: string;
}

interface Assumption {
  id: string;
  label: string;
  alternatives: Alternative[];  // NESTED ARRAY
  selectedIndex: number;
  // ... other fields
}

// In the pattern's UI:
{assumptions.map((a) => (
  <div key={a.id}>
    <strong>{a.label}</strong>
    <div>
      {a.alternatives.map((alt, i) => (   // <-- THIS TRIGGERS THE ERROR
        <span key={i}>
          {i === a.selectedIndex ? "* " : ""}
          {alt.value}
        </span>
      ))}
    </div>
  </div>
))}
```

### Pattern That Does NOT Trigger the Error

File: `patterns/jkomoros/WIP/frame-mismatch-repro-4.tsx`

Same type structure, but does NOT map over the nested array in JSX:

```typescript
// Same types as above, but different JSX:
{assumptions.map((a) => (
  <div key={a.id}>
    <strong>{a.label}</strong>
    {/* Only accesses length, does NOT map over alternatives */}
    <div>({a.alternatives.length} alternatives)</div>
  </div>
))}
```

**This version works correctly with no errors.**

## Error Details

The error appears as:
```
Frame mismatch
```

It occurs:
1. During `deno task ct charm new` deployment
2. In browser console when the pattern loads/runs

## What We Tried

### Attempt 1: Simple generateObject + Cell Mutation (frame-mismatch-repro.tsx)

Basic pattern with generateObject and Cell mutation - **NO ERROR**

### Attempt 2: Added llmDialog (frame-mismatch-repro-2.tsx)

Added llmDialog for multi-turn chat - **NO ERROR**

### Attempt 3: Nested Types + Nested JSX Map (frame-mismatch-repro-3.tsx)

Added nested Alternative[] inside Assumption + mapped over it in JSX - **ERROR!**

### Attempt 4: Nested Types, NO Nested JSX Map (frame-mismatch-repro-4.tsx)

Same nested types, but only accessed `.length` instead of mapping - **NO ERROR**

## Analysis

The error is specifically triggered by:
1. Having a nested array type (array inside array item)
2. Mapping over that nested array in JSX

It is NOT triggered by:
- Having nested types alone
- Accessing properties of nested array items (like `.length`)
- Single-level array mapping
- generateObject or llmDialog usage alone

## Questions

1. **Is this a known limitation of the reactive system with nested arrays?**
2. **Is there a correct way to render nested arrays in JSX?**
3. **Should we flatten the data structure as a workaround?**
4. **Is there a special syntax needed for nested array access in JSX (like `$` prefix)?**

## Desired Behavior

Should be able to:
1. Have data structures with nested arrays (very common)
2. Map over both the outer and inner arrays in JSX
3. Render without Frame mismatch errors

## Workaround Attempts

**Potential workaround:** Flatten the alternatives into a separate top-level array with parent references, then join them in the UI. This is awkward but might avoid the issue.

## Environment

- CommonTools framework (latest)
- Pattern features used: `generateObject`, `llmDialog`, `computed`, `Cell`, `handler`
- All repro patterns are in `patterns/jkomoros/WIP/`

## Related Files

- `patterns/jkomoros/WIP/frame-mismatch-repro.tsx` - Base repro (no error)
- `patterns/jkomoros/WIP/frame-mismatch-repro-2.tsx` - With llmDialog (no error)
- `patterns/jkomoros/WIP/frame-mismatch-repro-3.tsx` - **TRIGGERS ERROR** (nested JSX map)
- `patterns/jkomoros/WIP/frame-mismatch-repro-4.tsx` - Same types, no nested map (no error)
- `patterns/jkomoros/WIP/assumption-surfacer.tsx` - Original pattern where discovered

---

**This is blocking the assumption-surfacer pattern which needs to display alternatives for each assumption. Any guidance on the correct approach would be greatly appreciated!**
