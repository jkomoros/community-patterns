---
topic: handlers, reactivity, types
discovered: 2025-12-21
sessions: members-module-development
related_labs_docs:
  - ~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md
  - ~/Code/labs/packages/runner/src/builtins/handler.ts
status: superstition
confidence: high
---

# Handler State Unwraps OpaqueRefs to Plain Values (Snapshots)

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this is verified correct,** upstream it to labs docs and delete this superstition.

---

## Problem

When you pass data through handler state (the second generic parameter), reactive references (`OpaqueRef<T>`) get **unwrapped to plain values**. The handler receives a **snapshot** of the data at binding time, not a reactive reference.

```typescript
// Pattern body - wish() returns OpaqueRef<MentionableCharm[]>
const mentionable = wish<Default<MentionableCharm[], []>>("#mentionable");

// Create handler with mentionable in state
const doSomething = handler<EventType, { mentionable: MentionableCharm[] }>(
  (event, { mentionable }) => {
    // mentionable is UNWRAPPED here - it's MentionableCharm[], not OpaqueRef!
    // This is a SNAPSHOT from when the handler was bound
    console.log(mentionable.length); // Could be 0 even if data exists now
  }
);

// Bind the handler - snapshot taken HERE
<button onClick={doSomething({ mentionable })} />
```

**Observed behavior:** The handler always sees the value that `mentionable` had when the handler was **bound** (when the JSX rendered), not the current reactive value.

## Why This Matters

If you instantiate a sub-pattern inside a handler, passing data from handler state, that sub-pattern receives a **frozen snapshot**, not a reactive reference:

```typescript
// BAD: MembersModule gets empty array snapshot
const addSubCharm = handler<Event, { mentionable: MentionableCharm[] }>(
  (_, { mentionable }) => {
    // mentionable is [] here (snapshot from initial render)
    // even though actual data has 10+ items now
    return MembersModule({ mentionable }); // Gets empty snapshot!
  }
);
```

## Solution That Works

**Don't pass reactive data through handler state.** Instead, have sub-patterns call `wish()` directly in their pattern body:

```typescript
// GOOD: MembersModule calls wish() in its own pattern body
const MembersModule = recipe("MembersModule", () => {
  // Gets REACTIVE reference, not snapshot
  const mentionable = wish<MentionableCharm[]>("#mentionable");

  // mentionable updates reactively as data changes
  return {
    [UI]: <div>{mentionable.map(...)}</div>
  };
});

// Handler just instantiates, doesn't pass data
const addSubCharm = handler((_, { }) => {
  return MembersModule({}); // Let it get its own data
});
```

## Why This Works

- Pattern bodies run in reactive context with access to `wish()` and other builtins
- `wish()` returns an `OpaqueRef<T>` that stays reactive
- Sub-patterns share the same MemorySpace as their parent (see related superstition)
- No snapshot is taken - the pattern always sees current data

## Evidence Files

- `packages/patterns/record.tsx:395` - `wish("#mentionable")` returns OpaqueRef
- `packages/patterns/record.tsx:253` - Handler signature shows unwrapped type
- `packages/patterns/members.tsx:46` - MembersModule expects OpaqueRef input
- `packages/runner/src/builtins/handler.ts` - Handler implementation

## Related Superstitions

- `2025-12-21-sub-patterns-share-parent-memory-space.md` - Why wish() works in sub-patterns

## Guestbook

- 2025-12-21 - Discovered when MembersModule showed "No matching options" despite mentionable having 14 items. Handler was passing empty snapshot from initial render. (members-module-development)
