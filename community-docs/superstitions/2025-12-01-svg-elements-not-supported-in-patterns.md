# Superstition: SVG Elements Not Supported in Patterns

**Date:** 2025-12-01
**Author:** jkomoros
**Pattern:** svg-test (test pattern)
**Status:** superstition

## Summary

SVG elements (`<svg>`, `<path>`, `<polyline>`, `<circle>`, etc.) are NOT supported in CommonTools pattern JSX. The `JSX.IntrinsicElements` type definition does not include SVG elements.

## Observed Behavior

### Doesn't Work
```typescript
export default pattern<{}, {}>(() => {
  return {
    [NAME]: "SVG Test",
    [UI]: (
      <div>
        <svg width="200" height="100">
          <polyline points="0,80 40,60 80,70" fill="none" stroke="blue" />
          <circle cx="40" cy="60" r="3" fill="blue" />
        </svg>
      </div>
    ),
  };
});
```

### Error
```
CompilerError: [ERROR] Property 'svg' does not exist on type 'JSX.IntrinsicElements'.
CompilerError: [ERROR] Property 'polyline' does not exist on type 'JSX.IntrinsicElements'.
CompilerError: [ERROR] Property 'circle' does not exist on type 'JSX.IntrinsicElements'.
```

## Technical Details

The CommonTools JSX type definitions only include a limited set of HTML elements. SVG elements are not in the allowed list.

Note: The labs framework UI components (like `ct-audio-visualizer`, `ct-chevron-button`, etc.) DO use SVG internally, but they're implemented as web components with Shadow DOM, not as pattern JSX.

## Workarounds

1. **Use bar charts with divs** - Create bar charts using styled `<div>` elements (the current approach in github-momentum-tracker)

2. **Use emoji/text visualization** - Sparklines using characters like `▁▂▃▄▅▆▇█`

3. **Request ct-chart component** - File an issue requesting a `ct-chart` or `ct-sparkline` component be added to the UI library

4. **Use canvas via dangerouslySetInnerHTML** - NOT RECOMMENDED, likely blocked by security constraints

## Impact

This prevents patterns from creating line charts, pie charts, custom visualizations, or any other SVG-based graphics. Patterns are limited to HTML/CSS-based visualizations.

## Questions for Framework Authors

1. Is there a plan to add SVG support to pattern JSX?
2. Would a `ct-chart` component be feasible to add to the UI library?
3. Are there other visualization approaches that would work?

## Testing

- Tested with simple pattern containing `<svg>` and `<polyline>` elements
- Compiler immediately rejected with type error
- No SVG patterns exist in community-patterns or labs examples
