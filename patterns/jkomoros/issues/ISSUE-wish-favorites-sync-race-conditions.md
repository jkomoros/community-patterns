# Race Conditions in Favorites System Cause wish() to Fail

**Status**: Open
**Severity**: High
**Affects**: All patterns using `wish({ query: "#tag" })` for charm discovery
**Related**: ISSUE-favorites-not-persisting-across-navigation.md

---

## Executive Summary

Two race conditions in the sync system cause `wish({ query: "#googleAuth" })` to return "No favorite found" even when charms are correctly favorited:

1. **Bug #1**: `get()` in `cell.ts` calls `sync()` without awaiting it - returns stale/empty data
2. **Bug #2**: `addFavorite()` syncs favorites list but NOT the charm being favorited - stores empty tag

These bugs cause intermittent failures in charm discovery via `wish()`, breaking patterns like `gmail-importer`, `calendar-event-manager`, and any pattern that relies on `wish({ query: "#googleAuth" })`.

---

## BUG #1: get() Doesn't Await sync()

### Location
**File**: `packages/runner/src/cell.ts`
**Lines**: 531-534

### The Problematic Code

```typescript
get(): Readonly<T> {
  if (!this.synced) this.sync(); // ← NO AWAIT! Fire-and-forget
  return validateAndTransform(this.runtime, this.tx, this.link, this.synced);
}
```

### The sync() Method (lines 932-938)

```typescript
sync(): Promise<Cell<T>> | Cell<T> {
  this.synced = true;  // ← SET IMMEDIATELY before async completes!
  if (this.link.id.startsWith("data:")) {
    return this as unknown as Cell<T>;
  }
  return this.runtime.storageManager.syncCell<T>(this as unknown as Cell<T>);
}
```

**Critical bug**: `this.synced = true` is set IMMEDIATELY at line 933, before the actual async sync operation completes.

### The syncCell() Implementation (storage/cache.ts lines 2175-2193)

```typescript
async syncCell<T>(cell: Cell<T>): Promise<Cell<T>> {
  const { space, id, schema, rootSchema } = cell.getAsNormalizedFullLink();
  if (!space) throw new Error("No space set");
  const storageProvider = this.open(space);

  const schemaContext = schema === undefined
    ? { schema: false, rootSchema: false }
    : { schema, rootSchema: rootSchema ?? schema };

  const selector = schemaContext === undefined ? undefined : {
    path: cell.path.map((p) => p.toString()),
    schemaContext,
  };

  await storageProvider.sync(id, selector);  // ← ACTUAL ASYNC OPERATION
  return cell;
}
```

### Race Condition Timeline

```
T0: get() called
    ├─ Check: if (!this.synced) → TRUE
    └─ Call: this.sync() WITHOUT await
        │
        ├─ SYNC METHOD (T0):
        │  └─ this.synced = true  ← FLAG SET IMMEDIATELY
        │
        ├─ RETURNS PROMISE (not awaited)
        │  └─ return storageManager.syncCell(...)
        │
        └─ BACKGROUND ASYNC STARTS:
           └─ [Promise] await storageProvider.sync()
              [Takes MILLISECONDS to SECONDS]

T0+0μs: get() CONTINUES IMMEDIATELY
    └─ return validateAndTransform(..., this.synced=true)
       └─ Caller receives STALE/UNDEFINED DATA

T0+Xms: Eventually storageProvider.sync() completes
        └─ Too late - caller already has wrong data
```

### 11 Methods with Same Bug Pattern

| Line | Method | Code |
|------|--------|------|
| 532 | `get()` | `if (!this.synced) this.sync();` |
| 545 | `sample()` | `if (!this.synced) this.sync();` |
| 595 | `set()` | `if (!this.synced) this.sync();` |
| 635 | `update()` | `if (!this.synced) this.sync();` |
| 683 | `push()` | `if (!this.synced) this.sync();` |
| 927 | `sink()` | `if (!this.synced) this.sync();` |
| 953 | `getAsQueryResult()` | `if (!this.synced) this.sync();` |
| 996 | `getRaw()` | `if (!this.synced) this.sync();` |
| 1013 | `setRaw()` | `if (!this.synced) this.sync();` |
| 1048 | `getSourceCell()` | `if (!this.synced) this.sync();` |
| 1078 | `setSourceCell()` | `if (!this.synced) this.sync();` |

