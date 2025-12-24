---
topic: cells, reactive-proxies, arrays
discovered: 2025-12-24
sessions: members-module-bidirectional-linking
related_labs_docs: ~/Code/labs/packages/runner/src/query-result-proxy.ts
status: verified
verified: 2025-12-24
verdict: CORRECT - spread operator on reactive proxy arrays produces null values
---

# Reactive Proxy Array Spread Operator Produces Null Values

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this is verified correct,** upstream it to labs docs and delete this superstition.

---

## Problem

When you spread a reactive proxy array (from `.get()` or property access on OpaqueRefs), the resulting array contains `null` values instead of the actual elements.

```typescript
// BAD: Spread produces nulls!
const proxyArray = someCell.get() || [];
const items = [...proxyArray];  // [null, null, null, ...]

// Even worse - silent failure
for (const item of items) {
  console.log(item?.type);  // undefined for all items!
}
```

**Observed behavior:** The spread operator `[...]` uses the array's iterator, but reactive proxies don't properly implement the iterator protocol. The result is an array of the correct length but with all `null` values.

## Solution: Use Index-Based Access

Always use index-based access when working with reactive proxy arrays:

```typescript
// GOOD: Index-based access works correctly
const proxyArray = someCell.get() || [];
const items: MyType[] = [];

for (let i = 0; i < proxyArray.length; i++) {
  items.push(proxyArray[i]);  // Correct values!
}

// Or with Array.from and a mapping function
const items = Array.from({ length: proxyArray.length }, (_, i) => proxyArray[i]);
```

## Example: Members Module Fix

This bug was encountered when processing member lists for cross-charm writes:

```typescript
// BAD: Produced array of nulls
const proxyMembersList = targetMembersCell.get() || [];
const targetMembersList = [...proxyMembersList];  // All nulls!

// GOOD: Index-based iteration
const proxyMembersList = targetMembersCell.get() || [];
const targetMembersList: MemberEntry[] = [];
for (let i = 0; i < proxyMembersList.length; i++) {
  targetMembersList.push(proxyMembersList[i]);
}
```

## Why This Happens

From `packages/runner/src/query-result-proxy.ts`:

1. When you call `.get()` on a Cell, it returns a reactive proxy wrapping the value
2. The reactive proxy intercepts property access (like `[0]`, `[1]`) correctly
3. However, the `Symbol.iterator` implementation doesn't properly yield proxied values
4. The spread operator `[...]` uses `Symbol.iterator`, getting nulls instead of values

## Related Issues

This is related to but distinct from the `Array.isArray()` issue documented in `2025-12-22-array-isarray-fails-on-reactive-proxies.md`. Both stem from reactive proxies not fully implementing Array behavior:

| Operation | Works? | Workaround |
|-----------|--------|------------|
| `Array.isArray(proxy)` | No - returns false | Check `typeof proxy.length === "number"` |
| `[...proxy]` | No - produces nulls | Index-based loop |
| `proxy[i]` | Yes | N/A |
| `proxy.length` | Yes | N/A |
| `proxy.map()` | Yes (usually) | N/A |
| `proxy.filter()` | Yes (usually) | N/A |

## The Rule

**Never use spread operator `[...]` on values that might be reactive proxies.** Instead:

1. Use index-based loops: `for (let i = 0; i < arr.length; i++)`
2. Use `Array.from()` with a mapping function
3. Prefer `.map()` and `.filter()` which seem to work on proxies

## Context

- Discovered while debugging bidirectional linking in Members module
- The spread operator silently produced nulls, causing reverse link writes to fail
- A local reactive proxy gotchas file noted "Spread operator `[...proxy]` - needs testing" - now tested and confirmed FAILS

## Related Documentation

- **Runtime source:** `labs/packages/runner/src/query-result-proxy.ts`
- **Related gotcha:** Local reactive proxy gotchas notes

## Related Superstitions

- `2025-12-22-array-isarray-fails-on-reactive-proxies.md` - Related Array detection issue

---

**This pattern is VERIFIED CORRECT.**
