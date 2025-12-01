# Patterns - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Factory Function Idiom for Pattern Instantiation

⭐⭐ (2 confirmations)

**Use factory functions to avoid fragile pattern instantiation that breaks when Input types change.**

### The Problem

The framework uses `Required<T>` in the `PatternFunction` type signature, which means ALL Input fields must be provided when instantiating a pattern. This is problematic when one pattern (like a launcher/page-creator) instantiates others:

```typescript
// ❌ FRAGILE - Must list every field, breaks silently when Input changes
navigateTo(Person({
  displayName: "",
  givenName: "",
  familyName: "",
  // ... 10 more fields
}));
```

If `Person`'s Input type adds a new field, the calling pattern may not be updated, causing deployment failures or runtime errors.

### The Solution

Each pattern exports a `create<PatternName>` factory function with defaults:

```typescript
// In person.tsx

// 1. Define defaults with NO explicit type annotation
const defaults = {
  displayName: "",
  givenName: "",
  familyName: "",
  emails: [] as EmailEntry[],     // Arrays need type assertion
  viewMode: "main" as const,      // Unions need `as const`
  // ... all fields
};

// 2. Export factory function
export function createPerson(overrides?: Partial<typeof defaults>) {
  return Person({ ...defaults, ...overrides });
}
```

### Why This Works

**Goals achieved:**
1. ✅ Single source of truth for default values
2. ✅ Adding a field to Input without updating defaults = **immediate compile error**
3. ✅ Error occurs in the pattern file itself, not in callers
4. ✅ Clean API for callers: `navigateTo(createPerson())`

**Mechanism:** TypeScript checks the `Person({...defaults, ...overrides})` call at compile time, even if `createPerson` is never called. If `defaults` is missing a required field, the file fails to compile with a clear error:

```
TS2345: Property 'givenName' is missing in type '...'
  return Person({ ...defaults, ...overrides });
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Usage

```typescript
// In page-creator.tsx
import { createPerson } from "./person.tsx";

// All defaults
navigateTo(createPerson());

// With overrides
navigateTo(createPerson({ givenName: "Alice", familyName: "Smith" }));
```

### Important Notes

- **No explicit type on `defaults`** - let TypeScript infer it
- **Arrays of complex types** need `[] as SomeType[]`
- **Union/enum types** need `as const` for literal types
- Extra fields in defaults are silently ignored (harmless)

**Why not attach `.defaults` to the pattern?** The `RecipeFactory` type is closed and doesn't allow additional properties. TypeScript rejects `Person.defaults = {...}` with error TS2339.

**Related:** See pattern-development skill for full documentation.

**Guestbook:**
- ✅ 2025-11-30 - Designed and tested in person.tsx, verified compile error on missing field (page-creator refactor session)
- ✅ 2025-11-30 - Applied to page-creator patterns (page-creator refactor session)

---
