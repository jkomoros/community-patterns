# Accessing Nested Charm Properties in .map() Requires computed()

**Date:** 2026-01-28 **Status:** confirmed **Confidence:** high **Stars:** 4

## TL;DR - The Rule

**When accessing nested properties on charm objects inside `.map()` callbacks,
wrap ALL property access in `computed()`.** Direct nested property access (like
`charm.person.firstName`) triggers `Symbol.toPrimitive` outside a reactive
context, causing an error.

```tsx
// BROKEN - Direct nested property access throws error
{
  siblingCharms.map((charm) => {
    const name = charm.person.firstName; // ERROR!
    return <span>{name}</span>;
  });
}

// CORRECT - Wrap property access in computed()
{
  siblingCharms.map((charm) => {
    const name = computed(() => {
      const p = charm.person;
      if (!p) return "Unknown";
      return p.firstName || "Person";
    });
    return <span>{name}</span>;
  });
}
```

**Error message:**
`Tried to access a reactive reference outside a reactive context`

---

## Summary

When you iterate over an array of **charm objects** (pattern outputs that
contain nested reactive data), each item is an OpaqueRef proxy. Accessing nested
properties like `charm.person.firstName` triggers JavaScript's
`Symbol.toPrimitive` coercion, which the reactive system intercepts and throws
an error because you're outside a reactive context.

This is **distinct from** the related superstition about passing items to
handlers (which uses index). Here, we need to **read** nested data from charm
objects, not just pass references.

**The fix:** Wrap all nested property access inside `computed()` blocks. This
ensures the access happens within a reactive context where the proxy can
properly resolve values.

## Why This Happens

1. **Charm objects are OpaqueRef proxies** - Pattern outputs wrap data in
   proxies for reactivity
2. **Nested access triggers Symbol.toPrimitive** - Accessing
   `charm.person.firstName` causes proxy traps to fire
3. **Proxy traps check reactive context** - The runtime verifies you're inside
   computed/lift/JSX
4. **Error thrown if outside context** - The callback body of `.map()` is NOT a
   reactive context
5. **computed() establishes context** - Wrapping access in `computed()` provides
   the required context

## When This Occurs

This specifically happens when:

1. **You have an array of charm results** - e.g., `contacts: ContactCharm[]`
   where each charm came from instantiating a pattern
2. **You iterate with `.map()`** - The callback body is not a reactive context
3. **You access nested properties** - `charm.person.firstName` or similar deep
   access

Example scenario: A Contacts container stores Person charm results and wants to
display names in a list.

## The Problematic Pattern

```tsx
// Container stores charm results (pattern outputs with [UI], [NAME], etc.)
interface ContactCharm {
  [NAME]: string;
  [UI]: VNode;
  person?: Person; // Nested reactive data
}

// BROKEN: Direct access in .map() callback
{
  contacts.map((charm) => {
    // These accesses trigger Symbol.toPrimitive outside reactive context
    const firstName = charm.person?.firstName; // ERROR!
    const lastName = charm.person?.lastName; // ERROR!

    return (
      <button onClick={selectContact({ charm })}>
        {firstName} {lastName}
      </button>
    );
  });
}
```

## Correct Pattern

```tsx
// CORRECT: Wrap ALL nested access in computed()
{
  contacts.map((charm) => {
    const displayName = computed(() => {
      const p = charm.person;
      if (!p) return "Unknown";
      const first = p.firstName || "";
      const last = p.lastName || "";
      if (first && last) return `${first} ${last}`;
      return first || last || "Person";
    });

    return (
      <button onClick={selectContact({ charm })}>
        {displayName}
      </button>
    );
  });
}
```

## Alternative: Pre-compute Outside .map()

If you need the same data for filtering or other logic, compute it once outside:

```tsx
// Compute linkable siblings with all property access inside computed()
const linkableSiblings = computed(() => {
  const result: Array<{ name: string; person: Person }> = [];

  for (const charm of siblingCharms.get()) {
    const p = charm.person;
    if (!p) continue;

    const first = p.firstName || "";
    const last = p.lastName || "";
    const name = first && last ? `${first} ${last}` : first || last || "Person";

    result.push({ name, person: p });
  }

  return result;
});

// Now iterate over plain data - no reactive proxy issues
{
  linkableSiblings.map((sib) => (
    <button onClick={linkTo({ person: sib.person })}>
      {sib.name}
    </button>
  ));
}
```

