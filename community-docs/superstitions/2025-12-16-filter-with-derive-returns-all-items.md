# filter() with derive() Inside Returns All Items

## Summary

**Never use `derive()` inside a `.filter()` callback on reactive arrays.** The `derive()` function returns a reactive value (OpaqueRef), not a plain boolean. Since all OpaqueRefs are truthy, the filter passes ALL items through regardless of the condition.

## The Problem

```tsx
// ❌ BAD: derive() inside filter - ALL items pass through!
{specialDepartments
  .filter((dept) => derive(dept, d => d.location.startsWith("front")))
  .map((dept) => (
    <div>{dept.name}</div>
  ))}
```

This looks like it should filter to only departments on the front wall, but **every department appears** because `derive()` returns a reactive wrapper, not `true`/`false`.

## The Fix

Use `computed()` OUTSIDE the JSX to pre-filter the array:

```tsx
// ✅ GOOD: Pre-filter with computed() outside JSX
const frontDepartments = computed(() =>
  specialDepartments.filter((dept) => dept.location?.startsWith("front"))
);

// In JSX - just map the pre-filtered array
{frontDepartments.map((dept) => (
  <div>{dept.name}</div>
))}
```

Inside `computed()`, reactive values are auto-unwrapped, so plain property access (`dept.location`) works correctly and returns actual booleans.

## Why This Happens

1. `derive(item, fn)` returns an `OpaqueRef<T>`, not `T`
2. JavaScript's `.filter()` tests for truthiness
3. All OpaqueRef objects are truthy (they're objects, not `null`/`undefined`/`false`)
4. Therefore, every item passes the filter

## Symptoms

- Filter appears to have no effect
- All items show in every filtered section
- In store-mapper.tsx: ALL departments appeared under EVERY wall (Front, Back, Left, Right) instead of being separated

## Real Example

From `store-mapper.tsx` - wall display was broken:

```tsx
// ❌ BEFORE: All departments appeared under ALL walls
{specialDepartments
  .filter((dept) => derive(dept, d => d.location.startsWith("front")))
  .map((dept: OpaqueRef<DepartmentRecord>) => (
    <div className="wall-display-front">
      {derive(dept, d => `${d.icon} ${d.name}`)}
    </div>
  ))}

// ✅ AFTER: Pre-compute filtered arrays
const frontDepartments = computed(() =>
  specialDepartments.filter((dept) => dept.location?.startsWith("front"))
);
const backDepartments = computed(() =>
  specialDepartments.filter((dept) => dept.location?.startsWith("back"))
);
// ... etc for left, right

// In JSX - just map
{frontDepartments.map((dept: OpaqueRef<DepartmentRecord>) => (
  <div className="wall-display-front">
    {derive(dept, d => `${d.icon} ${d.name}`)}
  </div>
))}
```

## Key Insight

The pattern is:
1. **`computed()` for data transformation** - filtering, sorting, grouping
2. **`.map()` in JSX** - rendering the transformed data
3. **`derive()` for property access** - displaying individual item properties

Don't mix these - `derive()` is for accessing properties, NOT for boolean conditions in `filter()`.

## Related Superstitions

- `2025-11-29-derive-inside-map-causes-thrashing.md` - Similar issue with computed() inside map
- `2025-11-29-no-computed-inside-map.md` - Don't create cells inside map callbacks
- Verification: `verifications/2025-11-21-cannot-map-computed-arrays-in-jsx.md` - Related JSX mapping issues

## Metadata

```yaml
topic: reactivity, derive, filter, jsx, computed
discovered: 2025-12-16
confirmed_count: 1
last_confirmed: 2025-12-16
confidence: high
sessions: [store-mapper-wall-display-fix]
related_files: [patterns/jkomoros/store-mapper.tsx]
related_commits: [aa3b198]
stars: 4
status: confirmed
```
