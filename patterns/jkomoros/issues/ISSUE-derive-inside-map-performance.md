# Performance Issue: derive() inside .map() causes excessive re-runs and CPU spike

## Summary

Using `derive()` inside `.map()` to render list items causes:
1. **8x+ more derive calls than expected** - 250 items triggers 2000+ derive calls
2. **Derives never stabilize** - keeps re-running indefinitely
3. **CPU spike for 10+ minutes** with 200+ items
4. **Each row's derive has a different charm ID** - suggests context isolation issue

## Minimal Reproduction

**File:** `patterns/jkomoros/WIP/derive-perf-repro.tsx`

**Deployed at:** `http://localhost:8000/calendar-debug/baedreibzit2rqbteayywdfdod335g2h7d7mzf3k2dr23h7uedk7olalsna`

**Steps:**
1. Open the charm
2. Open browser DevTools console
3. Click "Generate 250 Events"
4. Watch CPU spike and console output

## The Problematic Pattern

```tsx
{events.map((event) => (
  <tr>
    <td>
      {derive(
        { startDateTime: event.startDateTime, endDateTime: event.endDateTime, isAllDay: event.isAllDay },
        ({ startDateTime, endDateTime, isAllDay }) => {
          return formatEventDate(startDateTime, endDateTime, isAllDay);
        }
      )}
    </td>
    <td>{event.summary}</td>
  </tr>
))}
```

## Expected Behavior

- ~250 derive calls on initial render (one per row)
- Derives stabilize after initial render
- No CPU spike after data loads

## Actual Behavior

From console logs with debug instrumentation:

```
[DERIVE DEBUG SUMMARY] total=259, perRow=253, elapsed=110601ms   // Initial (expected)
[DERIVE DEBUG SUMMARY] total=527, perRow=519, elapsed=170187ms   // 2x
[DERIVE DEBUG SUMMARY] total=781, perRow=772, elapsed=222015ms   // 3x
[DERIVE DEBUG SUMMARY] total=1036, perRow=1025, elapsed=288658ms // 4x
[DERIVE DEBUG SUMMARY] total=2094, perRow=2039, elapsed=617984ms // 8x after 10 min, still going
```

## Key Observation: Different Charm IDs Per Row

Each per-row derive logs with a **different charm ID**:

```
Charm(baedreif7wvjpslc67pkev3zlsqrj4ercspqv4tiq4c2kjgqit3csyjfrii) [log]: formatEventDate[event1]
Charm(baedreibp4iy2pnszgvupfhyymzzigyrbhpx7ulk6r42yje2y7kejf5khaa) [log]: formatEventDate[event2]
Charm(baedreiezcbt6t3dl5uv7q6grwttahvwxqjvxp6udhntpeppkpook6r35ii) [log]: formatEventDate[event3]
```

This suggests each row's derive is creating a separate charm context, which may be the root cause.

## Additional Symptoms

1. **eventCount derive re-runs repeatedly** even when value unchanged:
   ```
   eventCount (length=253): elapsed=571924ms
   eventCount (length=253): elapsed=584711ms  // Same value, re-running
   eventCount (length=253): elapsed=595973ms  // Still re-running
   ```

2. **WebSocket connection failures** under load:
   ```
   WebSocket connection to 'ws://localhost:8000/api/storage/memory?space=...' failed: ERR_CONNECTION_REFUSED
   ```

3. **formatEventDate[undefined]** appears in logs - event IDs becoming undefined

## Environment

- CommonTools framework (local dev)
- Pattern using `derive()` inside `events.map()`
- 250 items in the array

## Files

- **Minimal repro:** `patterns/jkomoros/WIP/derive-perf-repro.tsx`
- **Original pattern with issue:** `patterns/jkomoros/google-calendar-importer.tsx`

## Questions for Framework Team

1. Is `derive()` inside `.map()` a supported pattern?
2. Why does each row's derive get a different charm ID?
3. Should derives be batched/debounced when inside `.map()`?
4. Is there a recommended alternative pattern for per-row computed values?