### Impact in wish.ts (line 241)

```typescript
const favoritesCell = homeSpaceCell.key("favorites").asSchema(favoriteListSchema);
const favorites = favoritesCell.get() || [];  // ← Gets [] because sync incomplete
```

**Result**: Empty array → no matches → "No favorite found matching #googleauth"

---

## BUG #2: addFavorite() Doesn't Sync Charm

### Location
**File**: `packages/charm/src/favorites.ts`
**Lines**: 47-72

### The Problematic Code

```typescript
export async function addFavorite(
  runtime: Runtime,
  charm: Cell<unknown>,
): Promise<void> {
  const favorites = getHomeFavorites(runtime);
  await favorites.sync();  // ← LINE 52: Only syncs FAVORITES list

  const resolvedCharm = charm.resolveAsCell();

  await runtime.editWithRetry((tx) => {
    const favoritesWithTx = favorites.withTx(tx);
    const current = favoritesWithTx.get() || [];

    if (current.some((entry) => entry.cell.resolveAsCell().equals(resolvedCharm)))
      return;

    const tag = getCellDescription(charm);  // ← LINE 66: charm NOT synced!
    favoritesWithTx.push({ cell: charm, tag });
  });

  await runtime.idle();
}
```

**Critical bug**: Line 52 syncs only the favorites list. The `charm` parameter is never synced before `getCellDescription()` is called at line 66.

### getCellDescription() Function (lines 9-19)

```typescript
function getCellDescription(cell: Cell<unknown>): string {
  try {
    const { schema } = cell.asSchemaFromLinks().getAsNormalizedFullLink();
    if (schema !== undefined) {
      return JSON.stringify(schema);
    }
  } catch (e) {
    console.error("Failed to get cell schema for favorite tag:", e);
  }
  return "";  // ← Returns empty string when schema undefined!
}
```

### Schema Resolution Chain (Why It Fails)

**asSchemaFromLinks() - cell.ts lines 863-897**:
```typescript
asSchemaFromLinks<T = unknown>(): Cell<T> {
  let { schema, rootSchema } = resolveLink(
    this.runtime,
    this.runtime.readTx(this.tx),
    this.link,  // ← Needs synced link metadata
  );

  if (!schema) {
    const sourceCell = this.getSourceCell<{ resultRef: Cell<unknown> }>({...});
    const sourceCellSchema = sourceCell?.key("resultRef").get()?.schema;
    // ← Also fails if source cell unsynced
  }
  // ...
}
```

**resolveLink() - link-resolution.ts**: Requires cell to be synced so Sigil link metadata can be read from storage. Without sync, returns `{ schema: undefined }`.

### Star Button Call Chain

**FavoriteButton.ts (lines 34-56)**:
```typescript
private async handleFavoriteClick(e: Event) {
  // ...
  const charmCell = (await this.rt.cc().get(this.charmId, true)).getCell();
  //                 ↑ Gets charm - may or may not be synced

  await manager.addFavorite(charmCell);  // ← LINE 51
}
```

**CharmManager.addFavorite() (manager.ts lines 1134-1136)**:
```typescript
addFavorite(charm: Cell<unknown>): Promise<void> {
  return favorites.addFavorite(this.runtime, charm);
}
```

### Race Condition Flow

```
User clicks ⭐ star button
    ↓
FavoriteButton: handleFavoriteClick()
    ↓
charmCell = await rt.cc().get(charmId, true).getCell()
    ↓ (charm may not have schema metadata loaded)
manager.addFavorite(charmCell)
    ↓
await favorites.sync()  ← Only syncs favorites LIST
    ↓
getCellDescription(charm)
    ├─ charm.asSchemaFromLinks()
    │   └─ resolveLink() → No Sigil metadata (not synced)
    │   └─ Returns { schema: undefined }
    ├─ Returns ""
    └─ Tag stored as EMPTY STRING
    ↓
Later: wish({ query: "#googleAuth" })
    ↓
favorites.filter(...) finds no hashtags in empty tags
    ↓
"No favorite found matching #googleauth"
```

---

## Reproduction Steps

### Test 1: Basic Favorite Persistence Failure

