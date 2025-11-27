# Prompt Injection Tracker - TODO

## Status
**Working:** Core functionality verified end-to-end (Nov 27, 2025)

## Completed
- [x] CT-1085 workaround: Accept authCharm as direct input for manual linking
- [x] Gmail integration working via linked auth
- [x] Email parsing and article extraction
- [x] LLM link extraction from articles
- [x] LLM report summarization
- [x] Report saving and display

## UI Improvements Needed

### Better Status Visibility
The current UI makes it hard to tell if processing is stuck or still working.

**Issues identified:**
1. "Analyzing 2 articles with LLM..." shows indefinitely even after LLM completes
2. No progress indicator (e.g., "2/41 articles processed")
3. Multi-step pipeline requires manual button clicks between phases - not obvious
4. When linkExtractionPending is false but processingStatus still shows old message

**Suggested improvements:**
- Add a progress bar or X/Y counter for article processing
- Auto-continue pipeline instead of requiring manual "Fetch & Summarize" click
- Show timestamps for when each phase started/completed
- Add a timeout indicator (e.g., "Processing for 30s...")
- Clear status message when LLM completes

### Processing Limitations
- Currently limited to 2 articles per batch (line 739) - intentional for testing
- Consider making this configurable or removing the limit

### Other Improvements
- [ ] Show which articles have been processed vs pending
- [ ] Add ability to reprocess failed articles
- [ ] Better error display when article fetch fails
- [ ] Add "Cancel Processing" button

## Testing Notes
Tested with:
- Gmail account: alex@common.tools
- Gmail-auth charm ID: baedreifvnxubn7p47ta6mir4iyonzqjy4pcdpvdir6gdzpsau6kjdcgokq
- Tracker charm ID: baedreibpmqz3bqumdb3lwgpilmniejdih2arzxhgbycrxc36hbvdgw7fam
- Successfully extracted and saved 1 security report about Google Antigravity vulnerability
