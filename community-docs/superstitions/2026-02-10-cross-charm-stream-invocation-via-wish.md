# Cross-Charm Stream Invocation via wish()

**Date:** 2026-02-10 **Status:** verified **Confidence:** high **Stars:** 4

## TL;DR - The Rule

**When you get a stream from another charm via `wish()`, the stream arrives as a
Cell with `{ $stream: true }`. To invoke it, call `.send(data)` directly on the
Cell. The `Stream<T>` type already includes `.send()` via the `IStreamable<T>`
interface - no casting needed.**

```typescript
// Get stream from another charm
const aggregatorStream = derive(aggregator, (agg) => agg?.postEvent ?? null);

// In a handler - call .send() directly (no casting required!)
aggregatorStream.send({ scope, tag, action: "add", timestamp: Date.now() });
```

---

## Summary

When using `wish()` to discover and interact with another charm that exposes a
stream (e.g., for telemetry or event posting), the stream does not arrive as a
callable function. Instead, it arrives as a Cell containing the marker
`{ $stream: true }`. To invoke the stream, you call `.send()` directly on the
Cell reference.

The `Stream<T>` type already includes the `.send()` method via the
`IStreamable<T>` interface, so no `as any` casting or defensive checks are
needed.

This is different from local handlers where you bind them directly to event
handlers in JSX.

## Why This Happens

The `wish()` mechanism returns reactive references to data exposed by other
charms. Streams are special - they're not plain data but rather entry points for
cross-charm communication. The runtime wraps them in Cells with a
`$stream: true` marker to distinguish them from regular data.

When you call `.send(data)` on the Cell:

1. The runtime recognizes the `$stream` marker
2. Routes the data to the target charm's stream handler
3. The target charm processes the event in its `onCommit` or similar

## Symptoms When Done Wrong

If you try to call the stream as a function:

```typescript
// WRONG - stream is not a function
aggregatorStream({ data }); // TypeError or silent failure
```

If you try to access a non-existent `.invoke()` method:

```typescript
// WRONG - no invoke method
aggregatorStream.invoke({ data }); // TypeError
```

## The Correct Pattern

### Step 1: Derive the stream from the wished charm

```typescript
// Get the aggregator charm that has a postEvent stream
const aggregator = wish<CommunityWisdomAggregatorResult>(
  "#community-wisdom-aggregator",
);

// Derive the stream reference
const aggregatorStream = derive(aggregator, (agg) => agg?.postEvent ?? null);
```

### Step 2: Call .send() on the stream in a handler

```typescript
const onTagAdded = handler<void, {
  scope: string;
  tag: string;
  aggregatorStream: Stream<TagEvent>;
}>((_, { scope, tag, aggregatorStream }) => {
  // Stream<T> includes .send() via IStreamable<T> - no casting needed!
  aggregatorStream.send({
    scope,
    tag,
    action: "add",
    timestamp: Date.now(),
  });
});
```

## Real-World Example

**Pattern:** Folksonomy Tags (posting tag events to community wisdom aggregator)

### Before (Overcomplicated - unnecessary casting)

```typescript
// We thought we needed `as any` and defensive checks
const onTagAdded = handler<void, { ... }>((_, { aggregatorStream }) => {
  const streamCell = aggregatorStream as any;
  if (streamCell?.send) {
    streamCell.send({ tag, action: "add" });
  }
});
```

### After (Clean - Stream<T> has .send() built in)

```typescript
const onTagAdded = handler<void, {
  scope: string;
  tag: string;
  aggregatorStream: Stream<TagEvent>;
  previousTags: Writable<string[]>;
}>((_, { scope, tag, aggregatorStream, previousTags }) => {
  // Just call .send() directly - no casting needed!
  aggregatorStream.send({
    scope,
    tag,
    action: "add",
    timestamp: Date.now(),
  });
});
```

## Key Differences from Local Handlers

| Aspect     | Local Handler                          | Cross-Charm Stream                     |
| ---------- | -------------------------------------- | -------------------------------------- |
| Definition | `handler<Event, State>((e, s) => ...)` | Exposed in charm output                |
| Binding    | `onClick={handler({ state })}`         | Cannot bind in JSX                     |
| Invocation | Auto-invoked on event                  | Manual `.send(data)`                   |
| Type       | Stream                                 | Cell with `{ $stream: true }`          |
| Casting    | Not needed                             | Not needed (`Stream<T>` has `.send()`) |

## Debunked Misconception

**WRONG:** We initially thought cross-charm streams required `as any` casting
and defensive checks:

```typescript
// UNNECESSARY - we thought this was required
const streamCell = aggregatorStream as any;
if (streamCell?.send) {
  streamCell.send(data);
}
```

**CORRECT:** `Stream<T>` already includes `.send()` via the `IStreamable<T>`
interface:

```typescript
// Clean and type-safe
aggregatorStream.send(data);
```

## Related Superstitions

- `2026-02-10-custom-event-detail-undefined-in-cf-render.md` - Related to
  cross-charm communication issues
- `2026-01-19-handlers-writable-wrapper-on-default-types.md` - Handler binding
  patterns (local only)

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/capabilities/charm-linking.md` (if
  exists)
- **Related patterns:** Community wisdom aggregator patterns

## Metadata

```yaml
topic: cross-charm, streams, wish, handlers
discovered: 2026-02-10
verified: 2026-02-10
confirmed_count: 2
last_confirmed: 2026-02-10
sessions: [community-wisdom-tag-list]
related_functions: wish, derive, handler, send, IStreamable
pattern: packages/patterns/experimental/folksonomy-tags.tsx
status: verified
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-02-10 - Discovered while implementing folksonomy-tags pattern that posts
  tag events to a community wisdom aggregator charm. The stream from the
  aggregator arrived via `wish()` and needed `.send()` called directly on the
  Cell reference. This is different from local handlers where binding happens in
  JSX. (community-wisdom-tag-list)
- 2026-02-10 - UPDATED: Discovered that `Stream<T>` already includes `.send()`
  via the `IStreamable<T>` interface. The `as any` casting and defensive checks
  we added were unnecessary. The clean approach is to just call
  `aggregatorStream.send(data)` directly. (community-wisdom-tag-list)

---

**Remember:** Cross-charm streams via `wish()` arrive as Cells with
`{ $stream: true }`. Call `.send(data)` directly on the stream - no casting
needed because `Stream<T>` includes `.send()` via `IStreamable<T>`.
