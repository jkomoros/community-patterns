# Div Elements Don't Support Hover Events (onMouseEnter/onMouseLeave)

**SUPERSTITION** - Single observation, needs verification

## Summary

Div elements don't support `onMouseEnter` and `onMouseLeave` events in CommonTools JSX, even though:
1. DOMAttributes interface has these event types defined
2. Documentation implies hover should work on any element

## The Problem

When trying to add hover handlers to a div:

```typescript
// ❌ ERROR: Property 'onMouseEnter' does not exist on type 'DetailedHTMLProps<CTHTMLAttributes<HTMLDivElement>, HTMLDivElement>'
<div onMouseEnter={handler} onMouseLeave={handler}>
  Content
</div>
```

## Root Cause Analysis

Investigated the framework JSX types:

1. **DOMAttributes** has ALL event handlers commented out with `@TODO(events)`:
   ```typescript
   // @TODO(events)
   // onMouseEnter?: MouseEventHandler<T> | undefined;
   ```

2. **CTHTMLAttributes** extends HTMLAttributes but doesn't include DOMAttributes events

3. **Documentation** (`docs/common/COMPONENTS.md` line 131) shows hover working on divs, suggesting it SHOULD work

## Likely Status: Oversight

This appears to be an **oversight** where documentation is ahead of implementation. The `@TODO(events)` marker suggests events were intentionally excluded temporarily and not yet enabled.

## Workaround

Use button elements (which support onClick) or implement click-to-select instead of hover:

```typescript
// ✅ WORKS - button supports onClick
<button
  style="background: transparent; border: none; cursor: pointer;"
  onClick={toggleSelection({ selectedId, itemId })}
>
  {content}
</button>
```

For mobile-friendly designs, click-to-select may actually be preferable anyway since hover doesn't work on touch devices.

## Related

- Framework JSX types: `~/Code/labs/packages/common/jsx/types.ts`
- Components docs: `~/Code/labs/docs/common/COMPONENTS.md`

## Metadata

```yaml
topic: hover, events, div, onMouseEnter, onMouseLeave, JSX
observed_date: 2025-12-13
pattern: extracurricular-selector
error_type: TypeScript compilation error
status: superstition (single observation)
```

## Guestbook

- 2025-12-13 - Discovered while implementing hover-to-show-conflicts feature (jkomoros)
