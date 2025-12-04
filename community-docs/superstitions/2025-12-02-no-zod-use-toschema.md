# Don't Use Zod - Use TypeScript Types Instead

**Date:** 2025-12-02
**Updated:** 2025-12-03
**Confirmed by:** jkomoros, seefeldb

## Summary

The framework does NOT use Zod for schema definitions. Use TypeScript interfaces with `generateObject<T>()`.

## Wrong (Zod)

```tsx
import { z } from "zod";

const result = generateObject({
  prompt: "...",
  schema: z.object({ answer: z.string() }),
});
```

## Correct (Simplest - recommended)

```tsx
interface Answer {
  answer: string;
}

const result = generateObject<Answer>({
  prompt: "...",
});
```

## Also Correct (toSchema - older pattern)

```tsx
import { toSchema } from "commontools";

interface Answer {
  answer: string;
}

const result = generateObject({
  prompt: "...",
  schema: toSchema<Answer>(),
});
```

## Why

- Zod is not a dependency of the framework
- The framework infers schema from TypeScript types
- `generateObject<T>()` is the simplest approach (Gideon merged this)
- `toSchema<T>()` still works but is no longer required

## Pattern

1. Define a TypeScript interface for your expected output
2. Pass it as a type parameter: `generateObject<YourInterface>({ ... })`
3. The result will be typed as `Cell<YourInterface>`

## Tags

`generateObject`, `schema`, `toSchema`, `types`
