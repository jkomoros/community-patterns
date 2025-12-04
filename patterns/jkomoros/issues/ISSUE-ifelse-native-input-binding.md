# Bug: Native `<input value={cell}>` binding fails inside ifElse branches

## Summary

Native HTML `<input>` elements with `value={cell}` binding do not update the cell when inside an `ifElse()` conditional. The `<ct-input $value={cell}>` component works correctly in the same context.

## Minimal Repro

```tsx
/// <cts-enable />
import { Cell, Default, handler, ifElse, NAME, pattern, UI } from "commontools";

interface Input {
  show: Default<boolean, true>;
  nativeValue: Default<string, "">;
  ctValue: Default<string, "">;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ show, nativeValue, ctValue }) => {
    const submit = handler<unknown, { native: Cell<string>; ct: Cell<string> }>(
      (_, { native, ct }) => {
        console.log("Native:", native.get()); // Always ""
        console.log("ct-input:", ct.get());   // Correct value
      }
    );

    return {
      [NAME]: "ifElse Native Input Bug",
      [UI]: (
        <div>
          {ifElse(
            show,
            <div>
              {/* ❌ FAILS: Cell stays empty regardless of typing */}
              <input type="text" value={nativeValue} placeholder="Native input" />

              {/* ✅ WORKS: Cell updates correctly */}
              <ct-input $value={ctValue} placeholder="ct-input" />

              <button onClick={submit({ native: nativeValue, ct: ctValue })}>
                Submit
              </button>
            </div>,
            null
          )}
        </div>
      ),
    };
  }
);
```

## Steps to Reproduce

1. Deploy the pattern above
2. Type "hello" in the native `<input>`
3. Type "hello" in the `<ct-input>`
4. Click Submit
5. Check console output

## Expected Behavior

Both inputs should update their bound cells:
```
Native: "hello"
ct-input: "hello"
```

## Actual Behavior

Native input cell stays empty:
```
Native: ""
ct-input: "hello"
```

## Test Results

| Input Type | Typed | `cell.get()` | Result |
|------------|-------|--------------|--------|
| `<input value={cell}>` | "hello" | `""` | ❌ FAIL |
| `<ct-input $value={cell}>` | "hello" | `"hello"` | ✅ PASS |

## Notes

- Same inputs work correctly when NOT inside `ifElse()`
- The native input visually accepts typing, but the cell is never updated
- Framework author confirmed: "that's a bug, and a very strange one"

## Workaround

Use `<ct-input $value={cell}>` instead of native `<input value={cell}>` inside ifElse branches.

## Full Repro Pattern

See: `community-docs/superstitions/repros/2025-12-03-ifelse-binding-native-input-test.tsx`
