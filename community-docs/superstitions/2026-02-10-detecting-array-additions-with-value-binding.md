# Detecting Array Additions with $value Binding

**Date:** 2026-02-10
**Status:** superstition
**Confidence:** medium
**Stars:** 3

## TL;DR - The Rule

**When using `$value` binding with `multiple` mode on cf-autocomplete (or similar), the array updates directly without selection events. To detect additions for side effects like telemetry, use `oncf-change` with a `previousValues` tracking pattern.**

```typescript
// Track previous state to detect additions
const previousTags = Writable.of<string[]>([]).for("previousTags");

const onTagsChanged = handler<
  { value: string | string[]; oldValue: string | string[] },
  { tags: Writable<string[]>; previousTags: Writable<string[]>; onAdd: (tag: string) => void }
>((event, { tags, previousTags, onAdd }) => {
  const current = tags.get() || [];
  const previous = previousTags.get() || [];

  // Find newly added items
  const added = current.filter((t) => !previous.includes(t));

  // Trigger side effects for additions
  for (const tag of added) {
    onAdd(tag);
  }

  // Update previous state
  previousTags.set([...current]);
});
```

---

## Summary

The `$value` binding on cf-autocomplete with `multiple` mode provides bidirectional data binding - the array updates automatically as users add/remove items. However, there's no built-in way to detect when a specific item was *added* vs just the array changing.

This is needed for:
- Posting telemetry events when tags are added
- Triggering side effects only on additions
- Distinguishing adds from removes

## Why This Pattern Works

The `oncf-change` event fires whenever the value changes, but it only provides the current and previous values - not a diff. By maintaining a separate `previousTags` Writable, we can compute the diff ourselves:

1. **On each change:** Compare `current` to `previousTags`
2. **Compute additions:** Filter items in current that aren't in previous
3. **Update tracking:** Set `previousTags` to current for next comparison

## The Event Shape

The `oncf-change` event from cf-autocomplete has this detail structure:

```typescript
interface CtChangeEvent {
  value: string | string[];    // Current value
  oldValue: string | string[]; // Previous value (may not be reliable across renders)
}
```

**Note:** `oldValue` from the event may not be reliable across render cycles. Using a persistent `previousTags` Writable is more reliable.

## Complete Pattern

### Step 1: Set up the tracking Writable

```typescript
const previousTags = Writable.of<string[]>([]).for("previousTags");
```

### Step 2: Create the change handler

```typescript
const onTagsChanged = handler<
  { value: string | string[]; oldValue: string | string[] },
  {
    tags: Writable<string[]>;
    previousTags: Writable<string[]>;
    scope: string;
    aggregatorStream: Cell<any>;
  }
>((_, { tags, previousTags, scope, aggregatorStream }) => {
  const current = tags.get() || [];
  const previous = previousTags.get() || [];

  // Find additions
  const added = current.filter((t) => !previous.includes(t));

  // Post telemetry for each addition
  for (const tag of added) {
    const streamCell = aggregatorStream as any;
    if (streamCell?.send) {
      streamCell.send({ scope, tag, action: "add", timestamp: Date.now() });
    }
  }

  // Update tracking state
  previousTags.set([...current]);
});
```

### Step 3: Bind to cf-autocomplete

```typescript
<cf-autocomplete
  items={autocompleteItems}
  placeholder="Add a tag..."
  allowCustom
  multiple
  $value={tags}
  oncf-change={onTagsChanged({ tags, previousTags, scope, aggregatorStream })}
/>
```

## Detecting Removals Too

The same pattern works for detecting removals:

```typescript
const removed = previous.filter((t) => !current.includes(t));

for (const tag of removed) {
  // Handle removal
  streamCell.send({ scope, tag, action: "remove", timestamp: Date.now() });
}
```

## Why Not Use oncf-select?

You might think `oncf-select` would work for detecting additions, but:

1. **Across cf-render boundaries:** `event.detail` is undefined (see related superstition)
2. **With $value binding:** The component may not fire select events when value binding handles the update
3. **Multiple mode:** Selection behavior differs from single-select

The `previousTags` pattern works reliably regardless of these edge cases.

## Alternative: Use derive to Watch for Changes

If you only need reactive UI updates (not imperative side effects), you can use `derive`:

```typescript
const newAdditions = derive(tags, previousTags, (current, previous) => {
  return current.filter((t) => !previous.includes(t));
});
```

But for side effects like telemetry, the handler approach is more appropriate.

## Related Superstitions

- `2026-02-10-custom-event-detail-undefined-in-cf-render.md` - Why `$value` binding is preferred over event handlers
- `2026-02-10-cross-charm-stream-invocation-via-wish.md` - How to call streams for telemetry

## Metadata

```yaml
topic: events, cf-autocomplete, array-tracking, telemetry
discovered: 2026-02-10
confirmed_count: 1
last_confirmed: 2026-02-10
sessions: [community-wisdom-tag-list]
related_functions: handler, Writable.of, derive
pattern: packages/patterns/experimental/folksonomy-tags.tsx
status: superstition
confidence: medium
stars: 3
applies_to: [CommonTools]
```

## Guestbook

- 2026-02-10 - Discovered while implementing folksonomy-tags pattern that needed to post telemetry events when tags were added. Since `$value` binding updates the array directly without selection events, we needed a way to detect additions. The `previousTags` tracking pattern reliably computes the diff on each change. (community-wisdom-tag-list)

---

**Remember:** With `$value` binding on multi-select components, track previous state yourself to detect additions/removals. The `oncf-change` event fires on any change, but you need to compute the diff.
