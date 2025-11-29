# Close Browser Before Using `charm link`

**Status:** Superstition (single observation)

## Problem

When using `ct charm link` to link charms while the browser has the target charm open, you get many `ConflictError` messages like:

```
ConflictError: The application/json of of:baedrei... already exists as ba4jca...
```

The link command may fail or partially succeed with inconsistent state.

## Solution

**Close the browser page (or tab) showing the charm BEFORE running `charm link`.**

```bash
# 1. Close the browser page showing the charm
# 2. Run the link command
deno task ct charm link ... SOURCE_CHARM TARGET_CHARM/inputName

# 3. Re-open the charm in the browser
```

## Why This Happens

The browser keeps a live connection to the charm's state. When both the browser and the CLI try to write to the same cells simultaneously, they create conflicting transactions.

## Workaround

1. Close the Playwright page or browser tab
2. Run `charm link`
3. Navigate back to the charm

## Metadata

```yaml
topic: charm-link, conflicts, browser
discovered: 2025-11-29
session: prompt-injection-tracker-map-approach
status: superstition
```

## Guestbook

- 2025-11-29 - Discovered while linking Gmail Auth to prompt-injection-tracker-v3. Got many ConflictErrors when browser was open. Closed browser, ran link, reopened - worked perfectly. (prompt-injection-tracker-map-approach)
