# Use Cell.for(cause) for Stable Entity IDs

**Source: Framework author (seefeldb) - PR #182 comments, December 2025**

## Summary

Use `Cell.for(cause).set(value)` to get deterministic, stable entity IDs across re-computations.

## The Pattern

```typescript
// Use Cell.for(cause).set(value) where cause is locally unique and stable
const projectCell = Cell.for(projectId).set(projectData);  // Best: external ID
const moduleCell = Cell.for("birthday").set(birthdayData); // Good: type name
const semanticCell = Cell.for({ name, year }).set(data);   // OK: semantic key
```

## Why

Framework author said: "Write array entries as `Cell.for(cause).set(value)`, where `cause` can be any JS object including cell references. they just have to be locally unique. Then you get stable entity IDs as long as `cause` is stable."

**Stability hierarchy:**
1. External IDs (excellent) - courseId, userId
2. Type names (excellent) - "birthday", "contact"
3. Semantic keys (good) - `{ projectName, year }`
4. Content hashes (moderate) - `refer(data)`
5. Extracted names (fragile) - auto-generated names

## Limitations

Framework author warned: "If it's more free-form, e.g. extracting possible projects that you have to then automatically name, it's going to be much harder."

For free-form entities, you'll need fuzzy matching to handle splits/merges across re-extractions.

## Metadata

```yaml
topic: cells, entity-ids, Cell.for, stability
observed_date: 2025-12-18
source: Framework author (seefeldb) PR #182 comments
```
