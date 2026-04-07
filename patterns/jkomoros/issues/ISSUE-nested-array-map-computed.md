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

## Classification: CONFIRMED BUG

**After deep code analysis, this is a BUG where the compiler's expectations don't match runtime behavior.**

- Test fixtures in the framework show this SHOULD work
- The compiler transforms `.map()` to `.mapWithPattern()` expecting the method to exist
- At runtime, nested arrays from computed results don't have this method
- This is a type/runtime mismatch, not an intentional limitation

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

---

## Deep Technical Analysis

### Root Cause: Type Mismatch Between Compiler and Runtime

The CTS compiler transforms all `.map()` calls in JSX to `.mapWithPattern()`, but nested arrays from computed results are plain JavaScript arrays without this method.

#### 1. The CTS Compiler Transformation

**File:** `/Users/alex/Code/labs/packages/ts-transformers/src/closures/strategies/map-strategy.ts` (Lines 122-155)

The compiler's `isOpaqueRefArrayMapCall()` function determines whether to transform `.map()`:

```typescript
export function isOpaqueRefArrayMapCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "map") return false;

  const target = node.expression.expression;

  // Special case: derive() always returns OpaqueRef<T> at runtime
  if (isDeriveCall(target)) {
    return true;
  }

  const targetType = getTypeAtLocationWithFallback(target, checker, ...);
  if (!targetType) return false;

  // Type-based check: target is OpaqueRef<T[]> or Cell<T[]>
  return isOpaqueRefType(targetType, checker) &&
    hasArrayTypeArgument(targetType, checker);
}
```

**Key insight:** This checks if the **immediate target** is an OpaqueRef/Cell. But when you do `item.tags.map()`:
- `item` = OpaqueRef (from mapWithPattern) ✅
- `item.tags` = plain array (from property access) ❌

#### 2. Test Fixtures Show Expected Behavior

**File:** `/Users/alex/Code/labs/packages/ts-transformers/test/fixtures/closures/pattern-nested-jsx-map.input.tsx` (Lines 40-41)

```tsx
{item.tags.map((tag, i) => (
  <li>{tag.name}</li>
))}
```

**Expected output at line 629:**
```tsx
{item.tags.mapWithPattern(__ctHelpers.recipe(...), { ... })}
```

**This test fixture proves the framework EXPECTS `item.tags` to have `mapWithPattern()`**, but at runtime it doesn't.

#### 3. The OpaqueRef Proxy Implementation

**File:** `/Users/alex/Code/labs/packages/runner/src/cell.ts` (Lines 1126-1175)

The `getAsOpaqueRefProxy()` creates a Proxy for property access:

```typescript
getAsOpaqueRefProxy(): OpaqueRef<T> {
  const self = this as unknown as Cell<T>;
  const proxy = new Proxy(this, {
    get(target, prop) {
      // ... other cases ...
      } else if (typeof prop === "string" || typeof prop === "number") {
        const nestedCell = self.key(prop) as Cell<T>;
        return nestedCell.getAsOpaqueRefProxy();  // ← Returns wrapped cell
      }
    },
  });
  return proxy;
}
```

The proxy DOES wrap nested properties in OpaqueRef. But...

#### 4. The `.get()` Unwrapping Problem

**File:** `/Users/alex/Code/labs/packages/runner/src/cell.ts` (Lines 526-529)

When `.get()` is called (implicitly during computed evaluation):

```typescript
get(): Readonly<T> {
  if (!this.synced) this.sync();
  return validateAndTransform(this.runtime, this.tx, this.link, this.synced);
}
```

The `validateAndTransform()` returns **plain JavaScript data**, not OpaqueRef-wrapped data. Nested arrays become plain arrays without `mapWithPattern()`.

### The Data Flow Problem

```
computed(() => data.get().map(d => ({ name: d.name, tags: d.tags })))
    ↓
Compiler sees: computed returns array of objects with tags: string[]
    ↓
Creates: OpaqueRef<{ name: string, tags: string[] }[]>
    ↓
In JSX: items.map(item => item.tags.map(...))
    ↓
Compiler transforms:
  - items.mapWithPattern(...)  ✓ (correct)
  - item.tags.mapWithPattern(...)  ✓ (compiler expects this to work)
    ↓
At runtime:
  - items is OpaqueRef (has mapWithPattern) ✓
  - item is OpaqueRef (has mapWithPattern) ✓
  - item.tags is plain array [] ✗ (NO mapWithPattern!)
    ↓
Runtime Error: TypeError: item.tags.mapWithPattern is not a function
```

