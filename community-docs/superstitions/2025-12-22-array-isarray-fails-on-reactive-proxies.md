# SUPERSTITION: Array.isArray() Fails on Reactive Proxies

**WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

JavaScript Array.isArray() check fails on reactive proxy-wrapped arrays

## Problem

When checking if a property is an array using `Array.isArray()`, it returns `false` for arrays accessed through reactive proxies, even when the underlying value IS an array.

### What Didn't Work

```typescript
function isRecord(charm: unknown): boolean {
  const subCharms = (charm as any)?.subCharms;
  // This returns false even when subCharms IS an array!
  return Array.isArray(subCharms);
}
```

**Symptom:** Array type guards fail silently. Code paths expecting arrays never execute. Filter functions return empty results.

## Solution That Seemed to Work

Check for array-like properties instead of using `Array.isArray()`:

```typescript
function isRecord(charm: unknown): boolean {
  const subCharms = (charm as any)?.subCharms;
  // Check for array-like behavior instead
  return subCharms !== undefined &&
         subCharms !== null &&
         typeof subCharms.length === "number";
}

// Alternative: use optional chaining with array methods
const types = charm.subCharms?.map?.(sc => sc.type) ?? [];
```

**Result:** Array detection works correctly on reactive proxies.

## Context

- **Pattern:** members.tsx (isRecord helper function)
- **Use case:** Determining if a charm is a Record by checking for subCharms array
- **Framework:** CommonTools reactive proxy system
- **Verified:** Via debug logging - Array.isArray returned false, length check returned true

## Theory / Hypothesis

This is **expected JavaScript behavior**, not a framework bug. According to the ECMAScript specification:

1. `Array.isArray()` checks the internal `[[Class]]` slot of an object
2. When you wrap an array in a Proxy, the proxy's `[[Class]]` is "Proxy", not "Array"
3. Proxies do NOT forward internal slots - this is by design in JavaScript

**Verified with Node.js:**
```javascript
const arr = [1,2,3];
const proxy = new Proxy(arr, {});
console.log(Array.isArray(arr));    // true
console.log(Array.isArray(proxy));  // true (!)
```

Wait - basic proxies DO pass `Array.isArray()`! The CommonTools reactive proxy may have additional complexity that breaks this. Need further investigation.

**Alternative hypothesis:** The proxy target might not be the array itself, but an object containing the array, causing the check to fail.

## Related Official Docs

- `/packages/runner/src/query-result-proxy.ts` - Reactive proxy implementation
- `/packages/runner/src/cell.ts` - Cell implementation with proxy creation

## Metadata

```yaml
topic: reactive-proxies
discovered: 2025-12-22
confirmed_count: 1
last_confirmed: 2025-12-22
sessions: [members-autocomplete-fix]
related_labs_docs: packages/runner/src/query-result-proxy.ts
status: superstition
stars:
```

## Guestbook

- 2025-12-22 - isRecord() check failed because Array.isArray(subCharms) returned false on reactive proxy, fixed by checking typeof length === "number" instead (members-autocomplete-fix)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
