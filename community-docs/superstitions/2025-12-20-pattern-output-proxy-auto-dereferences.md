# Pattern Output Proxy Auto-Dereferences Cell Values

**Status:** Superstition (single observation)

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
topic: pattern output, proxy, cells, reactivity, get(), auto-dereference
discovered: 2025-12-20
confirmed_count: 1
last_confirmed: 2025-12-20
sessions: [labs-4/record-module-refactor]
related_labs_docs: none
status: superstition
stars:
```

## Problem

When accessing properties on pattern outputs (e.g., composed charm fields stored in an array), calling `.get()` returns `undefined` even though the value exists. This is because the pattern output proxy automatically dereferences Cell values.

```typescript
// WRONG - .get() returns undefined
const charm = entry.charm as any;
const labelValue = charm?.label?.get?.();  // returns undefined!

// CORRECT - direct access returns the value
const labelValue = charm?.label;  // returns "Personal" (the string value directly)
```

## What Works

**Access pattern output fields directly without `.get()`:**

```typescript
// Pattern output is stored in an array
const existingCharms: readonly SubCharmEntry[] = subCharms.get() || [];

for (const entry of existingCharms) {
  if (entry.type === "email") {
    const charm = entry.charm as any;

    // CORRECT - direct property access
    const labelValue = charm?.label;  // returns string like "Personal"

    // WRONG - using .get()
    const wrongValue = charm?.label?.get?.();  // returns undefined
  }
}
```

## Why This Happens

Pattern outputs use a different proxy than raw Cells. When you create a composed pattern and store it:

```typescript
const emailCharm = EmailModule({ label, address });
subCharms.push({ type: "email", charm: emailCharm });
```

The `emailCharm` has properties like `label` and `address`. When accessed through the pattern output proxy (e.g., `entry.charm.label`), the proxy automatically dereferences the underlying Cell value and returns the raw value directly.

This is different from:
1. **Raw Cells** - require `.get()` to access value
2. **OpaqueRef properties** - may or may not need `.get()` depending on context

## Symptoms to Watch For

- `.get()` returns `undefined` on properties you know have values
- Console logging shows the property exists: `charm.label: "Personal"`
- Console logging shows `.get()` fails: `charm.label.get(): undefined`
- Code works when you remove the `.get()` call

## Debug Pattern

Add console logging to determine whether you need `.get()`:

```typescript
const charm = entry.charm as any;
console.log("charm.label:", charm?.label);           // Check raw access
console.log("charm.label.get():", charm?.label?.get?.());  // Check Cell access
```

If the first shows the value and the second shows `undefined`, you're dealing with an auto-dereferencing proxy.

## Context

- Discovered while implementing smart default labels in Record pattern
- EmailModule outputs include a `label` field that is a Cell internally
- When iterating over `subCharms` array to find used labels, calling `.label.get()` returned undefined
- Changing to direct `.label` access returned the string value correctly

## Related

- `2025-12-17-derive-vs-computed-for-opaqueref-properties.md` - related proxy behavior differences
- `2025-12-15-argument-cells-in-computed-no-get.md` - similar pattern with computed contexts
- `2025-11-22-at-reference-opaque-ref-arrays.md` - OpaqueRef array access patterns

## Guestbook

- 2025-12-20 - Discovered while implementing smart default labels in Record pattern. Needed to iterate over composed EmailModule charms to find used labels. Initially tried `charm?.label?.get?.()` which returned undefined. Console logging revealed `charm.label` returned "Personal" directly while `charm.label.get()` returned undefined. Changed to direct property access and it worked. The pattern output proxy auto-dereferences Cell values. (labs-4/record-module-refactor)
