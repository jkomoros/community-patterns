---
topic: debugging
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
sessions: [prompt-injection-tracker-v3-gmail]
related_labs_docs: none
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Kill MCP Chrome Process When Browser Gets Stuck After Laptop Sleep

## Problem

When using Playwright MCP for browser automation, the browser can get stuck with the error:

```
Browser is already in use
```

This commonly happens after the laptop goes to sleep and wakes up. The Chrome browser becomes unresponsive and can't be used for further automation.

**Symptoms:**
- Any `browser_*` tool calls fail with "Browser is already in use"
- The Chrome window may or may not be visible
- Simply closing Chrome windows doesn't fix it
- User may not be at the computer to manually quit Chrome

## Solution That Seemed To Work

Kill the MCP Chrome process using:

```bash
pkill -f "mcp-chrome"
```

Or more specifically:

```bash
pkill -f "playwright"
```

After killing the process, the next browser tool call will spawn a fresh Chrome instance.

## Context

This was encountered during a Claude Code session testing the prompt-injection-tracker-v3 pattern with Gmail OAuth. The user's laptop went to sleep mid-session, and when they returned, all browser operations failed.

Since the user was away from their computer, they couldn't manually quit Chrome, so the `pkill` command was needed to reset the MCP browser state.

## Related Documentation

- **Official docs:** None found (this is MCP/Playwright behavior, not Common Tools framework)
- **Related patterns:** None
- **Similar issues:** May be related to general MCP server lifecycle management

## Next Steps

- [ ] Needs confirmation by another session
- [ ] Determine if this is MCP-specific or Playwright-specific
- [ ] Check if there's a cleaner way to reset MCP browser state
- [ ] May need to add this to standard troubleshooting docs

## Notes

- This is a workaround, not a proper fix
- The root cause appears to be MCP/Playwright not gracefully handling system sleep
- After killing, the browser state is reset completely (you'll need to log in again, etc.)
- Alternative: `pkill -f "Google Chrome"` but this kills ALL Chrome instances

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
