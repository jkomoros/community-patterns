# derive() on Writable State Infers Cell<T> — Unwrap Once, Chain from There

**Date:** 2026-01-28
**Status:** superstition
**Confidence:** high
**Stars:** 4

---

> **This is a SUPERSTITION** — based on observations during a single session
> building the email-style-extractor pattern. It has been confirmed by three
> separate runtime bugs in the same session but has not been verified by a
> framework author.

## TL;DR — The Rule

**When you `derive()` from a `Writable<T>`, TypeScript infers the callback
parameter as `Cell<T>`, not `T`. At runtime, coercing this value with
`String()` or template literals produces `"[object Object]"`, and
`new Date()` produces `Invalid Date`.**

The fix: unwrap each Writable once via a typed `derive`, then chain all
subsequent derives from the unwrapped value.

```tsx
// BROKEN — derive on Writable, callback param is Cell<string>
const timestamp = Writable.of("").for("timestamp");

// In UI:
{derive(timestamp, (ts) =>
  ts ? `Last: ${new Date(ts).toLocaleString()}` : ""
)}
// Renders: "Last: Invalid Date"
// Because: ts is Cell<string>, String(Cell) = "[object Object]"

// CORRECT — unwrap once with explicit type, chain from there
const unwrappedTimestamp = derive(timestamp, (ts: string) => ts);

{derive(unwrappedTimestamp, (ts) =>
  ts ? `Last: ${new Date(ts).toLocaleString()}` : ""
)}
// Renders: "Last: 1/28/2026, 12:10:15 PM"
```

**Symptoms:**
- `[object Object]` in UI where you expect a number or string
- `Invalid Date` when parsing dates from Writable state
- TypeScript errors: `Property 'foo' does not exist on type 'Cell<MyType>'`

## Summary

`Writable.of<T>(initial).for(key)` creates persistent reactive state. When
passed directly to `derive()`, TypeScript infers the callback parameter as
`Cell<T>` rather than the unwrapped `T`. This is a type-level issue — the
runtime may or may not auto-unwrap (see repro
`2025-12-03-derive-types-vs-runtime-test.tsx` for related investigation), but
the practical effect is that `String()`, template literals, and `new Date()`
all fail silently, producing `[object Object]` or `Invalid Date` instead of
the expected value.

## Why This Happens

1. `Writable<T>` extends `Cell<T>` in the type system
2. `derive(source, fn)` infers `fn`'s parameter type from `source`
3. For `Writable<T>`, this inference yields `Cell<T>`, not `T`
4. `Cell<T>` is an opaque proxy object
5. `String(proxy)` → `"[object Object]"`, `${proxy}` → `"[object Object]"`
6. `new Date("[object Object]")` → `Invalid Date`
7. `Number(proxy)` → `NaN`

The type system and runtime disagree on unwrapping behavior for Writable
sources (as opposed to Input props with `Default<>`, which work differently).

## When This Occurs

- **Multiple UI derives from the same Writable**: You create a `Writable` for
  state (e.g. a timestamp, a count, a complex object), then derive from it
  in multiple places in the UI. Each `derive()` call hits the type mismatch.

- **Complex object Writables in UI**: `Writable<MyInterface | null>` where
  you need to access properties like `s?.summary`, `s?.greetingPatterns`, etc.

- **Numeric Writables displayed in templates**: `Writable<number>` where
  `${count}` in a template literal gives `[object Object]`.

## The Fix: Unwrap Once, Chain from There

Unwrap each Writable exactly once at the top of your reactive chain. Use an
explicit type annotation on the callback parameter to bridge the type gap.
Then all downstream `derive()` calls work without annotations.

```tsx
// STATE
const savedStyle = Writable.of<EmailStyle | null>(null).for("savedStyle");
const emailsAnalyzedCount = Writable.of(0).for("emailsAnalyzedCount");
const lastAnalyzedAt = Writable.of("").for("lastAnalyzedAt");

// UNWRAP ONCE — explicit type annotation bridges the Cell<T>/T gap
const style = derive(savedStyle, (s: EmailStyle | null) => s);
const hasStyle = derive(style, (s) => !!s);  // no annotation needed
const analyzedCount = derive(emailsAnalyzedCount, (c: number) => c);
const analyzedAt = derive(lastAnalyzedAt, (ts: string) => ts);

// CHAIN — all downstream derives infer clean types
{derive(style, (s) => s?.summary || "")}           // works
{derive(style, (s) => s?.greetingPatterns || [])}   // works
{derive(analyzedCount, (c) => `${c} emails`)}       // works: "24 emails"
{derive(analyzedAt, (ts) =>                          // works: valid date
  ts ? `Last: ${new Date(ts).toLocaleString()}` : ""
)}
```

