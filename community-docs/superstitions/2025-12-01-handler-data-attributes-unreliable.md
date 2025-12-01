# Handler Event Data Attributes Are Unreliable - Pass Data in Context Instead

**Status:** Superstition (single observation, verified against docs 2025-12-01)

## Problem

When using `handler()` in CommonTools patterns, DOM `data-*` attributes are not reliably accessible from the event object. Clicking a button with `data-date="2025-11-30"` and trying to read `event.target.dataset.date` or `event.currentTarget.dataset.date` returns undefined.

**Note:** `event.target.value` IS documented to work (see CHARM_LINKING.md textarea example). The issue is specifically with `dataset` (data-* attributes).

```typescript
// BAD - data-date attribute not accessible in handler
const toggleDayStar = handler<
  { target?: { dataset?: { date?: string } } },
  { days: Cell<DayRecord[]> }
>((event, { days }) => {
  const date = event?.target?.dataset?.date;  // undefined!
  // ...
});

// In JSX:
<button
  onClick={toggleDayStar({ days })}
  data-date={day.date}  // This attribute is set but not readable
>
```

## Solution

Pass dynamic data as part of the handler context instead of trying to read from DOM event attributes:

```typescript
// GOOD - pass data in context
const toggleDayStar = handler<
  unknown,
  { days: Cell<DayRecord[]>; dateToToggle: string }
>((_, { days, dateToToggle }) => {
  const date = dateToToggle;  // Works!
  // ...
});

// In JSX - pass date in context:
<button onClick={toggleDayStar({ days, dateToToggle: day.date })}>
```

## Why This Happens

The cause is unknown. While `event.target.value` works (documented in CHARM_LINKING.md for form elements), `event.target.dataset` does not. This could be:
- Shadow DOM boundary issues with custom elements
- Event delegation not preserving dataset
- A bug in the framework
- Intentional design to encourage passing data via context

## General Rule

In CommonTools handlers:
- **DON'T** rely on DOM event attributes (`data-*`, `id`, etc.)
- **DO** pass any needed dynamic values directly in the handler context

## Symptoms

- Handler fires but does nothing
- `event.target.dataset.xxx` or `event.currentTarget.dataset.xxx` returns undefined
- Works in regular React but not in CommonTools patterns

## Metadata

```yaml
topic: handler, events, data-attributes, context
discovered: 2025-12-01
session: star-chart-corrections-view
status: superstition
```

## Guestbook

- 2025-12-01 - Discovered while implementing corrections view for Star Chart. Tried to pass date via `data-date` attribute on button, read via `event.target.dataset.date` and `event.currentTarget.dataset.date`. Neither worked. Fixed by passing `dateToToggle` in the handler context instead. (star-chart-corrections-view)
- 2025-12-01 - Verified against labs/docs: CHARM_LINKING.md shows `event.target.value` working on textarea onChange, but no docs mention `dataset`. The issue is specific to data-* attributes, not all event properties. (star-chart-corrections-view)
