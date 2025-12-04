---
topic: reactivity
discovered: 2025-12-04
confirmed_count: 1
last_confirmed: 2025-12-04
sessions: [multi-gmail-auth-dropdown-fix]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Default<> Input Cells May Be Read-Only - Use Local cell() for UI State

## Problem

Pattern inputs with `Default<T, defaultValue>` types may be **read-only** when the pattern is instantiated with default values. Attempting to write to them via handlers will fail silently or throw errors.

**Example that FAILS:**

```typescript
interface Input {
  accountType: Default<"default" | "personal" | "work", "default">;
}

export default pattern<Input>(({ accountType }) => {
  // Handler tries to write to input cell
  const setAccountType = handler<
    { target: { value: string } },
    { accountType: Cell<string> }
  >((event, state) => {
    // ❌ FAILS - accountType may be read-only!
    state.accountType.set(event.target.value);
  });

  return {
    [UI]: (
      <select onChange={setAccountType({ accountType })}>
        <option value="default">Any</option>
        <option value="personal">Personal</option>
      </select>
    ),
  };
});
```

**Symptoms:**
- Dropdown visually changes but value doesn't update
- Handler appears to run but cell value stays at default
- `ReadOnlyAddressError` may be thrown
- No obvious error in some cases (silent failure)

## Solution That Seemed To Work

Create a **local writable cell** using `cell()` for UI state:

```typescript
interface Input {
  accountType: Default<"default" | "personal" | "work", "default">;
}

export default pattern<Input>(({ accountType }) => {
  // ✅ Create local writable cell for UI state
  const selectedAccountType = cell<"default" | "personal" | "work">("default");

  // Handler writes to local cell (always writable)
  const setAccountType = handler<
    { target: { value: string } },
    { selectedType: Cell<string> }
  >((event, state) => {
    // ✅ WORKS - local cell is writable!
    state.selectedType.set(event.target.value);
  });

  // Derive reactive values from local cell
  const wishTag = derive(selectedAccountType, (type) => {
    switch (type) {
      case "personal": return "#googleAuthPersonal";
      case "work": return "#googleAuthWork";
      default: return "#googleAuth";
    }
  });

  return {
    [UI]: (
      <select onChange={setAccountType({ selectedType: selectedAccountType })}>
        <option value="default">Any</option>
        <option value="personal">Personal</option>
      </select>
    ),
  };
});
```

**Why this works:**
- `cell()` creates a fresh, always-writable cell
- Local cells are owned by the pattern instance
- No dependency on how the pattern was instantiated

## Key Insight

| Cell Source | Writable? |
|-------------|-----------|
| `cell()` (local) | ✅ Always writable |
| Pattern input with Default<> | ⚠️ May be read-only |
| `derive()` result | ❌ Read-only projection |

**Rule of thumb:**
- Use `cell()` for UI state that needs to be written via handlers
- Use pattern inputs for configuration passed from parent patterns
- Use `derive()` for computed/transformed values (read-only)

## Context

Discovered while implementing multi-account Gmail auth dropdown:
- Pattern had `accountType: Default<"default" | "personal" | "work", "default">`
- Dropdown onChange handler tried to write to `accountType`
- Visual selection worked but cell value didn't update
- Fix: Create local `selectedAccountType = cell(...)` for UI state

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`
- **Folk wisdom:** `community-docs/folk_wisdom/thinking-reactively-vs-events.md` - "Local Cells for Component Output"
- **Related superstition:** `2025-12-03-derive-creates-readonly-cells-use-property-access.md`

## Tested In

- `gmail-importer.tsx` - Account type dropdown
- `gmail-agentic-search.tsx` - Account type dropdown
- **Playwright test (2025-12-04):**
  - URL: `http://localhost:8000/jkomoros-test/baedreicakmkuv2gqy2yobyl2327qsjcvcgwyddszsjgw2on3dz6wsn4e4m`
  - Selected "Personal" → title changed to "unauthorized" (looking for #googleAuthPersonal)
  - Selected "Work" → title stayed "unauthorized" (looking for #googleAuthWork)
  - Selected "Any Account" → title changed to "jkomoros@gmail.com" (found #googleAuth)
  - Console logged: `[GmailImporter] Account type changed to: personal/work/default`
  - **CONFIRMED WORKING** - Reactive wish switches auth correctly

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
