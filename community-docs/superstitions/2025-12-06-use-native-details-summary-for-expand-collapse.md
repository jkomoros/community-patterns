# Use Native HTML details/summary for Expand/Collapse

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Implementing expand/collapse functionality in pattern UIs

## Problem

Trying to implement custom expand/collapse with `Cell.of()` state and `handler()` for onClick events leads to complex code that often doesn't work:

1. Handlers inside `derive()` cause `ReadOnlyAddressError`
2. Handler binding syntax is tricky (`handler<Input, State>` where State includes both Cells AND plain values)
3. State management adds boilerplate

### What Didn't Work

```typescript
// ❌ COMPLEX: Custom state + handler approach
const expandedAgents = Cell.of<Record<string, boolean>>({});

const toggleExpand = handler<
  unknown,
  { expanded: Cell<Record<string, boolean>>; url: string }
>((_, { expanded, url }) => {
  const current = expanded.get() || {};
  expanded.set({
    ...current,
    [url]: !current[url],
  });
});

// In UI:
<div onClick={toggleExpand({ expanded: expandedAgents, url: registry.url })}>
  {computed(() => expandedAgents[registry.url] ? "▼" : "▶")}
  Agent Name
</div>
{computed(() => expandedAgents[registry.url] ? <Content /> : null)}
```

**Problems:**
- Handler didn't trigger (onClick not responding)
- Complex binding syntax prone to errors
- Need to manage state manually

## Solution That Worked

**Use native HTML `<details>/<summary>` elements:**

```typescript
// ✅ SIMPLE: Native HTML approach - works out of the box
{registryEntries.map((registry) => (
  <details
    style={{
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      marginBottom: "8px",
    }}
  >
    <summary
      style={{
        padding: "10px 12px",
        background: "#f8fafc",
        cursor: "pointer",
        listStyle: "none", // Remove default arrow
      }}
    >
      <div style={{ fontWeight: "500" }}>
        {registry.agentTypeName}
      </div>
      <div style={{ fontSize: "10px", color: "#64748b" }}>
        {registry.queries.length} queries
      </div>
    </summary>

    {/* Content shown when expanded */}
    <div style={{ padding: "8px" }}>
      {registry.queries.map((query) => (
        <div>{query.query}</div>
      ))}
    </div>
  </details>
))}
```

**Benefits:**
- No state management needed
- No handlers needed
- Browser handles all expand/collapse logic
- Works immediately
- Accessible out of the box

## Working Examples in Codebase

Search for patterns using `<details>/<summary>`:
```bash
grep -r "<details\|<summary" patterns/
```

Examples:
- `cheeseboard-schedule.tsx` - Pizza history section
- `prompt-injection-tracker.tsx` - Multiple collapsible sections
- `github-auth.tsx` - Advanced settings
- `substack-summarizer.tsx` - Article details

## When to Use Native vs Custom

**Use native `<details>/<summary>` when:**
- Simple expand/collapse of static content
- You don't need programmatic control over expanded state
- Accessibility is important

**Consider custom handlers when:**
- You need to persist expanded state across page loads
- You need programmatic expand/collapse (e.g., "expand all" button)
- You need to coordinate multiple sections' state

## Context

- **Pattern:** gmail-search-registry.tsx
- **Use case:** Expanding agent type sections to show queries
- **Original approach:** Custom `Cell.of()` + `handler()` - onClick didn't work
- **Working approach:** Native `<details>/<summary>` - works immediately

## Related

- **Folk Wisdom: onclick-handlers-conditional-rendering.md** - Handler placement issues
- **Superstition: prebind-handlers-outside-derive.md** - Handler binding issues
- **Superstition: handlers-inside-derive-cause-readonly-error.md** - ReadOnlyAddressError

## Metadata

```yaml
topic: UI, expand-collapse, details, summary, handlers, HTML
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [gmail-search-registry-expand-collapse]
related_functions: details, summary, handler, cell
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- 2025-12-06 - gmail-search-registry.tsx. Tried custom expand/collapse with `Cell.of()` + `handler()` for agent type sections. onClick handlers weren't triggering despite various binding approaches. Switched to native `<details>/<summary>` and it worked immediately. Much simpler code too. (gmail-search-registry-expand-collapse)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
