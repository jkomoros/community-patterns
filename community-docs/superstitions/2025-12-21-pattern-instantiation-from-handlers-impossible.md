---
topic: patterns, framework, handlers
discovered: 2025-12-21
sessions: members-module-development
related_labs_docs:
  - ~/Code/labs/packages/runner/src/builder/recipe.ts
  - ~/Code/labs/packages/runner/src/builder/json-utils.ts
  - ~/Code/labs/packages/runner/src/builtins/compile-and-run.ts
status: superstition
confidence: high
related_issues: CT-1130
---

# Dynamic Pattern Instantiation from Handlers is Currently Impossible

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this is verified correct,** upstream it to labs docs and delete this superstition.

---

## The Use Case

You want Pattern A to dynamically create instances of Pattern B in response to user action (inside a handler). Example: MembersModule creating a new Record when user types a name that doesn't exist.

## Why This is Currently Impossible

### Approach 1: Import Pattern Directly
```typescript
// BAD: Circular dependency
import Record from "./record.tsx";

const createRecord = handler((_, { name }) => {
  return Record({ title: name }); // Circular import!
});
```
**Result:** Build error due to circular dependency (MembersModule is imported by Record).

### Approach 2: Pass Factory Function as Pattern Input
```typescript
// BAD: Functions serialize to undefined
const MembersModule = recipe("MembersModule", ({ createRecord }) => {
  const handleCreate = handler((_, { name, createRecord }) => {
    return createRecord(name); // createRecord is undefined!
  });
});

// In parent pattern
<MembersModule createRecord={(name) => Record({ title: name })} />
```
**Result:** `createRecord` becomes `undefined`. Functions don't survive recipe compilation (they serialize to `undefined` in JSON).

### Approach 3: Pass Factory Function as Handler State
```typescript
// BAD: Handler state goes through JSON.stringify
const handleCreate = handler<Event, { factory: (name: string) => any }>(
  (_, { factory }) => {
    return factory(name); // factory is undefined!
  }
);
```
**Result:** Same problem. Handler state is serialized.

### Approach 4: compileAndRun()
```typescript
// BAD: No way to get source code at runtime
const handleCreate = handler((_, { patternSource }) => {
  return compileAndRun(patternSource, { title: name });
});
```
**Result:** `compileAndRun()` needs source code strings. At runtime, you have compiled Recipe objects - no way to get back to source.

## Root Cause

**Recipe compilation happens at build time.** Pattern definitions produce JSON-serializable structures. Functions cannot survive this serialization boundary.

From `recipe.ts:337-343` (serialization):
```typescript
// Nodes are converted to JSON
export function toJSONWithLegacyAliases(node: ...): JSONValue {
  // Functions fall through and become undefined
}
```

From `json-utils.ts:31-128`:
```typescript
// JSON conversion - no special handling for functions
```

## What Currently Works (But Shouldn't Be Used by Patterns)

Components like `ct-code-editor` use internal runtime APIs:
```typescript
// WORKS but patterns shouldn't access .runtime
const rt = (cell as any).runtime;
const tx = rt.edit();
const result = rt.getCell(rt.space, cause);
rt.run(tx, JSON.parse(patternJson), inputs, result);
tx.commit();
```

This is allowed because components are in the Trusted Computing Base. Patterns should not access `.runtime`.

## Proposed Solutions (Not Yet Implemented)

See Linear issue CT-1130 and RFC in `.claude/rfc-pattern-instantiation.md`.

**Option A: `instantiate()` Builtin**
```typescript
// Takes Recipe object (already serializable via .toJSON())
const newRecord = instantiate({
  pattern: Record,
  inputs: { title: "New Record" }
});
```

**Option B: `ct-charm-creator` Component**
```typescript
<ct-charm-creator
  $pattern={patternJsonCell}
  $inputs={inputsCell}
  onct-created={handleCreated}
/>
```

## Current Workaround

**Don't dynamically create patterns.** Instead:
1. Ask users to create records manually first
2. Let them reference existing records
3. Show helpful error messages

```typescript
if (isCustom) {
  errorMessage.set(
    "Creating new records is not yet supported. " +
    "Please create the record first, then add it here."
  );
  return;
}
```

## Evidence Files

- `packages/runner/src/builder/recipe.ts:337-343` - Serialization
- `packages/runner/src/builder/json-utils.ts:31-128` - JSON conversion
- `packages/runner/src/runtime.ts:455` - JSON.stringify in getImmutableCell
- `packages/ui/src/v2/components/ct-code-editor/ct-code-editor.ts` - Component using runtime access

## Guestbook

- 2025-12-21 - Exhaustively investigated all approaches for MembersModule to create new Records. None work. Filed CT-1130 for framework-level solution. (members-module-development)
