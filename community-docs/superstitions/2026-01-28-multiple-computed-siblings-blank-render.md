# Multiple computed() Siblings Break Rendering (All Children Vanish)

**Date:** 2026-01-28
**Status:** superstition (well-tested but mechanism unknown)
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**Having two or more `computed()` as direct children of the same parent element causes the entire parent's children to vanish from the DOM.** No errors, no warnings — just a blank page. Wrap each `computed()` in its own `<div>` so each is the sole reactive child of its parent.

```tsx
// BROKEN - Multiple computed() as siblings of the same parent
<cf-vstack>
  <div>Static content</div>
  {computed(() => showA.get() ? <div>A</div> : null)}
  {computed(() => showB.get() ? <div>B</div> : null)}
</cf-vstack>
// Result: cf-vstack renders with ZERO children. Blank page.

// CORRECT - Each computed() wrapped in its own container
<cf-vstack>
  <div>Static content</div>
  <div>
    {computed(() => showA.get() ? <div>A</div> : null)}
  </div>
  <div>
    {computed(() => showB.get() ? <div>B</div> : null)}
  </div>
</cf-vstack>
// Result: Renders correctly.
```

---

## Summary

When a parent element (e.g., `cf-vstack`, `div`) has two or more `computed()` expressions as direct children, the entire parent renders empty — all children (including static ones) disappear from the DOM. This also applies to `.map()` as a sibling of `computed()`, which was discovered separately.

The rule generalizes to: **a parent element can have at most one reactive child** (`computed()`, `.map()`, or any cell-returning expression). If you need multiple, wrap each in a static container element.

## Symptoms

- **Entire parent element renders empty** — not just the computed children, ALL children vanish
- **No console errors** — pattern loads silently, `ct check` passes
- **Server-side data is correct** — `charm inspect` shows valid `$NAME` and `$UI`
- **DOM structure exists but is empty** — e.g., `cf-vstack` element exists with zero children
- **Single computed() works fine** — the issue only triggers with 2+ reactive siblings

## Bisection Evidence

Systematically tested with `person-minimal.tsx` deployed to runtime:

| Test | Children of cf-vstack | Result |
|------|----------------------|--------|
| Basic inputs only | Static elements | Renders |
| 1 computed() toggle | 1 reactive child | Renders |
| sectionHeader + 1 computed() | sectionHeader (contains nested computed) + 1 reactive child | Renders |
| 2 computed() toggles | 2 reactive children | **BLANK** |
| 2 computed() each in own `<div>` | 2 static children, each with 1 reactive child | Renders |

The trigger is specifically about **direct sibling count**, not nesting depth. A `computed()` nested inside a static element doesn't count as a sibling of another `computed()`.

## Why This May Happen

Speculative: The reactive rendering system may use a single "slot" per parent to track reactive children. When multiple reactive children compete for the same slot, the reconciliation fails silently and clears all children. This is consistent with the related `.map()` + `computed()` sibling issue.

## Correct Patterns

### Pattern 1: Wrap each section in a div

```tsx
<cf-vstack style="gap: 16px;">
  {/* Static content — no wrapper needed */}
  <cf-hstack>
    <cf-input $value={name} placeholder="Name" />
  </cf-hstack>

  {/* Each reactive section gets its own wrapper */}
  <div>
    {computed(() => {
      if (!showEmail.get()) return null;
      return <cf-input $value={email} placeholder="Email" />;
    })}
  </div>

  <div>
    {computed(() => {
      if (!showPhone.get()) return null;
      return <cf-input $value={phone} placeholder="Phone" />;
    })}
  </div>
</cf-vstack>
```

### Pattern 2: Collapsible sections with sectionHeader helper

```tsx
{/* Each sectionHeader + computed toggle pair in one div */}
<div>
  {sectionHeader("Contact Info", showContactInfo)}
  {computed(() => {
    if (!showContactInfo.get()) return null;
    return <cf-vstack>...</cf-vstack>;
  })}
</div>

<div>
  {sectionHeader("Notes", showNotes)}
  {computed(() => {
    if (!showNotes.get()) return null;
    return <cf-vstack>...</cf-vstack>;
  })}
</div>
```

Note: `sectionHeader()` contains a nested `computed()` inside a `cf-hstack`. Since it's nested (not a direct child of the `<div>`), the `<div>` still has only one direct reactive child — the toggle `computed()`. The sectionHeader's `computed()` is a grandchild.

### Pattern 3: Single computed() returning all conditional content

