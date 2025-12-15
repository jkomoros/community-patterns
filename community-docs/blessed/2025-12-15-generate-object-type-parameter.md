# generateObject Can Use Type Parameter Instead of Schema

**Status:** Blessed (framework author confirmed 2025-12-15)
**Source:** PR #170 review by seefeldb

## The Rule

You can use `generateObject<T>` with a type parameter instead of explicitly passing `schema: toSchema<T>()`.

## Both Work

```typescript
// ✅ Shorter form - type parameter
const result = generateObject<ExtractionResponse>({
  prompt: computed(() => `Extract data from: ${inputText}`),
});

// ✅ Also valid - explicit schema
const result = generateObject({
  prompt: computed(() => `Extract data from: ${inputText}`),
  schema: toSchema<ExtractionResponse>(),
});
```

## When to Use Each

**Type parameter form** - cleaner for simple cases:
```typescript
generateObject<MyType>({ prompt })
```

**Explicit schema form** - when you need to customize the schema:
```typescript
generateObject({
  prompt,
  schema: toSchema<MyType>(),
  // other options...
})
```

## Framework Author Quote (2025-12-15)

> "nit, but instead of passing `schema` you can also just do `generateObject<ExtractionResponse>`"

## Metadata

```yaml
topic: generateObject, schema, type-parameter, llm
status: blessed
source: framework-author
date: 2025-12-15
pr: 170
```
