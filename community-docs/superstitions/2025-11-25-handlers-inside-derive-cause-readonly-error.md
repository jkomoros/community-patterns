# Handlers Inside derive() Cause ReadOnlyAddressError

## Summary

When button click handlers are placed inside a `derive()` block, calling `.set()` on Cells from those handlers causes `ReadOnlyAddressError`. Move buttons and their handlers OUTSIDE derive blocks.

## The Problem

```typescript
// BROKEN: Button inside derive() - handler can't write to Cells
{derive({ result }, ({ result }) => {
  if (!result) return null;

  return (
    <>
      <div>Result: {result.value}</div>
      {/* This button's handler will fail with ReadOnlyAddressError! */}
      <ct-button onClick={clearForm({ promptCell })}>
        Clear
      </ct-button>
    </>
  );
})}
```

**Error:**
```
ReadOnlyAddressError: Cannot write to read-only address
```

## Why This Happens

1. `derive()` creates a reactive computation context
2. Inside this context, Cells are wrapped as read-only proxies
3. When a handler is called from inside derive, it inherits this read-only context
4. Any `.set()` call fails because the Cell reference is a read-only proxy

## The Solution

Move buttons OUTSIDE the derive block. If buttons need data from derive, extract display-only content inside derive and place action buttons outside:

```typescript
// WORKS: Buttons OUTSIDE derive()
{/* Display content inside derive */}
{derive({ result }, ({ result }) => {
  if (!result) return <div>No result yet</div>;
  return (
    <div>
      <strong>Result:</strong> {result.value}
    </div>
  );
})}

{/* Action buttons OUTSIDE derive - handlers can write to Cells */}
<ct-hstack>
  <ct-button onClick={acceptResult({ resultCell, promptCell })}>
    Accept
  </ct-button>
  <ct-button onClick={clearForm({ promptCell })}>
    Clear
  </ct-button>
</ct-hstack>
```

## Handler Pattern for Reading derive Results

If your handler needs to read data that was computed in derive, pass the Cell containing the result:

```typescript
// Handler reads from result Cell, then clears prompts
const acceptResult = handler<
  unknown,
  {
    resultCell: Cell<MyResult | undefined>,
    promptCell: Cell<string>,
  }
>(
  (_, { resultCell, promptCell }) => {
    const result = resultCell.get();  // Read the result
    if (!result) return;

    // Do something with result...
    console.log("Accepted:", result.value);

    // Clear the form (this works because we're OUTSIDE derive context)
    promptCell.set("");
  }
);
```

## Complete Example

```typescript
interface MyInput {
  prompt: Default<string, "">;
  submittedPrompt: Default<string, "">;
}

// LLM extraction that produces a result
const extraction = generateObject({
  model: "anthropic:claude-haiku-4-5",
  prompt: submittedPrompt,
  schema: toSchema<MyResult>(),
});

// Handler to accept result (called from OUTSIDE derive)
const acceptResult = handler<
  unknown,
  {
    resultCell: Cell<MyResult | undefined>,
    promptCell: Cell<string>,
    submittedCell: Cell<string>,
  }
>((_, { resultCell, promptCell, submittedCell }) => {
  const result = resultCell.get();
  if (!result) return;

  // Process result...
  doSomethingWith(result);

  // Clear form (works because outside derive)
  promptCell.set("");
  submittedCell.set("");
});

// In JSX:
return (
  <>
    <ct-input $value={prompt} />
    <ct-button onClick={submit({ promptCell: prompt, submittedCell: submittedPrompt })}>
      Analyze
    </ct-button>

    {/* Display-only content inside derive */}
    {derive(extraction, (ext) => {
      if (ext.pending) return <div>Loading...</div>;
      if (!ext.result) return <div>No result</div>;
      return (
        <div>
          <strong>Result:</strong> {ext.result.value}
        </div>
      );
    })}

    {/* Action buttons OUTSIDE derive */}
    <ct-hstack>
      <ct-button onClick={acceptResult({
        resultCell: extraction.result,
        promptCell: prompt,
        submittedCell: submittedPrompt,
      })}>
        Accept
      </ct-button>
      <ct-button onClick={clearForm({
        promptCell: prompt,
        submittedCell: submittedPrompt,
      })}>
        Clear
      </ct-button>
    </ct-hstack>
  </>
);
```

## Key Points

1. **derive() makes Cells read-only** - any handler called from inside derive context cannot write
2. **Separate display from actions** - put display logic in derive, buttons outside
3. **Pass result Cells to handlers** - handlers can read from Cells even if they can't be inside derive
4. **This is different from .map() issue** - map preserves Cell references, derive makes them read-only

## Related Superstitions

- `handler-parameters-apply-to-all-reactive-contexts.md` - General handler parameter pattern
- `framework-auto-boxes-array-items-use-equals-instance-method.md` - Cell comparison in handlers

## Metadata

```yaml
topic: derive, handlers, ReadOnlyAddressError, buttons, reactive-context
discovered: 2025-11-25
confirmed_count: 1
last_confirmed: 2025-11-25
sessions: [smart-rubric-phase-5]
related_functions: derive, handler, generateObject
stars: 3
```