---

## Evidence This Is a Bug (Not Design Choice)

| Evidence | Implication |
|----------|-------------|
| Test fixture `pattern-nested-jsx-map` expects `mapWithPattern` on nested arrays | Framework intends this to work |
| Compiler transforms ALL `.map()` calls in JSX | No exception for nested properties |
| OpaqueRef proxy DOES wrap nested cells | Implementation attempts to support this |
| Only fails at runtime, not compile time | Type system doesn't catch the mismatch |

---

## Potential Fix Approaches

### Option 1: Schema-Aware Compiler (Most Correct)

Make the compiler aware of schema structure to know `item.tags` should be OpaqueRef<string[]>:

```typescript
// In map-strategy.ts when analyzing item.tags
const itemSchema = getSchemaForElement(...);
const tagsSchema = itemSchema.properties.tags;
if (tagsSchema.type === "array") {
  // Recognize this should have mapWithPattern
}
```

**Difficulty:** High - requires schema information at compile time

### Option 2: Deeper Runtime Wrapping

Modify `validateAndTransform()` to return OpaqueRef-wrapped arrays for array properties:

```typescript
if (Array.isArray(result) && parentIsOpaqueRef) {
  return wrapArrayAsOpaqueRef(result);
}
```

**Difficulty:** Medium - arrays aren't Cell objects

### Option 3: Don't Transform Nested `.map()` Calls

Make compiler skip transformation for nested property access:

```typescript
// If target is item.tags (property access on mapped item), don't transform
if (isNestedPropertyAccess(target)) {
  return false; // Use plain .map()
}
```

**Difficulty:** Low - but loses reactivity for nested arrays

### Option 4: Document as Known Limitation

Add explicit documentation that nested array mapping doesn't work.

**Difficulty:** Low - but doesn't fix the actual issue

---

## Performance Considerations

The current workarounds (computing JSX inside computed) are actually **more efficient**:

1. **Single-level map()** - No nested reactivity tracking
2. **Memoized computed** - JSX rendered once per change
3. **No proxy overhead** - Plain arrays are faster

If deeply nested mapping were supported, it would require:
- Tracking reactivity through multiple levels of proxies
- Creating recipes for each nested level
- Potential exponential complexity for deeply nested structures

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

```typescript
{filteredClasses.map((cls) => (
  <div>
    {cls.name}
    <span>{cls.categoryTagNames.join(", ")}</span>  // ✅ Works
  </div>
))}
```

### 3. Show Count Only

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
| 2025-12-02 | reward-spinner | Confirmed in verification doc |
| 2025-12-14 | extracurricular-selector | Confirmed, workaround applied |

---

## Questions for Framework Authors

1. **Confirm this is a bug:** The test fixtures suggest nested array mapping should work. Is this intended?

2. **Preferred fix approach:** Which of the potential fixes aligns best with the framework architecture?

3. **Timeline:** Is this something that could be fixed, or should we document it as a known limitation?

4. **Workaround validation:** Is computing JSX inside computed() the recommended pattern, or is there a better approach?

---

## Key Files Reference

| Component | File | Lines |
|-----------|------|-------|
| Map Transformation | `map-strategy.ts` | 122-155, 188-213 |
| OpaqueRef Proxy | `cell.ts` | 1126-1175 |
| mapWithPattern | `cell.ts` | 1209-1227 |
| Test Fixture | `pattern-nested-jsx-map.input.tsx` | 40-41 |
| Expected Output | `pattern-nested-jsx-map.expected.tsx` | ~629 |

---

## Metadata

```yaml
type: bug (compiler/runtime mismatch)
severity: medium
component: cts-compiler, reactivity, jsx-transformation
workaround: yes (pre-render in computed)
community_verifications: 3+
root_cause: nested arrays from .get() are plain JS arrays without mapWithPattern
test_fixtures_expect_this_to_work: yes
```
