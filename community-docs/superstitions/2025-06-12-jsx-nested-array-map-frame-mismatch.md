# Superstition: Nested Array Mapping in JSX Causes Frame Mismatch Error

---

## DISCLAIMER

This is a **SUPERSTITION** - an unverified observation from a single session. It may be:
- Wrong or incomplete
- Context-specific
- A misunderstanding of the actual cause
- Fixed in newer framework versions

**Treat with extreme skepticism.** Verify against official docs and test thoroughly.

---

## Metadata

```yaml
topic: jsx
discovered: 2025-06-12
confirmed_count: 1
last_confirmed: 2025-06-12
sessions: [assumption-surfacer-dev]
related_labs_docs: none
related_issue: patterns/jkomoros/issues/ISSUE-Frame-Mismatch-Nested-Array-JSX-Map.md
status: superstition
stars: ⭐
```

## Problem

When mapping over a **nested array property** in JSX, a "Frame mismatch" error occurs during deployment and/or at runtime.

## What Doesn't Work

```tsx
interface Alternative {
  value: string;
  description?: string;
}

interface Assumption {
  id: string;
  label: string;
  alternatives: Alternative[];  // Nested array
  selectedIndex: number;
}

// In JSX - THIS TRIGGERS FRAME MISMATCH ERROR:
{assumptions.map((a) => (
  <div key={a.id}>
    <strong>{a.label}</strong>
    <div>
      {a.alternatives.map((alt, i) => (  // <-- NESTED MAP CAUSES ERROR
        <span key={i}>{alt.value}</span>
      ))}
    </div>
  </div>
))}
```

## What Works (Workaround)

**Option 1: Flatten the data structure**

Store alternatives in a separate flat array with parent references:

```tsx
interface FlatAlternative {
  assumptionId: string;
  index: number;
  value: string;
  description?: string;
}

interface Assumption {
  id: string;
  label: string;
  alternativeCount: number;  // Just the count, not the array
  selectedIndex: number;
}

// Separate flat array
const flatAlternatives: FlatAlternative[] = [...];

// In JSX - single-level maps only:
{assumptions.map((a) => (
  <div key={a.id}>
    <strong>{a.label}</strong>
    <div>
      {/* Filter from flat array instead of nested map */}
      {flatAlternatives
        .filter((alt) => alt.assumptionId === a.id)
        .map((alt) => (
          <span key={alt.index}>{alt.value}</span>
        ))}
    </div>
  </div>
))}
```

**Option 2: Don't render nested arrays (if acceptable)**

```tsx
// Just show count instead of mapping:
{assumptions.map((a) => (
  <div key={a.id}>
    <strong>{a.label}</strong>
    <div>({a.alternatives.length} alternatives)</div>
  </div>
))}
```

**Option 3: Use a computed to pre-flatten**

```tsx
// Pre-compute a flattened view
const flattenedView = computed(() => {
  return assumptions.get().flatMap((a) =>
    a.alternatives.map((alt, idx) => ({
      assumptionId: a.id,
      assumptionLabel: a.label,
      alternativeIndex: idx,
      alternativeValue: alt.value,
      isSelected: idx === a.selectedIndex,
    }))
  );
});
```

## Context

- Discovered while building assumption-surfacer pattern
- Pattern uses `generateObject` to get assumptions with nested alternatives
- Error appears both at `deno task ct charm new` time and in browser console
- Minimal repro confirmed: `frame-mismatch-repro-3.tsx` triggers error, `frame-mismatch-repro-4.tsx` (same types, no nested map) works fine

## Notes

- The nested array **type** itself is fine
- Accessing nested array **properties** (like `.length`) is fine
- Only **mapping over** the nested array in JSX triggers the error
- This appears to be a framework bug in how reactive proxies handle nested array iteration

## Related

- Full issue with repro code: `patterns/jkomoros/issues/ISSUE-Frame-Mismatch-Nested-Array-JSX-Map.md`
- Repro patterns: `patterns/jkomoros/WIP/frame-mismatch-repro-*.tsx`
- `2025-12-17-conditional-and-in-map-leaks-alias.md` - related issue with conditionals inside .map()

## Guestbook

- 2025-06-12 - Initial discovery while building assumption-surfacer pattern
- 2025-12-17 - Confirmed nested .map() still problematic. In google-docs-comment-orchestrator, nested replies.map() inside comments.map() worked when all data was deep-copied to plain values in pre-computed array. Key: deep-copy ALL nested objects/arrays, not just spread top level. (google-docs-comment-orchestrator / jkomoros)