1. Deploy a pattern: `deno task ct charm new patterns/examples/counter.tsx --space test`
2. Navigate to the charm URL
3. Verify star is empty (☆)
4. Click star button → star fills (⭐)
5. Navigate to space root
6. Navigate back to same charm
7. **Expected**: Star still filled (⭐)
8. **Actual**: Star is empty (☆) - favorite lost

### Test 2: wish() Discovery Failure

1. Deploy `google-auth.tsx` pattern
2. Immediately click star ⭐
3. Deploy pattern using `wish({ query: "#googleAuth" })`
4. **Expected**: Finds the favorited Google Auth
5. **Actual**: Error "No favorite found matching #googleauth"
6. Wait 30 seconds and refresh → works (sync completed)

### Test 3: Verify Empty Tag

1. Star a charm
2. Use debug pattern to inspect favorites list
3. Check the `tag` field for the favorited entry
4. **Expected**: JSON schema with description containing hashtag
5. **Actual**: Empty string `""`

---

## Root Cause Bisect

From existing issue file: ISSUE-favorites-not-persisting-across-navigation.md

| Commit | Description | Works? |
|--------|-------------|--------|
| d3d708b73 | Allow wish to read favorites | ✅ |
| b7f349f99 | Shell view refactor | ✅ |
| 62e03294a | Rename tag to query | ✅ |
| **a83109850** | **Add home space to shell (#2170)** | ❌ |

Root cause commit changed home space initialization/cell access.

---

## Proposed Fixes

### Fix #1: Sync charm before getCellDescription (favorites.ts)

```typescript
export async function addFavorite(
  runtime: Runtime,
  charm: Cell<unknown>,
): Promise<void> {
  const favorites = getHomeFavorites(runtime);
  await favorites.sync();

  // ADD THIS LINE:
  await charm.sync();  // Ensure charm has schema metadata

  const resolvedCharm = charm.resolveAsCell();
  // ... rest unchanged
}
```

### Fix #2: Add syncAndGet() helper or await sync in get() (cell.ts)

**Option A** - Add helper method (non-breaking):
```typescript
async syncAndGet(): Promise<Readonly<T>> {
  await this.sync();
  return this.get();
}
```

**Option B** - Make sync blocking in get() (breaking change):
```typescript
get(): Readonly<T> {
  // This would require making get() async - major breaking change
}
```

### Fix #3: Sync favorites before reading in wish.ts

```typescript
const favoritesCell = homeSpaceCell.key("favorites").asSchema(favoriteListSchema);
await favoritesCell.sync();  // ADD THIS
const favorites = favoritesCell.get() || [];
```

---

## Files Requiring Changes

| File | Line(s) | Change |
|------|---------|--------|
| `packages/charm/src/favorites.ts` | 52 | Add `await charm.sync()` before `getCellDescription()` |
| `packages/runner/src/builtins/wish.ts` | 241 | Add `await favoritesCell.sync()` before `.get()` |
| `packages/runner/src/cell.ts` | 531-534+ | Consider `syncAndGet()` helper for all 11 affected methods |

---

## Test Coverage Gap

From `wish.test.ts` (lines 872-1090): 6 comprehensive tests exist but they work because:
- Explicit `await tx.commit()` between setup and execution
- Explicit `await runtime.idle()` to ensure storage sync
- New transaction created before running pattern

**No tests for the race condition** - tests pass due to careful transaction boundaries that real user flows don't have.

### Suggested Test Addition

```typescript
test("handles race condition when charm not synced before favoriting", async () => {
  // Deploy charm
  // Immediately favorite (without viewing first)
  // Immediately call wish({ query: "#tag" })
  // Should find the charm OR gracefully retry
});
```

---

## Related Issues

- `ISSUE-favorites-not-persisting-across-navigation.md` - Documents persistence failure
- Bisect identifies commit a83109850 as root cause
- `wish({ query: "#favorites" })` object syntax compiles to `{}` (separate bug - see TODO in wish.ts line 457)

---

## Workarounds (Until Fixed)

1. **View charm before starring**: Ensure the charm has been loaded/viewed before clicking star
2. **Wait after starring**: Give a few seconds for sync to complete before navigating away
3. **Refresh after starring**: Force a page refresh to ensure sync completes
4. **Use explicit cell links**: Instead of `wish()`, pass cells directly via inputs

None of these are acceptable long-term solutions.
