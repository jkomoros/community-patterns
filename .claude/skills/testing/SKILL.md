---
name: testing
description: >
  Test patterns with Playwright browser automation. Navigate to deployed patterns,
  interact with UI elements, verify functionality. Use when testing patterns after
  deployment or when debugging pattern behavior in browser.
---

# Testing Patterns with Playwright

If Playwright MCP is available, use it to test patterns in a real browser.

## Navigate to Deployed Pattern

```
Use Playwright to navigate to: http://localhost:8000/my-space/CHARM-ID
```

## Test Pattern Functionality

Once the page loads:
1. Take a snapshot to see the UI: `browser_snapshot`
2. Interact with elements: click buttons, fill inputs, check boxes
3. Verify behavior: check that counters increment, items are added, etc.
4. Report any issues found

## Registering (First Time Only)

If you see a login/registration page:
1. Click "Register" or "Generate Passphrase"
2. Follow the registration flow
3. Then navigate back to the pattern URL

## Testing Workflow

**After deploying a new pattern:**
```
1. Deploy with ct charm new
2. Note the charm ID
3. Use Playwright to test at http://localhost:8000/space/charm-id
4. Verify all functionality works
5. Report to user if tests pass or if issues found
```

**After updating a pattern:**
```
1. Update with ct charm setsrc
2. Use Playwright to verify changes
3. Test that fixes work and nothing broke
```

**When Playwright unavailable:**
- Suggest user test manually in browser
- Provide the URL to test
- Ask them to report any issues

## Playwright Troubleshooting

**If Playwright starts opening many tabs:**

This can happen after user suspends/resumes their computer. The Chrome connection gets confused.

**Solution:** Ask user to:
1. Quit the Chrome instance that Playwright opened (the one with "Chrome is being controlled by automated test software" banner)
2. Next Playwright command will open a fresh browser and work normally

**Tell user:**
```
Playwright's browser connection got confused after your computer woke up.
Please quit the Chrome window with the yellow "automated test software" banner,
then I'll try again with a fresh browser.
```