If wrapping in divs isn't desired, merge all conditional logic into one computed():

```tsx
<cf-vstack>
  <cf-hstack>...</cf-hstack>
  {computed(() => {
    const sections = [];
    if (showEmail.get()) sections.push(<cf-input $value={email} />);
    if (showPhone.get()) sections.push(<cf-input $value={phone} />);
    return <cf-vstack>{sections}</cf-vstack>;
  })}
</cf-vstack>
```

## Real-World Example

**Pattern:** Person (contacts pattern family)
**Bug:** Full person.tsx pattern rendered completely blank despite `ct check` passing and `charm inspect` showing correct data.

### Before (Blank Page)

```tsx
export default pattern<Input, Output>(({ person }) => ({
  [UI]: (
    <cf-screen>
      <cf-vstack style={{ gap: "16px", padding: "16px" }}>
        <cf-hstack>/* name inputs */</cf-hstack>

        {sectionHeader("Contact Info", showContactInfo)}
        {computed(() => { /* email/phone */ })}

        {sectionHeader("Addresses", showAddresses)}
        {computed(() => { /* address list */ })}

        {sectionHeader("Social Profiles", showSocial)}
        {computed(() => { /* social profiles */ })}

        {sectionHeader("Notes", showNotes)}
        {computed(() => { /* notes textarea */ })}

        {computed(() => { /* sameAs section */ })}
      </cf-vstack>
    </cf-screen>
  ),
}));
```

**Result:** `cf-vstack` rendered in DOM with zero children. Completely blank page.

### After (Works)

```tsx
<cf-vstack style={{ gap: "16px", padding: "16px" }}>
  <cf-hstack>/* name inputs */</cf-hstack>

  <div>
    {sectionHeader("Contact Info", showContactInfo)}
    {computed(() => { /* email/phone */ })}
  </div>

  <div>
    {sectionHeader("Addresses", showAddresses)}
    {computed(() => { /* address list */ })}
  </div>

  <div>
    {sectionHeader("Social Profiles", showSocial)}
    {computed(() => { /* social profiles */ })}
  </div>

  <div>
    {sectionHeader("Notes", showNotes)}
    {computed(() => { /* notes textarea */ })}
  </div>

  <div>
    {computed(() => { /* sameAs section */ })}
  </div>
</cf-vstack>
```

**Result:** All sections render correctly with collapsible toggle behavior.

## Related Superstitions

- `2026-01-19-nested-computed-in-map-silent-render-failure.md` — Related: computed() inside .map() also causes silent failures
- `2026-01-19-jsx-inside-computed-breaks-reactivity.md` — Different: about JSX inside computed, not sibling computed
- `2025-12-14-inline-computed-in-map-is-fine.md` — Compatible: inline computed inside map is fine; this is about sibling computed at the same level

## Broader Rule

This superstition, combined with the known `.map()` + `computed()` sibling issue, suggests a general framework limitation:

> **Each parent element can have at most ONE reactive child** (computed(), .map(), or cell expression). Multiple reactive siblings at the same DOM level break rendering.

This applies to:
- `computed()` + `computed()` siblings (this superstition)
- `computed()` + `.map()` siblings (previously discovered)
- Likely `.map()` + `.map()` siblings (untested)

## Metadata

```yaml
topic: reactivity, computed, rendering, silent-failure, siblings
discovered: 2026-01-28
confirmed_count: 5 (systematic bisection with 5 test deployments)
last_confirmed: 2026-01-28
sessions: [contacts-pattern-debug]
related_functions: computed, map, Writable
patterns:
  - packages/patterns/base/person.tsx
  - packages/patterns/base/family-member.tsx
  - packages/patterns/base/contacts.tsx
status: superstition
confidence: high
stars: 5
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 - Contacts pattern family. Full person.tsx and family-member.tsx patterns rendered completely blank despite passing ct check and charm inspect showing correct server-side data. Systematically bisected using person-minimal.tsx with progressive feature addition across 5 deployed test charms. Isolated to: 2+ computed() as direct siblings of cf-vstack. Verified fix: wrapping each computed() in a `<div>`. Applied to person.tsx (5 sections), family-member.tsx (5 sections), confirmed fix via deployed contacts.tsx master-detail testing. (contacts-pattern-debug)

---

**Remember:** This is a superstition — the exact runtime mechanism is not understood. But the bisection evidence is strong: 5 systematic test deployments consistently reproduced and confirmed the issue and fix.
