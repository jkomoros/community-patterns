# Issue: Nested Array Properties Cannot Be Mapped in Computed Results

**Severity:** Medium - Requires data restructuring or UI changes

**Discovered:** 2025-12-14
**Pattern:** extracurricular-selector
**Related Community Docs:**
- `superstitions/verifications/2025-11-21-cannot-map-computed-arrays-in-jsx.md` (2 confirmations)
- `superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md`

---

## Summary

When mapping over items from a `computed()` result, nested array properties (like `item.tags`) cannot be mapped. Attempting to call `.map()` on a nested array throws:

```
TypeError: item.tags.mapWithPattern is not a function
```

This prevents common UI patterns like rendering lists of tags, categories, or other nested collections.

---

## Expected Behavior

Should be able to map over nested array properties:

```typescript
const items = computed(() => data.get().map(d => ({
  name: d.name,
  tags: d.tags  // string[]
})));

{items.map((item) => (
  <div>
    {item.name}
    {item.tags.map((tag) => <span>{tag}</span>)}  // Should work
  </div>
))}
```

---

## Actual Behavior

```
TypeError: item.tags.mapWithPattern is not a function
```

The nested array `item.tags` is wrapped in an OpaqueRef that doesn't have the `.mapWithPattern()` method that the JSX transformation expects.

---

## Root Cause Analysis

From community doc verification (2025-11-21):

> "When you access a nested array inside .map() on a computed, the array is
> wrapped in an OpaqueRef. OpaqueRef doesn't implement mapWithPattern(),
> which is what the CTS compiler transforms .map() calls into for reactive
> rendering."

The reactivity system wraps computed results in OpaqueRef for tracking, but nested arrays within those results don't get the special Array methods that JSX transformation requires.

---

## Real-World Impact

In extracurricular-selector, each class has multiple category tags:

```typescript
interface Class {
  name: string;
  categoryTagNames: string[];  // e.g., ["Robotics", "STEM", "Engineering"]
}

const filteredClasses = computed(() =>
  classes.get().filter(c => c.eligible)
);

// Wanted to render tags as chips:
{filteredClasses.map((cls) => (
  <div>
    {cls.name}
    <div class="tags">
      {cls.categoryTagNames.map((tag) => (  // ❌ Fails
        <span class="chip">{tag}</span>
      ))}
    </div>
  </div>
))}
```

---

## Workarounds

### 1. Compute JSX Inside computed() (Recommended)

Pre-render the nested content inside the computed:

```typescript
const classesWithTagsUI = computed(() =>
  classes.get().filter(c => c.eligible).map(c => ({
    ...c,
    tagsUI: c.categoryTagNames.map(tag => <span class="chip">{tag}</span>)
  }))
);

{classesWithTagsUI.map((cls) => (
  <div>
    {cls.name}
    <div class="tags">{cls.tagsUI}</div>  // ✅ Works
  </div>
))}
```

### 2. Flatten to String (Simple Cases)

For display-only, join the array:

```typescript
{filteredClasses.map((cls) => (
  <div>
    {cls.name}
    <span>{cls.categoryTagNames.join(", ")}</span>  // ✅ Works
  </div>
))}
```

### 3. Show Count Only

Avoid rendering the nested array entirely:

```typescript
{filteredClasses.map((cls) => (
  <div>
    {cls.name}
    <span>{cls.categoryTagNames.length} tags</span>  // ✅ Works
  </div>
))}
```

---

## Verification Status

This issue has been confirmed by multiple developers:

| Date | Pattern | Verification |
|------|---------|--------------|
| 2025-06-12 | Unknown | Initial superstition |
| 2025-11-21 | photo-gallery | Verified by jkomoros |
| 2025-12-14 | extracurricular-selector | Confirmed, workaround applied |

The community doc `2025-11-21-cannot-map-computed-arrays-in-jsx.md` has **2 guestbook entries** confirming the issue.

---

## Questions for Framework Authors

1. **Is this fixable?** Could OpaqueRef implement `.mapWithPattern()` for nested arrays?

2. **Is this intentional?** Is there a design reason nested arrays aren't traversable?

3. **Performance implications?** Would supporting nested array mapping cause reactivity overhead?

4. **Documentation?** If this can't be fixed, should it be explicitly documented as a limitation?

---

## Suggested Resolution

If fixing is complex, at minimum add to documentation:

```markdown
### Limitations: Nested Arrays in Computed Results

When mapping over computed() results, you cannot call .map() on nested
array properties. This is a limitation of the OpaqueRef wrapper.

**Instead of:**
```typescript
{computedItems.map(item => item.tags.map(tag => ...))}  // ❌
```

**Do:**
```typescript
const itemsWithTagsUI = computed(() =>
  items.map(item => ({
    ...item,
    tagsUI: item.tags.map(tag => <span>{tag}</span>)
  }))
);
{itemsWithTagsUI.map(item => item.tagsUI)}  // ✅
```
```

---

## Metadata

```yaml
type: bug
severity: medium
component: reactivity, jsx-transformation
workaround: yes (pre-render in computed)
community_verifications: 2
documentation_needed: yes
```
