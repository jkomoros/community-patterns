# Cell Values Must Be JSON-Serializable

## Observation

When using `cell<T>()` to store state, the value type `T` must be JSON-serializable. The framework persists cell values by converting them to/from a JSON-like format.

**Works:**
- Primitives: `string`, `number`, `boolean`, `null`
- Arrays: `string[]`, `number[]`, `any[]`
- Plain objects: `{ key: value }`
- Nested combinations of the above

**Doesn't work:**
- `Set<T>` - serializes to `{}` (empty object), loses all data
- `Map<K,V>` - serializes to `{}` (empty object), loses all data
- `Date` - serializes to string, loses Date methods
- Class instances - loses prototype/methods
- Functions - can't be serialized

## Example: Set vs Array for Tracking State

```typescript
// FAILS: Set doesn't survive serialization
const readUrls = cell<Set<string>>(new Set());
// Later: readUrls.get().has(url) → TypeError: has is not a function
// The Set was serialized to {} and lost its methods

// WORKS: Use array instead
const readUrls = cell<string[]>([]);
// Later: readUrls.get().includes(url) → works correctly
```

## Workaround Patterns

### For Set-like behavior:
```typescript
// Store as array, use array methods
const readUrls = cell<string[]>([]);

// Check membership
const isRead = readUrls.get().includes(normalizedUrl);

// Add item
readUrls.set([...readUrls.get(), normalizedUrl]);

// Remove item
readUrls.set(readUrls.get().filter(u => u !== normalizedUrl));
```

### For Map-like behavior:
```typescript
// Store as plain object or array of tuples
const cache = cell<Record<string, CachedValue>>({});

// Or as array of entries
const cache = cell<Array<{ key: string; value: CachedValue }>>([]);
```

## Mental Model

Think of cells as being persisted to JSON:
- `JSON.stringify(new Set([1,2,3]))` → `"{}"` (data lost!)
- `JSON.stringify([1,2,3])` → `"[1,2,3]"` (preserved)

If your value wouldn't survive a `JSON.parse(JSON.stringify(value))` round-trip, it won't work in a cell.

## Also Applies to: Helper Functions in Actions

This serialization constraint also affects **functions returned from helper utilities** when used in JSX/actions.

### Example: protectedContent from createGoogleAuth

```typescript
// FAILS: Helper function doesn't survive serialization
const { protectedContent, isReady } = createGoogleAuth({...});

// In JSX:
{protectedContent(<button onClick={doAction}>Do Something</button>)}
// TypeError: protectedContent is not a function

// WORKS: Use framework primitive ifElse instead
{ifElse(isReady, <button onClick={doAction}>Do Something</button>, null)}
```

**Why this happens:** The `protectedContent` function is essentially `(children) => ifElse(isReady, children, null)`. When passed through the action system, it gets serialized and becomes `undefined` or a plain object, losing its callable nature.

**Workaround:** Always use framework primitives (`ifElse`, `computed`, etc.) directly instead of wrapper functions from helpers. The underlying cell/signal (`isReady`) survives serialization, but the wrapper function doesn't.

## Tags

- cells
- serialization
- state
- Set
- Map
- JSON
- functions
- actions
- protectedContent

## Confirmation Status

- **First observed**: 2025-11-29
- **Confirmed by**: Runtime errors when using Set in cell ("has is not a function")
- **Needs**: Framework author confirmation on serialization mechanism

## Guestbook

- 2025-11-29 - First observed with Set in cell (original author)
- 2025-11-30 - Confirmed with Map in redactor pattern session state; got "TypeError: object is not iterable" when trying to iterate Map entries (jkomoros)
- 2025-12-18 - Confirmed with `protectedContent` helper function from `createGoogleAuth`; got "TypeError: protectedContent is not a function" when using the helper in JSX. Workaround: use `ifElse(isReady, ...)` directly (jkomoros)
