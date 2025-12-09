# Berni Session 12/9 - Action Items

Extracted from debugging session with Berni (framework author).

## Summary

Two patterns were discussed:
1. **story-weaver** - Performance debugging, some blessed docs but root cause not identified
2. **gmail-agentic-search** - Concrete solution for auth token refresh

---

## Story Weaver - Performance Issues

### Status: Investigation ongoing, no root cause found

Berni looked at the code and network/memory profiling. There's definitely a reactive loop happening (transactions scheduled going from 3000 to 8000+ in seconds) but the exact cause wasn't identified.

### Blessed Documentation to Add

These are authoritative statements from Berni:

#### 1. Don't use IDs - use cell.equals()
- **Berni says:** "Don't use IDs. Use cell.equals()"
- The pattern generates IDs under the covers which is suspicious
- Should use object references and cell.equals() instead
- **Action:** Document in community-docs as blessed
- **Action:** Review story-weaver for ID usage and refactor to use cell references

#### 2. Write handlers outside of pattern function
- **Berni says:** "Write handlers outside of pattern. Because you want to make sure you don't accidentally close over something"
- Handlers inside the pattern function can accidentally close over reactive values
- No linting exists yet to catch this
- **Action:** Document in community-docs as blessed
- **Action:** Review story-weaver handlers and move outside pattern function

#### 3. ifElse executes BOTH branches
- **Berni says:** "ifElse actually does execute both ends of the branch"
- You cannot use ifElse to prevent code from running
- This is because the scheduler is currently "push" (eager) not "pull"
- **Workaround:** To prevent generateObject from executing, pass an empty string as prompt
- **Future:** Robin's change will make it so if data doesn't match schema, you won't be called
- **Action:** Document in community-docs as blessed
- **Action:** Review story-weaver for ifElse usage that assumes branch isn't executed

#### 4. schema: z.infer typing is auto-inferred now
- **Berni says:** "I don't have to write schema: z.infer, it will automatically infer from the typing"
- The `schema:` parameter is now redundant if you have proper TypeScript typing
- **Action:** Document in community-docs as blessed

### Debugging Tools Mentioned

Berni mentioned a debugging tool being built that would help identify reactive loops. Currently we need to use:
```javascript
// In browser console:
window.commonTools.resetLogAccounts()
// Wait a few seconds
window.commonTools.logAccountBreakdowns()
```

---

## Gmail Agentic Search - Auth Token Refresh

### Status: Concrete solution provided

The current implementation has several issues:
1. Uses `await` in handlers (blocks UI)
2. Tries to do cross-charm token refresh incorrectly
3. The auth charm isn't running so refresh calls don't work

### Blessed Documentation to Add

#### 1. Never use await in handlers
- **Berni says:** "We should never use await in handlers. Because that will block the UI"
- All async operations should use fetchData pattern instead
- The fact it doesn't error is only because cleanup hasn't happened yet
- **Action:** Document in community-docs as blessed
- **Action:** Refactor gmail-agentic-search to remove awaits from handlers

### Concrete Solution: MVP Token Refresh

Berni's recommended approach for making token refresh work:

#### Step 1: Use ct.render to include the auth charm (forces execution)
```tsx
// Don't just embed UI - use ct.render which forces the charm to execute
// Even a hidden div will work
ct.render(googleAuthCharm)
```

#### Step 2: Import and use the refresh token stream
- google-auth exports a `refreshTokenStream`
- You can render your own button that calls `.send()` on it
- This triggers the refresh flow in the auth charm

#### Step 3: Make token validity reactive
- Create a derived that checks if auth token is currently valid (true/false)
- Pass this into the scanning logic

#### Step 4: Update scanning condition
- Current: `isScanning && fullPrompt`
- New: `isScanning && validToken && fullPrompt`
- If any is false, generate empty string (stops scanning)

#### Step 5: Handler calls refresh stream
```tsx
// In startScan handler:
// 1. Check if token is valid
// 2. If not valid, call refreshTokenStream.send() to trigger refresh
// 3. Set isScanning to true
// The reactive flow will automatically resume when token becomes valid
```

### Future Enhancement: Fully Reactive Token Refresh

**Goal:** Make token refresh completely automatic with no user intervention needed.

**Current limitation:** The MVP requires user to click a refresh button when token expires.

**Berni's vision for fully reactive flow:**
1. Handler only signals "I would like the token refreshed" (doesn't do the refresh itself)
2. This signal triggers a computed request via `fetchData`
3. The refresh happens reactively, not imperatively
4. When auth token changes, scanning automatically resumes (reactive cascade)
5. Need debouncing/guards to prevent restart loops ("not keep restarting that one")

**Why this is harder:**
- The entire Gmail auth code currently uses `await` everywhere
- Would need to convert all async operations to reactive `fetchData` patterns
- Code organization would need to change significantly
- Need to understand what goes into the refresh token request

**Berni:** "Let's do that later" - MVP first, then improve

---

## Action Items Checklist

### Community Docs to Create (Blessed)

- [x] `blessed/reactivity.md` - Added: Don't use IDs, use cell.equals() (section added)
- [x] `blessed/handlers.md` - Created: Define handlers outside pattern function
- [x] `blessed/reactivity.md` - Added: ifElse runs both branches, use empty prompt to skip (section added)
- [x] `blessed/llm.md` - Created: schema: parameter auto-inferred from types
- [x] `blessed/handlers.md` - Added: await blocks UI, use fetchData instead (section added)
- [x] `blessed/cross-charm.md` - Created: ct.render forces charm to execute

### Future Work

- [ ] Fully reactive token refresh (no button needed) - see "Future Enhancement" section above

### Story Weaver Fixes

- [ ] Review for ID usage, refactor to cell.equals()
- [ ] Move handlers outside pattern function
- [ ] Review ifElse usage for branch execution assumptions
- [ ] Remove redundant schema: parameters

### Gmail Agentic Search Fixes

**NOTE: This approach was abandoned.** The cross-charm token refresh hit fundamental framework limitations (cross-space transaction isolation). When the auth charm lives in a different space than the consuming charm, stream `.send()` opens a transaction in the wrong space, causing ConflictError. The changes to gmail-agentic-search.tsx were reverted.

- [ ] Remove await from handlers - **REVERTED** (approach didn't work)
- [ ] Use ct-render for google-auth charm - **REVERTED** (approach didn't work)
- [ ] Add refresh button using refreshTokenStream.send() - **REVERTED** (approach didn't work)
- [ ] Create derived for token validity - **REVERTED** (approach didn't work)
- [ ] Update scanning condition - **REVERTED** (approach didn't work)
- [ ] Handler calls refreshTokenStream.send() - **REVERTED** (approach didn't work)

**The blocker was never resolved:**
- The auth charm lives in a different space than the consuming charm
- Cross-charm stream `.send()` doesn't execute in the target charm's transaction context
- This is a fundamental framework limitation that needs to be addressed at the framework level
- See `patterns/jkomoros/issues/ISSUE-Token-Refresh-Blocked-By-Storage-Transaction.md` for full details

---

## Session Notes

- Performance debugging tools are being built
- Robin has a change coming that will prevent calls when data doesn't match schema
- The scheduler is currently "push" (eager) and will eventually move to "pull"
