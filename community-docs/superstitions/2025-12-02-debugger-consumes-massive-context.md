# Superstition: Don't Open the Debugger in Claude Sessions

**Date:** 2025-12-02
**Author:** jkomoros
**Status:** superstition

## Summary

Do NOT open or inspect the debugger panel (the 🪲 button) when working with Claude Code. The debugger output contains massive amounts of data that will consume Claude's context window extremely quickly.

## Observed Behavior

When Claude takes a browser snapshot with the debugger open, the output includes:
- Full reactive state trees
- Cell dependency graphs
- Transaction logs
- Storage event details
- Internal framework state

This can easily be 10,000+ tokens per snapshot, rapidly depleting the ~100k token context window.

## Rule of Thumb

- **Never click the 🪲 debugger button** during Claude-assisted testing
- **If debugging is needed:** Ask the user to inspect it manually and report findings
- **For console errors:** Use `browser_console_messages` tool instead - much smaller output
- **For network issues:** Use `browser_network_requests` tool instead

## Impact

A single snapshot with the debugger open can consume 5-10% of Claude's context budget. Multiple snapshots with debugger open will cause context exhaustion and session termination.

## Related

- Testing skill documentation
- Browser snapshot usage patterns
