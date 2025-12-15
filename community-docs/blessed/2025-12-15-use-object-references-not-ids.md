# Use Object References, Not IDs or Name Strings

**Status:** Blessed (framework author confirmed 2025-12-15)
**Source:** PR #170 review by seefeldb

## The Rule

When referencing entities across collections, use direct object references instead of ID strings or name strings.

## Correct Pattern

```typescript
// ✅ Correct - direct object reference
interface Class {
  location: Location;  // The actual Location object
}

interface Friend {
  classInterests: Array<{
    class: Class;  // The actual Class object
    certainty: "confirmed" | "likely" | "maybe";
  }>;
}

interface TravelTime {
  fromLocation: Location;  // Direct reference
  toLocation: Location;    // Direct reference
  minutes: number;
}
```

## Wrong Patterns

```typescript
// ❌ Wrong - ID-based reference (React-y anti-pattern)
interface Class {
  locationId: string;
  locationName: string;  // Denormalized for display
}

// ❌ Wrong - name string matching
interface Friend {
  classInterests: Array<{
    className: string;  // Would require lookup
    certainty: "confirmed" | "likely" | "maybe";
  }>;
}
```

## Why This Matters

1. **No lookups needed** - The reference IS the object
2. **No denormalization** - Don't need both `locationId` AND `locationName`
3. **Use `.equals()` for comparison** - Framework handles identity
4. **Cleaner code** - Direct property access instead of find/filter

## How to Compare References

Use `.equals()` method for object identity comparison:

```typescript
// Find class in array
const idx = classes.findIndex(c => Cell.equals(c, targetClass));

// Check if same location
if (Cell.equals(class1.location, class2.location)) {
  // Same location
}
```

## Framework Author Quote (2025-12-15)

On using `className: string`:
> "this should be a reference as well, just make it `class: Class`"

On using name matching:
> "using name equality when it should just use .equals"

## Related Docs

- `blessed/2025-12-15-box-selected-state.md` - Boxing pattern for selections
- `folk_wisdom/2025-12-08-use-cell-equals-for-identity.md` - Cell.equals() usage

## Metadata

```yaml
topic: references, ids, cell, equals, object
status: blessed
source: framework-author
date: 2025-12-15
pr: 170
```
