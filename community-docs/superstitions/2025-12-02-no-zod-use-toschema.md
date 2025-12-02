# Don't Use Zod - Use toSchema<T>() Instead

**Date:** 2025-12-02
**Confirmed by:** jkomoros

## Summary

The framework does NOT use Zod for schema definitions. Use `toSchema<T>()` with TypeScript interfaces instead.

## Wrong (Zod)

```tsx
import { z } from "zod";

const result = generateObject({
  prompt: "...",
  schema: z.object({ answer: z.string() }),
});
```

## Correct (toSchema)

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
- `toSchema<T>()` converts TypeScript types to the framework's schema format
- TypeScript interfaces give you type safety without runtime library overhead

## Pattern

1. Define a TypeScript interface for your expected output
2. Use `toSchema<InterfaceName>()` in the schema parameter
3. The result will be typed as `Cell<InterfaceName>`

## Tags

`generateObject`, `schema`, `toSchema`, `types`