## Real-World Example

**Pattern:** `email-style-extractor.tsx` (packages/patterns/google/extractors/)

### Before (Broken)

```tsx
const savedStyle = Writable.of<EmailStyle | null>(null).for("savedStyle");
const emailsAnalyzedCount = Writable.of(0).for("emailsAnalyzedCount");
const lastAnalyzedAt = Writable.of("").for("lastAnalyzedAt");

// In UI — every derive needed explicit types AND still broke at runtime
{derive(savedStyle, (s: EmailStyle | null) => s?.summary || "")}
{derive(emailsAnalyzedCount, (c) => `${c} emails analyzed`)}
// Rendered: "[object Object] emails analyzed"

{derive(lastAnalyzedAt, (ts) => ts ? `Last: ${new Date(String(ts)).toLocaleString()}` : "")}
// Rendered: "Last: Invalid Date"
```

### After (Fixed)

```tsx
// Unwrap once
const style = derive(savedStyle, (s: EmailStyle | null) => s);
const analyzedCount = derive(emailsAnalyzedCount, (c: number) => c);
const analyzedAt = derive(lastAnalyzedAt, (ts: string) => ts);

// Chain — clean types, correct rendering
{derive(style, (s) => s?.summary || "")}
{derive(analyzedCount, (c) => `${c} emails analyzed`)}
// Rendered: "24 emails analyzed"

{derive(analyzedAt, (ts) => ts ? `Last: ${new Date(ts).toLocaleString()}` : "")}
// Rendered: "Last: 1/28/2026, 12:10:15 PM"
```

## Key Rules

1. **Never derive directly from a Writable in UI** — unwrap it once first
2. **The unwrap derive needs one explicit type annotation** on the callback param
3. **All downstream derives from the unwrapped value work without annotations**
4. **This is NOT the same as Input props** — `Default<T, val>` inputs behave
   differently in derive (see existing repro)
5. **`String(cell)` = `"[object Object]"`** — this is the telltale symptom
6. **The pattern is: `derive(writable, (v: T) => v)`** — identity function
   with explicit type

## Differentiating from Related Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| **This superstition** | `[object Object]` / `Invalid Date` from Writable derive | Unwrap once with typed derive |
| Property access in map (2026-01-28) | `opaque value` error in `.map()` | Wrap in `computed()` |
| JSX inside computed (2026-01-19) | Reactivity breaks | Use `derive()` for JSX transforms |
| LLM results to Writables (2026-01-28) | Results not persisted | Side-effect in `computed()` |

## Related

- Repro: `community-docs/superstitions/repros/2025-12-03-derive-types-vs-runtime-test.tsx`
  — tests derive auto-unwrap on Input props (different from Writable state)
- `docs/common/concepts/reactivity.md` — Cell system documentation
- `2026-01-28-llm-results-need-manual-sync-to-writables.md` — related pattern
  for persisting LLM results

---

```yaml
topic: reactivity, derive, writable, types
discovered: 2026-01-28
confirmed_count: 3
last_confirmed: 2026-01-28
sessions: [email-style-extractor-dev]
related_functions: derive, Writable.of, Writable.for
pattern: packages/patterns/google/extractors/email-style-extractor.tsx
status: superstition
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 — Email Style Extractor pattern. Three separate bugs from same
  root cause: `[object Object] emails analyzed` (Writable<number> in template),
  `Invalid Date` (Writable<string> passed to new Date()), and TypeScript errors
  on `s?.summary` (Writable<EmailStyle|null> property access). All fixed by
  unwrapping each Writable once via `derive(writable, (v: T) => v)` and
  chaining all UI derives from the unwrapped value. (email-style-extractor-dev)

---

**Remember:** `derive()` on a `Writable<T>` gives `Cell<T>` in the callback — unwrap once with an explicit type, then chain everything from the unwrapped value.
