# Session Summary: Prompt Injection Tracker V2 Improvements

**DELETE THIS FILE AFTER READING**

**Branch:** alex-1114
**Date:** 2025-11-14
**Status:** Blocked on critical runtime bug

## Summary

Attempted to improve the prompt-injection-tracker pattern's UX based on comprehensive spec from previous session. Hit critical deployment bugs that block all testing.

## What Was Accomplished

1. ✅ Updated CLAUDE.md with localhost deployment instructions
   - Documented `--api-url http://localhost:8000` flag for ct CLI
   - Clarified local vs remote toolshed usage

2. ✅ Created comprehensive spec (SPEC-prompt-injection-tracker-v2.md - 50 pages)
   - Current UI analysis
   - Proposed V2 improvements
   - Technical architecture changes
   - 5-phase implementation plan

3. ⚠️ V2 Implementation - LOST
   - Implemented improved v2 pattern with better UX
   - Fixed template string issues (str → derive)
   - **ACCIDENTALLY OVERWROTE FILE** when testing deployment
   - Need to re-implement from spec

## Critical Bug Discovered

**Runtime Error:** `TypeError: emailList is not iterable`

**Symptoms:**
- Pattern compiles successfully with `ct dev --no-run`
- Deployment appears to succeed (returns charm ID)
- Runtime immediately hits infinite error loop
- Console spam: "[PARSE] Starting parse, emails count: 0" → "TypeError: emailList is not iterable"
- Pattern completely non-functional
- UI times out on screenshots (5000ms exceeded)
- Page snapshot exceeds 74k tokens (error spam)

**Impact:**
- Blocks ALL testing of v1 AND v2
- Both patterns hit this error
- Cannot proceed with UX improvements until resolved

**Likely Cause:**
- Gmail importer output format mismatch
- Parser expects iterable but receives something else
- May be framework regression or deployment-specific issue

## Files Modified This Session

- `/recipes/alex/CLAUDE.md` - Added localhost deployment instructions
- `/recipes/alex/WIP/prompt-injection-tracker-v2.tsx` - LOST (accidentally overwritten)

## Files From Previous Session (Still Valid)

- `/recipes/alex/WIP/SPEC-prompt-injection-tracker-v2.md` - 50-page comprehensive spec
- `/recipes/alex/WIP/SUMMARY-prompt-injection-improvements.md` - Before/after analysis
- `/recipes/alex/WIP/prompt-injection-tracker.tsx` - Original v1 (working before this session)
- `/recipes/alex/WIP/prompt-injection-tracker-v2-broken.tsx` - Copy of v1 (for comparison)

## Key Code Locations

### The Bug Location (prompt-injection-tracker.tsx)

Lines 136-180: parseEmailsToArticles function
```typescript
const parsedArticles = derive({ emailList, processedArticles }, ({ emailList, processedArticles }) => {
  // BUG: emailList might not be iterable at runtime
  // Parser expects array but may receive Cell or other type
```

The error occurs when trying to iterate over `emailList` in the parser. The Gmail importer's output format may have changed or there's a type mismatch between what the importer returns and what the parser expects.

## What Needs Investigation

1. **Understand emailList type at runtime**
   - What does GmailImporter actually output?
   - Is it a Cell? An array? Something else?
   - Check framework docs for GmailImporter output schema

2. **Check recent framework changes**
   - Was there a breaking change in GmailImporter?
   - Check labs commits around OpaqueRef handling
   - Commit 8e55ed865 changed OpaqueRef behavior

3. **Test simpler Gmail pattern**
   - Deploy a minimal Gmail importer to isolate the issue
   - Verify basic functionality works

## Next Steps (Ordered)

1. **Phone-a-Berni** to understand:
   - GmailImporter output format
   - Whether this is a known framework bug
   - Correct way to consume Gmail importer data
   - Any recent breaking changes

2. **After understanding the bug:**
   - Fix v1 pattern to handle emailList correctly
   - Test v1 deployment and verify it works
   - Re-implement v2 from spec
   - Test v2 with Playwright

3. **V2 Improvements (from spec):**
   - Progressive disclosure (settings collapsed by default)
   - Better status indicators with progress bar
   - Consolidated async processing flow
   - Read/unread tracking for reports
   - Clearer authentication flow

## User Expectations

- **Fully tested with Playwright** - not just compilation
- Check for Gmail CPU pegging bug during testing
- Make UX smooth, easy to use, and clear
- Undo workarounds that may not be needed with framework updates

## Development Environment

- **Dev servers:** User will run them manually (toolshed + shell)
- **Space naming:** `claude-alex1114-*` with incrementing counter
- **Deployment:** Use `--api-url http://localhost:8000` flag
- **Playwright:** Available but may conflict with other sessions

## Commands Reference

```bash
# Compile without running
cd /Users/alex/Code/labs
deno task ct dev --no-run ../recipes/recipes/alex/WIP/prompt-injection-tracker.tsx

# Deploy to localhost
cd /Users/alex/Code/labs
deno task ct charm new --api-url http://localhost:8000 --space claude-alex1114-pit-test \
  ../recipes/recipes/alex/WIP/prompt-injection-tracker.tsx

# Check for processes
ps aux | grep -E "deno task|toolshed|dev-local" | grep -v grep

# Kill background dev servers
pkill -f "deno task dev"
```

## Important Context

- This is in the recipes repo, not labs
- Branch: alex-1114
- Working in WIP folder: `/recipes/alex/WIP/`
- Previous session created comprehensive spec and v2 implementation
- V2 implementation was lost this session due to file overwrite mistake
- Current blocker: Runtime bug prevents any testing

## Recovery Strategy

Given the severity of the emailList bug:

1. **Option A (Recommended):** Phone-a-Berni
   - Get authoritative answer on GmailImporter usage
   - Understand if this is a framework bug
   - Get guidance on correct implementation

2. **Option B:** Debug incrementally
   - Create minimal test pattern with just GmailImporter
   - Log the actual type/structure of emailList at runtime
   - Fix based on findings

3. **Option C:** Examine working examples
   - Check labs/packages/patterns/ for Gmail examples
   - See how other patterns consume GmailImporter
   - Copy working pattern

## Session Errors Made

1. Lost v2 implementation by overwriting with v1 during testing
2. Spent too much time trying to debug without understanding root cause
3. Didn't check if v1 actually worked before attempting v2
4. Should have phone-a-Berni'd earlier when hitting the "report is not defined" error

## Lessons Learned

- Always backup files before testing file operations
- Test v1 functionality BEFORE starting v2 improvements
- Phone-a-Berni sooner when hitting framework-level issues
- Don't thrash on deployment errors without understanding root cause
- Runtime errors are different from compile errors - need different debugging approach
