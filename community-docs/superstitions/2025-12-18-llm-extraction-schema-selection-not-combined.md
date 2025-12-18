# LLM Extraction: Use Schema Selection, Not Combined Schemas

**Source: Framework author (seefeldb) - PR #182 comments, December 2025**

## Summary

Don't use a single combined schema for LLM extraction. Instead, use schema selection with confidence scores and explanations.

## The Pattern

```typescript
// DON'T DO THIS - combined schema
const { result } = generateObject({
  schema: { /* all 30+ fields from all types */ }
});

// DO THIS - schema selection with scores + explanations
const { result } = generateObject({
  schema: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["birthday", "contact", ...] },
          score: { type: "number", minimum: 0, maximum: 100 },
          explanation: { type: "string" },
          extractedData: { type: "object", properties: { /* fields */ } }
        }
      }
    }
  }
});
```

## Why

Framework author said: "no, don't do a combined schema (unless you use the generateObject pass to also figure which schema you want -- that might work, add a 'explain why this type' and maybe a score field, then render a list sorted by score with the explanation for the user)"

Benefits:
- User sees WHY each type was identified
- Types sorted by confidence
- Low-confidence extractions can be hidden
- Better aligned with "data-up" philosophy

## Note

You can pass schema as parameter to generateObject dynamically - "you just won't get the nice TS type checking anymore for the extracted set" (framework author).

## Metadata

```yaml
topic: llm, generateObject, extraction, schema
observed_date: 2025-12-18
source: Framework author (seefeldb) PR #182 comments
```
