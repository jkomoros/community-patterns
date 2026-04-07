# Issue: Request for ct-chart Component

## Summary

Patterns cannot use SVG elements (`<svg>`, `<path>`, `<polyline>`, etc.) because they're not in `JSX.IntrinsicElements`. This makes it impossible to create line charts, sparklines, or other data visualizations. Requesting a `ct-chart` component to fill this gap.

## Use Case

**Pattern:** github-momentum-tracker

**What we're trying to accomplish:**
- Display commit activity over 52 weeks as a line chart
- Show trend visualization (accelerating/decelerating momentum)
- Sparkline-style compact visualizations for multiple repos

**Current workaround:** Using `<div>` elements as vertical bars (bar chart), but this doesn't convey trends as effectively as a line chart.

## What We Tried

### Attempt 1: Direct SVG in JSX

```typescript
<svg width="200" height="100">
  <polyline points="0,80 40,60 80,70" fill="none" stroke="blue" />
</svg>
```

**Error:**
```
CompilerError: Property 'svg' does not exist on type 'JSX.IntrinsicElements'.
CompilerError: Property 'polyline' does not exist on type 'JSX.IntrinsicElements'.
```

SVG elements are not in the allowed JSX elements.

### Attempt 2: Div-based bar chart

```typescript
{data.map((val, i) => (
  <div style={{ height: `${(val / maxVal) * 100}%`, flex: 1 }} />
))}
```

**Works** but doesn't show trends as clearly as connected lines.

## Proposal: ct-chart Component

### Recommended Approach: Vega-Lite Inspired

[Vega-Lite](https://vega.github.io/vega-lite/) is a high-level grammar of interactive graphics with a declarative JSON syntax. It's:
- Academically backed (UW Interactive Data Lab)
- Extremely popular in data visualization
- Clean, declarative specification
- Supports line, bar, area, scatter, and many other chart types

**Example Vega-Lite spec:**
```json
{
  "mark": "line",
  "encoding": {
    "x": {"field": "week", "type": "ordinal"},
    "y": {"field": "commits", "type": "quantitative"}
  }
}
```

### Proposed ct-chart API

**Option A: Vega-Lite spec as attribute**
```html
<ct-chart
  data={weeklyData}
  spec={{
    mark: "line",
    encoding: {
      x: { field: "week" },
      y: { field: "value" }
    }
  }}
  width={300}
  height={100}
/>
```

**Option B: Simpler props-based API (like Recharts)**
```html
<ct-chart
  type="line"
  data={weeklyData}
  xKey="week"
  yKey="value"
  width={300}
  height={100}
  color="#0366d6"
/>
```

**Option C: Sparkline-specific component**
```html
<ct-sparkline
  data={[10, 25, 15, 30, 22, 18, 35]}
  width={100}
  height={30}
  color="#0366d6"
  fill={true}
/>
```

### Popular Libraries to Consider

| Library | Syntax | Pros | Cons |
|---------|--------|------|------|
| **Vega-Lite** | JSON spec | Very expressive, well-documented | Larger bundle, learning curve |
| **Chart.js** | Config object | Most popular, familiar | More imperative |
| **Recharts** | JSX components | React-like, declarative | React-specific API |
| **Observable Plot** | Function calls | Simple, modern | Less common |
| **uPlot** | Config object | Tiny (~40KB), fast | Less features |

### Minimum Viable Feature Set

For patterns, even a simple component supporting just:
- **Line chart** (for trends)
- **Bar chart** (for comparisons)
- **Sparkline** (compact inline visualization)

...would unlock many visualization use cases.

## Desired Behavior

1. Pattern can import or use `ct-chart` component
2. Pass data as array of objects or numbers
3. Specify chart type (line, bar, sparkline)
4. Component renders SVG internally (hidden from pattern author)
5. Supports reactive data updates

## Questions

1. **Is adding SVG to JSX.IntrinsicElements feasible?** That would be the simplest solution.
2. **Would a ct-chart component be considered?** What's the appetite for visualization components?
3. **Which charting library/semantics would fit best?** Vega-Lite spec would be powerful but maybe overkill for simple use cases.
4. **Would a simple ct-sparkline be easier to start with?** Limited scope, high value.

## Environment

- CommonTools framework
- Pattern: github-momentum-tracker (52 weeks of commit data)
- Superstition documented: `2025-12-01-svg-elements-not-supported-in-patterns.md`

---

**Would love to hear thoughts on the best approach for adding visualization capabilities to patterns!**
