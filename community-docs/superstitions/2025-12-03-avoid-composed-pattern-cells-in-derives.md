# Avoid Using Cells from Composed Patterns in computed()

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Using cells exposed by composed (child) patterns in `computed()` calls

## Problem

When composing patterns (calling one pattern from another), using cells from the child pattern's output in computed() can cause **infinite reactive loops** that hang deployment and freeze the runtime.

### What Didn't Work

```typescript
// Parent pattern composing a child pattern
const searcher = GmailAgenticSearch({
  agentGoal,
  systemPrompt: "...",
  // ... other props
});

// Using child pattern's cell in a computed - CAUSES HANG!
const buttonsDisabled = computed(() => {
  // searcher.isAuthenticated is the problem
  return !searcher.isAuthenticated || isScanning;
});

// In UI - buttons never render, deployment hangs
<ct-button disabled={buttonsDisabled}>Scan</ct-button>
```

**Symptom:**
- Deployment completes but charm never renders
- No console errors
- Debugger shows "No telemetry events"
- Runtime appears stuck/frozen
- If happens during deployment, `charm new` hangs indefinitely

**Note:** This is NOT the same as ReadOnlyAddressError - the pattern silently hangs with no error message.

### Why (Hypothesis)

When you compose patterns, the child pattern creates its own reactive graph. Using cells from this child graph in the parent's computeds may create:
1. Circular dependencies between the two reactive graphs
2. Cell tracking confusion (same cell tracked in two contexts)
3. Infinite recomputation loops as changes bounce between parent and child

## Solution That Worked

**Don't use child pattern cells in computed().** Instead:

**Option 1: Use only local cells in computed()**
```typescript
// Only use our own cells in computed()
const buttonsDisabled = computed(() => isScanning);

// Auth check happens implicitly - buttons shown when user connects Gmail
```

**Option 2: Use the cell directly in UI (not wrapped in computed)**
```typescript
// OK to pass child cell directly to UI attributes
<ct-button disabled={searcher.isScanning}>Scan</ct-button>

// OK to use child cell in ifElse (not mixed with other cells)
{ifElse(searcher.isAuthenticated, <buttons/>, null)}
```

**Option 3: Display child pattern's UI components directly**
```typescript
// Let the child handle its own reactive UI
{searcher.authUI}      // OK - rendered by child pattern
{searcher.progressUI}  // OK - rendered by child pattern
```

## When to Use This

Be cautious when:
- Composing patterns (Pattern A calls Pattern B)
- The child pattern exposes cells you want to use
- You want to combine child cells with parent cells in computed()

Safe patterns:
- Using child cells directly in simple UI bindings
- Using child's pre-rendered UI components
- Using child cells in ifElse conditions (alone, not combined with computed)

## Context

- **Parent pattern:** hotel-membership-gmail-agent.tsx
- **Child pattern:** gmail-agentic-search.tsx (base pattern)
- **Use case:** Wanted to disable buttons when `!auth || scanning`
- **Problem cell:** `searcher.isAuthenticated` (from composed child pattern)
- **Framework:** CommonTools with TypeScript

## Related

- **Superstition: Pre-bind Handlers Outside computed()** - Related Cell context issues
- **Folk Wisdom: onClick Handlers Should Not Be Inside Conditional Rendering** - Related reactive context issues
- **Superstition: ifElse and computed Require Consistent Cell Count** - Related cell tracking issues

## Metadata

```yaml
topic: patterns, composition, computed, cells, reactive-loops, hangs
discovered: 2025-12-03
confirmed_count: 1
last_confirmed: 2025-12-03
sessions: [hotel-membership-migration-check-recent]
related_functions: computed, pattern composition
related_docs:
  - superstitions/2025-12-03-prebind-handlers-outside-derive.md
  - folk_wisdom/onclick-handlers-conditional-rendering.md
  - superstitions/2025-11-30-ifelse-derive-consistent-cell-count.md
status: superstition
```

## Guestbook

- 2025-12-03 - Adding "Check Recent" scan mode to hotel-membership-gmail-agent. Pattern composes GmailAgenticSearch base pattern. Created `buttonsDisabled = computed(() => !searcher.isAuthenticated || isScanning)` to disable buttons when not authenticated or scanning. Deployment hung - no errors, charm never rendered, "No telemetry events" in debugger. Tried multiple variations (ifElse with searcher.isAuthenticated, etc) - all hung. Fix: simplified to `buttonsDisabled = computed(() => isScanning)` using only local cell. Pattern rendered immediately. Hypothesis: mixing cells from composed patterns with local cells in computed() creates reactive loops. (hotel-membership-migration-check-recent)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
