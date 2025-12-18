# Composed Patterns Can Share Cells Directly

**Source: Framework author (seefeldb) - PR #182 comments, December 2025**

## Summary

When you create a sub-pattern inline (composed), you can pass Cell inputs directly and both patterns co-own the data. No Stream handlers needed.

## The Pattern

```typescript
// Parent pattern creates shared cell
const sharedData = Cell.of({ value: "" });

// Pass to composed sub-pattern at construction
const subPattern = SubPattern({ data: sharedData });

// Both parent and sub-pattern can read/write sharedData
// No Stream handlers required!
```

## Why

Framework author confirmed: "yes, pass them in at construction and you co-own it. (i think that even works for wishes when passed in as context!)"

This is simpler than Stream handlers for tightly-coupled patterns.

## When to Use

- **Composed sub-patterns** (created inline): Share cells directly
- **Wished sub-patterns** (discovered via wish): May need Stream handlers due to write isolation

## Metadata

```yaml
topic: patterns, cells, composition, sub-patterns
observed_date: 2025-12-18
source: Framework author (seefeldb) PR #182 comments
```
