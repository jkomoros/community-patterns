# Patterns - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Optional Defaults Idiom (Recommended)

⭐⭐⭐ (3 confirmations - framework author approved)

**Use `field?: Default<T, V>` to make fields optional for callers while ensuring they're available inside the pattern.**

### The Pattern

```typescript
interface Input {
  title?: Default<string, "Untitled">;  // Optional for callers
  count?: Default<number, 0>;
  tags?: Default<string[], []>;
}

const MyPattern = pattern<Input>(({ title, count, tags }) => {
  // Inside pattern: NO optional chaining needed!
  // title is `string`, not `string | undefined`
  // count is `number`, not `number | undefined`
  return {
    [NAME]: str`${title}`,
    // ...
  };
});
```

### How It Works

1. **`?` makes the field optional** - callers can omit it
2. **`Default<T, V>` specifies the default value** - framework applies it at runtime
3. **`Required<>` in PatternFunction** - ensures fields are present inside the pattern body

### Why Required<> Doesn't Force Callers to Provide All Fields

A common misconception: "`Required<T>` in PatternFunction means callers must provide all fields."

**This is wrong.** Here's why:

```typescript
// PatternFunction type signature (simplified)
type PatternFunction = <T, R>(
  fn: (input: OpaqueRef<Required<T>>) => R  // Required<> is HERE - inside the pattern
): RecipeFactory<StripCell<T>, R>;          // NOT here - what callers see
```

- **`Required<T>`** wraps what the **pattern author** receives (inside the function body)
- **`StripCell<T>`** is what **callers** pass - preserves optional (`?`) fields!

So if you declare `title?: Default<string, "">`:
- **Callers** see `title?: string` (optional)
- **Pattern body** sees `title: string` (required, because `Required<>` removes `?`)

### Usage

```typescript
// In another file (e.g., page-creator.tsx)
import MyPattern from "./my-pattern.tsx";

// All of these work:
navigateTo(MyPattern({}));                           // All defaults
navigateTo(MyPattern({ title: "Custom" }));          // Partial override
navigateTo(MyPattern({ title: "Hi", count: 5 }));    // Multiple overrides
```

### Why This Is Better Than Factory Functions

**No boilerplate needed:**
- ❌ ~~`const defaults = {...}`~~
- ❌ ~~`export function createMyPattern(overrides?) {...}`~~

**Benefits:**
- ✅ Single line per field: `field?: Default<T, V>`
- ✅ Type-safe: TypeScript knows the default value type
- ✅ Loose coupling: callers don't need to update when fields are added
- ✅ Framework-native: uses built-in Default<> mechanism

### Important Notes

- **Always use `?`** on fields with Default<> to make them optional for callers
- **Arrays** need the full type: `items?: Default<Item[], []>`
- **Unions** work naturally: `mode?: Default<"a" | "b", "a">`

**Tested:** `patterns/jkomoros/WIP/test-optional-defaults.tsx` and `test-optional-launcher.tsx`

**Guestbook:**
- ✅ 2025-12-01 - Confirmed by framework author: "field?: Default<...>" is the intended pattern
- ✅ 2025-12-01 - Tested with Playwright: calling Pattern({}) from another file works correctly
- ✅ 2025-12-01 - Verified defaults apply: title="Untitled", count=0, tags=[] all populated
- ✅ 2025-12-01 - Verified Required<> works: `title.toUpperCase()`, `count * 2`, `tags.length` all type-check without optional chaining

---
