# Record `.key().set()` May Fail in Handlers - Use Spread Workaround

**Status:** superstition (needs more investigation)
**Added:** 2025-12-08
**Observed in:** assumption-surfacer.tsx refactor
**Context:** Handler updating Record<string, T> with new keys

## Summary

When using `.key(key).set(value)` on a `Record<string, T>` in a handler context, you may get framework errors even when the Record has a default value of `{}`. The workaround is to use spread syntax instead.

## Error Observed

```
Error: Value at path value/argument/corrections/0-Technical_Expertise is not an object
```

The key `0-Technical_Expertise` was being interpreted as a path segment by the framework.

## What Didn't Work

```typescript
// Handler trying to set a new key on Record<string, Correction>
const key = `${messageIndex}-${assumptionLabel.replace(/\s+/g, '_')}`;
corrections.key(key).set({
  messageIndex,
  assumptionLabel,
  originalIndex,
  correctedIndex: newIndex
});
```

Type definition:
```typescript
corrections?: Cell<Default<Record<string, Correction>, {}>>;
```

## Workaround That Works

```typescript
// Use spread instead of .key().set()
const key = `${messageIndex}-${assumptionLabel.replace(/\s+/g, '_')}`;
const current = corrections.get() ?? {};
corrections.set({
  ...current,
  [key]: { messageIndex, assumptionLabel, originalIndex, correctedIndex: newIndex }
});
```

## Why This Is Confusing

1. **The blessed docs say to use `.key(k).set(v)`** for individual key updates
2. **The default is `{}`** so the Record should be initialized
3. **cheeseboard-schedule.tsx uses `.key().set()` successfully** in both handlers and computed

### Differences from cheeseboard-schedule.tsx

In cheeseboard:
- Handler `.key().set()` operates on **keys that already exist** (updates existing pizza entries)
- Computed `.key().set()` creates new keys but the Record typically already has other entries

In assumption-surfacer:
- Handler `.key().set()` tries to create **new keys** on an initially **empty** Record

## Additional Observation

`.key(key).get()` works fine on the same Record - it's only `.key(key).set()` for **creating new keys** that fails:

```typescript
// This works - reading from a key
const existing = corrections.key(key).get();

// This fails - creating a new key
corrections.key(key).set({ ... });
```

## Possible Root Causes (Needs Investigation)

1. **Creating vs updating**: `.key().set()` for NEW keys may differ from updating existing keys
2. **Key format issues**: The hyphen `-` in keys like `0-Technical_Expertise` may be interpreted as path separators
3. **Empty Record edge case**: `.key().set()` may not work on completely empty Records
4. **Handler vs computed context**: Different execution context may affect key tracking

## Open Question About Defaults

The type uses `Default<Record<string, Correction>, {}>`:
```typescript
corrections?: Cell<Default<Record<string, Correction>, {}>>;
```

**Why would `.key().set()` fail when the default is `{}`?**

The default should ensure the Record is initialized to `{}`, so creating new keys via `.key().set()` should theoretically work. This might indicate:
- A timing issue where default hasn't been applied
- A bug in how handlers access cells with defaults
- Something specific about how `Default<>` interacts with `.key()` path resolution

## Notes for Further Investigation

- Try with simpler keys (just numeric, no special characters)
- Test if the issue occurs in computed context too
- Check if initializing with a dummy key first helps
- This may be a framework bug worth reporting

## Related Docs

- `community-docs/blessed/reactivity.md` - Documents idempotent patterns with `.key().set()`
- `patterns/jkomoros/cheeseboard-schedule.tsx` - Working example of `.key().set()` in handlers

## Confidence

Low - this could be:
- A real framework limitation with empty Records
- A key format issue with special characters
- Something specific to the assumption-surfacer pattern
- A framework bug

The spread workaround is safe but less efficient for large Records.
