# Writable.of<Type>() With No Argument Produces Broken Cells at Runtime

**Date:** 2026-01-29 **Status:** confirmed **Confidence:** high **Stars:** 4

## TL;DR - The Rule

**`Writable.of<Type>()` with no argument creates a cell that doesn't work at
runtime**, even though `Default<>` annotations exist in the type's schema. You
must pass at least the required fields. The **architect-approved workaround** is
to mark `Default<>` fields as optional (`?`) in the interface, so the container
only needs to supply required fields.

```tsx
// BROKEN - No argument, runtime produces broken cell
const personData = Writable.of<Person>();
// Result: Pattern creates a charm that appears in list but has no data,
// count doesn't update, name is empty, avatar has no initial.

// WORKS BUT TIGHTLY COUPLED - Full explicit object
const personData = Writable.of<Person>({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  tags: [],
  // ... every field, including those with Default<> wrappers
});
// Result: Pattern works correctly, but container must know every field.

// RECOMMENDED (architect-approved) - Optional Default<> fields + partial init
// In the type definition, mark Default<> fields as optional:
//   interface Person {
//     firstName: string;          // required - no default
//     lastName: string;           // required - no default
//     email?: Default<string, "">; // optional - has default
//     phone?: Default<string, "">; // optional - has default
//     tags?: Default<string[], []>; // optional - has default
//   }
//
// Then pass only the required fields:
const personData = Writable.of<Person>({
  firstName: "",
  lastName: "",
});
// Result: Pattern works correctly. Runtime applies schema defaults for
// all missing optional fields. Container is decoupled from optional fields.
```

---

## Summary

When a container pattern (e.g., `contacts.tsx`) instantiates a sub-pattern
(e.g., `person.tsx`), it must pass a `Writable.of<Type>({...})` with at least
the required fields populated. You cannot rely on the runtime to fill in values
from a zero-argument call.

**The canonical approach** (confirmed by system architect) is:

1. Mark `Default<>` fields as optional with `?` in the interface
2. Pass only the required fields to `Writable.of<Type>({...})`
3. The runtime applies schema defaults for all missing optional fields
4. This eliminates the tight coupling between container and sub-type

## Why You'd Expect Writable.of<Type>() (No Args) to Work

The `Default<T, V>` type annotation causes the schema generator to emit JSON
Schema with `"default"` values for each property. The runtime traverser
(`traverse.ts`) does apply these defaults when reading data that lacks those
properties. So in theory, `Writable.of<Person>()` should create an empty cell,
and the schema defaults should fill in missing fields when the pattern reads
them.

## What Actually Happens With No Arguments

When `Writable.of<Person>()` is called with no argument:

- A cell is created with `undefined` as its value
- The sub-pattern is instantiated and produces a charm
- The charm appears in the container's list (e.g., a card shows up)
- But the charm has no usable data -- name is empty, count doesn't increment,
  detail view is broken
- The runtime does NOT fill in schema defaults for the initial cell value

## The Architect-Approved Workaround

The key insight is that `Default<T, V>` erases to `T` at the TypeScript level,
making all fields appear required. The fix is to mark those fields optional in
the interface:

```typescript
// BEFORE - All fields appear required due to Default<> erasure
interface Person {
  firstName: string;
  lastName: string;
  email: Default<string, "">; // TS sees: email: string (required)
  phone: Default<string, "">; // TS sees: phone: string (required)
  pronouns: Default<string, "">; // TS sees: pronouns: string (required)
  tags: Default<string[], []>; // TS sees: tags: string[] (required)
}

// AFTER - Optional annotation lets container pass partial objects
interface Person {
  firstName: string; // required
  lastName: string; // required
  email?: Default<string, "">; // TS sees: email?: string (optional)
  phone?: Default<string, "">; // TS sees: phone?: string (optional)
  pronouns?: Default<string, "">; // TS sees: pronouns?: string (optional)
  tags?: Default<string[], []>; // TS sees: tags?: string[] (optional)
}
```

Container code becomes decoupled:

```typescript
// Container only needs to know required fields
const personData = Writable.of<Person>({
  firstName: "",
  lastName: "",
});
// Runtime fills in email="", phone="", pronouns="", tags=[] from schema defaults
```

**TypeScript note:** Inside the consuming pattern, `.key("optionalField")`
returns `Cell<T | undefined>` at the TypeScript level. At runtime, the value is
always populated by the schema default. This can cause type narrowing annoyances
-- see the "nested optional fields" superstition for workarounds.

## Evidence

Tested with `contacts.tsx` deploying to runtime (2026-01-29):

| Approach                        | `addPerson` handler                                                    | Result                                        |
| ------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| All fields explicit             | `Writable.of<Person>({ firstName: "", lastName: "", email: "", ... })` | Works, but tightly coupled                    |
| No argument                     | `Writable.of<Person>()`                                                | Count stays (0), blank avatar, broken contact |
| Optional fields + required only | `Writable.of<Person>({ firstName: "", lastName: "" })`                 | Works, decoupled from optional fields         |

## Related

- `Default<T, V>` is defined as `export type Default<T, V extends T = T> = T` --
  a pure type alias that erases to `T`
- The schema generator extracts both type arguments from the AST to emit JSON
  Schema defaults
- The traverser applies defaults when reading, but `Writable.of()` with no args
  sets the initial value to `undefined` before any read traversal occurs
- With optional `?` fields, the JSON Schema still gets the `"default"`
  annotation, and the traverser fills them in on read

---

## Metadata

```yaml
topic: Writable.of, Default<>, pattern instantiation, cell initialization, optional fields
status: confirmed
confirmed_date: 2026-01-29
sessions:
  - 2026-01-29: Tested Writable.of<Person>() vs explicit defaults in deployed contacts pattern
  - 2026-01-29: Architect confirmed optional Default<> fields as canonical approach
```

## Guestbook

- **2026-01-29** — Discovered while expanding Person type with new fields
  (middleName, nickname, prefix, suffix, pronouns, birthday, photo). Attempted
  to decouple contacts.tsx from Person's field list by using
  `Writable.of<Person>()` with no args. TypeScript rejected it (all fields
  required due to `Default<T,V> = T` erasure). Forced past TS with explicit
  revert. Runtime test confirmed the no-args approach produces broken cells.
  Both the type system and runtime require explicit field values.
- **2026-01-29** — System architect confirmed the canonical pattern: mark
  `Default<>` fields optional with `?` in the interface, then pass only required
  fields. The runtime applies schema defaults for missing optional fields. This
  eliminates the coupling cost described in the original version of this
  superstition.
