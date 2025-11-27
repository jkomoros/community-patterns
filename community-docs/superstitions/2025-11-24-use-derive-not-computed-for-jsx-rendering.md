# DEPRECATED: Use derive() Not computed() for Reactive JSX Rendering

**STATUS: DISPROVEN - See folk_wisdom/reactivity.md**

This superstition has been disproven through code review and documentation research.

---

## What Was Claimed

The original superstition claimed that `computed()` returns `[object Object]` when used in JSX, while `derive()` works correctly.

## Why It's Wrong

Code review of `packages/runner/src/builder/module.ts` shows:

```typescript
derive(input, fn) → calls lift(fn)(input) → returns OpaqueRef<T>
computed(fn)      → calls lift(fn)(undefined) → returns OpaqueRef<T>
```

**Both return `OpaqueRef<T>`** - they are functionally identical!

The `[object Object]` issue observed was caused by something else (perhaps a different bug that happened to be fixed when refactoring to use `derive()`).

## Correct Understanding

1. **`computed()` and `derive()` are the same thing** - `derive` is just the older name
2. **JSX is automatically reactive** - you usually don't need either inside JSX
3. **Use `computed()` outside JSX** for data transformations
4. **The official docs prefer `computed()`** as the modern name

## See Instead

- **folk_wisdom/reactivity.md** - "computed() and derive() Are The Same Thing"
- **folk_wisdom/reactivity.md** - "JSX is Automatically Reactive"
- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`

---

## Original Guestbook (for history)

- ⭐ 2025-11-24 - Fixed weird JSX fragments in store-mapper pattern (fix-grocery-list-bugs)
- ❌ 2025-11-25 - Code review shows both return OpaqueRef<T>. Marked as LIKELY WRONG.
- ❌ 2025-11-26 - Formally deprecated after folk wisdom synthesis confirmed they're identical.

---

**Metadata:**
```yaml
status: deprecated
deprecated_date: 2025-11-26
reason: Disproven by code review - computed() and derive() are identical
see_instead: folk_wisdom/reactivity.md
```
