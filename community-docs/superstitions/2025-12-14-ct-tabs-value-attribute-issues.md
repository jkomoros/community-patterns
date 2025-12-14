# ct-tabs Value Attribute Not Reflected to Child Elements

**SUPERSTITION** - Single observation, needs verification

## Summary

When using ct-tabs with reactive Cell bindings, the `value` attribute is set correctly on the ct-tabs element itself, but **is not reflected to the child ct-tab and ct-tab-panel elements**, causing all panels to remain hidden.

## The Problem

When implementing tabs like this:

```typescript
const activeTab = cell<TabId>("dashboard");

<ct-tabs value={activeTab} onct-change={onTabChange}>
  <ct-tab-list>
    <ct-tab value="dashboard">Dashboard</ct-tab>
    <ct-tab value="configure">Configure</ct-tab>
  </ct-tab-list>
  <ct-tab-panel value="dashboard">Dashboard content</ct-tab-panel>
  <ct-tab-panel value="configure">Configure content</ct-tab-panel>
</ct-tabs>
```

**What happens:**
1. ct-tabs receives `value: "dashboard"` as a JS property (verified via `ctTabs.value`)
2. BUT the HTML `value` attribute on ct-tabs is `null` (verified via `getAttribute('value')`)
3. The child ct-tab elements have their JS `value` property set correctly
4. BUT the child ct-tab elements have NO `value` HTML attribute
5. ct-tabs uses `getAttribute('value')` to match tabs/panels to the selected value
6. Since attributes are null, **no tab is marked selected and all panels stay hidden**

## Evidence from DOM inspection

```javascript
// ct-tabs state
{
  value: "dashboard",        // JS property - CORRECT
  getAttribute: null,        // HTML attribute - NULL!
}

// ct-tab states (all 4 tabs)
{
  value: "dashboard",        // JS property - CORRECT
  valueAttr: null,           // HTML attribute - NULL!
  selected: false            // Not selected because matching fails
}

// ct-tab-panel states (all 4 panels)
{
  value: "dashboard",        // JS property - CORRECT
  valueAttr: null,           // HTML attribute - NULL!
  hidden: true               // All hidden because no match
}
```

## Root Cause Analysis

The ct-tabs component's `updateTabSelection()` method uses DOM attribute selectors:
```typescript
// From ct-tabs.ts line 133-135
tabs.forEach((tab) => {
  const tabValue = tab.getAttribute("value");  // Returns null!
  if (tabValue === this.value) { ... }
});
```

When the JSX compiler sets `value="dashboard"` on ct-tab, it appears to set the JS property but not the HTML attribute. The component's property definition has `reflect: true`:

```typescript
// From ct-tab.ts line 22
static override properties = {
  value: { type: String, reflect: true },
  ...
};
```

But `reflect: true` only reflects changes AFTER initial render. The initial value from JSX may not trigger reflection.

## Additional Issue: $value Not Supported

The ct-tabs JSX types don't include `$value` for two-way binding:

```typescript
// From jsx.d.ts line 3591-3595
interface CTTabsAttributes<T> extends CTHTMLAttributes<T> {
  "value"?: string | CellLike<string>;
  "orientation"?: "horizontal" | "vertical" | CellLike<"horizontal" | "vertical">;
  "onct-change"?: EventHandler<{ value: string }>;
}
// Note: No "$value" defined, unlike ct-input, ct-select, etc.
```

Attempting to use `$value`:
```
CompilerError: Property '$value' does not exist on type 'DetailedHTMLProps<CTTabsAttributes<CTTabsElement>, CTTabsElement>'
```

## Workaround

Use custom button-based tabs with ifElse for panel visibility:

```typescript
const activeTab = cell<TabId>("dashboard");
const isDashboardTab = computed(() => activeTab.get() === "dashboard");

// Tab buttons
<button onClick={switchToDashboard}>Dashboard</button>

// Tab panels with ifElse
{ifElse(isDashboardTab, <div>Dashboard content</div>, null)}
```

This is more verbose but works reliably with reactive state.

## Potential Fixes

1. **JSX compiler**: Ensure static `value="..."` attributes are set as HTML attributes, not just JS properties
2. **ct-tabs**: Use JS property access (`tab.value`) instead of `getAttribute('value')`
3. **ct-tabs**: Add `$value` support to JSX types for two-way Cell binding

## Related

- ct-tabs component: `~/Code/labs/packages/ui/src/v2/components/ct-tabs/ct-tabs.ts`
- ct-tab component: `~/Code/labs/packages/ui/src/v2/components/ct-tab/ct-tab.ts`
- ct-tab-panel component: `~/Code/labs/packages/ui/src/v2/components/ct-tab-panel/ct-tab-panel.ts`
- JSX types: `~/Code/labs/packages/html/src/jsx.d.ts` (lines 3591-3605)

## Metadata

```yaml
topic: ct-tabs, tabs, value attribute, JSX, reflection, hidden panels
observed_date: 2025-12-14
pattern: extracurricular-selector
error_type: UI components not rendering (panels hidden)
status: superstition (single observation)
```

## Guestbook

- 2025-12-14 - Discovered while attempting to migrate from custom tabs to ct-tabs (jkomoros/claude)