## Real-World Example

**Pattern:** Contacts with sameAs linking **Bug:** Trying to display sibling
contact names in a picker threw reactive context errors

### Before (Broken)

```tsx
// Person pattern receives siblingCharms from container
{
  siblingCharms?.map((sibling) => {
    // Direct access to nested charm properties
    const p = sibling.person; // OpaqueRef proxy
    const name = p?.firstName; // ERROR: Symbol.toPrimitive outside context

    return (
      <cf-button onClick={setSameAs({ linkedPerson: p })}>
        {name}
      </cf-button>
    );
  });
}
```

**Result:**
`Error: Tried to access a reactive reference outside a reactive context`

### After (Fixed)

```tsx
// Pre-compute all sibling data inside a single computed()
const linkableSiblings = computed(() => {
  if (!siblingSource) return [];

  const allSiblings = siblingSource.get();
  const result: Array<{ name: string; linkedPerson: PersonLike }> = [];

  for (const item of allSiblings) {
    const sib = item as PersonSiblingCharm;
    const sibPerson = sib.person;
    if (!sibPerson) continue;

    const first = sibPerson.firstName || "";
    const last = sibPerson.lastName || "";
    const name = first && last ? `${first} ${last}` : first || last || "Person";

    result.push({ name, linkedPerson: sibPerson });
  }

  return result;
});

// Iterate over plain data array
{
  linkableSiblings.map((sib) => (
    <cf-button onClick={setSameAs({ linkedPerson: sib.linkedPerson })}>
      {sib.name}
    </cf-button>
  ));
}
```

**Result:** Works correctly - all property access happens inside computed().

## Differentiating from Related Issues

| Issue                     | Symptom                                                                     | Solution                    |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| **This issue**            | Error: reactive ref outside context when accessing `charm.person.firstName` | Wrap access in `computed()` |
| Passing item to handler   | Same error when passing `.map()` item to handler                            | Pass index instead          |
| Custom element attributes | Attribute is undefined/null                                                 | Use `derive()`              |
| Using .get() on computed  | Unnecessary .get() warning                                                  | Remove .get()               |

## Key Rules

1. **Charm objects are proxies** - They look like plain objects but are reactive
   wrappers
2. **Nested access triggers proxy traps** - `charm.person.firstName` involves
   multiple proxy operations
3. **computed() creates reactive context** - All property access must happen
   inside computed()
4. **Pre-compute when possible** - Transform charm array to plain data array for
   simpler iteration

## Debugging Tips

If you see this error when iterating over charm arrays:

```
Error: Tried to access a reactive reference outside a reactive context
```

1. Check if you're accessing nested properties on charm objects in `.map()`
   callback
2. Wrap all property access in `computed()` or pre-compute a plain data array
3. Remember: the `.map()` callback body is NOT a reactive context, only
   computed/lift/JSX are

## Related Superstitions

- `2026-01-15-reactive-refs-from-map-to-handlers.md` - Related error, different
  cause (passing items to handlers)
- `2026-01-19-derive-for-custom-element-attributes-in-map.md` - Related pattern
  (use derive for attributes)
- `2025-12-14-inline-computed-in-map-is-fine.md` - Confirms computed inside map
  works

## Metadata

```yaml
topic: reactivity, computed, map, charm, OpaqueRef, proxy, Symbol.toPrimitive
discovered: 2026-01-28
confirmed_count: 1
last_confirmed: 2026-01-28
sessions: [contacts-sameAs-linking]
related_functions: computed, map, pattern
pattern: packages/patterns/base/person.tsx, packages/patterns/base/contacts.tsx
status: confirmed
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 - Contacts pattern sameAs feature. When implementing a picker to
  link Person/FamilyMember contacts to each other, accessing
  `siblingCharm.person.firstName` inside `.map()` threw reactive context errors.
  The fix was to compute all sibling data inside a `computed()` block,
  transforming the charm array to a plain data array before iteration. The key
  insight: items in `.map()` callbacks are OpaqueRef proxies, and nested
  property access triggers `Symbol.toPrimitive` which requires a reactive
  context. (contacts-sameAs-linking)

---

**Remember:** Charm objects are reactive proxies. When iterating over them with
`.map()`, wrap ALL nested property access in `computed()` to ensure you're in a
reactive context.
