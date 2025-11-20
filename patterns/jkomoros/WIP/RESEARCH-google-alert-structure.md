# Google Alert Email Structure - Research Findings

## Date: November 8, 2025
## Space: claude-prompt-injection-1
## Emails Analyzed: 42 prompt injection alerts from Oct 28 - Nov 8

---

## ⚠️ CRITICAL: Thread vs Email Handling

**Google Alerts sends emails in THREADS (up to 65 emails per thread!)**

- Each new alert is a **reply to the previous alert**, creating one long thread
- Gmail's threading groups them all together visually
- **Our pattern MUST process each EMAIL individually, not threads**
- **Deduplication:** Track processed email IDs (not thread IDs)
  - When fetching emails, we get individual message IDs
  - If we've processed message ID `12345`, skip it
  - If message ID `12346` comes in the same thread, **process it** (it's new)

**Implementation requirement:**
- Store `processedEmails` as array of `{messageId: string, processed: boolean}`
- When fetching from Gmail, filter by message ID, not thread ID
- This ensures we only process net-new emails even if they're in an existing thread

---

## Email Structure Overview

Google Alerts for "prompt injection" come with:
- **From**: googlealerts-noreply@google.com
- **Subject**: `Google Alert - "prompt injection"`
- **Label**: CATEGORY_UPDATES
- **Frequency**: 1-5 emails per day
- **Threading**: Replies to previous alerts (same thread, different message IDs)

---

## Email Content Structure

Each email contains:

### 1. JSON Metadata (at top)
```json
{
  "api_version": "1.0",
  "publisher": {
    "api_key": "668269e72cfedea31b22524041ff21d9",
    "name": "Google Alerts"
  },
  "entity": {
    "external_key": "Google Alert - \"prompt injection\"",
    "title": "Google Alert - \"prompt injection\"",
    "subtitle": "Latest: November 8, 2025",
    "avatar_image_url": "...",
    "main_image_url": "..."
  },
  "updates": {
    "snippets": [
      {
        "icon": "BOOKMARK",
        "message": "Seven Ways Hackers Can Make ChatGPT Talk Too Much"
      }
    ]
  },
  "cards": [
    {
      "title": "Google Alert - \"prompt injection\"",
      "subtitle": "Highlights from the latest email",
      "widgets": [
        {
          "type": "LINK",
          "title": "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia",
          "description": "Tenable said the issues expose users to risks such as data exfiltration...",
          "url": "https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/..."
        }
      ]
    }
  ]
}
```

### 2. HTML Content
After the JSON, standard HTML with:
- Google Alerts logo/branding
- Alert name: `"prompt injection"`
- Date: "As-it-happens update ⋅ November 8, 2025"
- **ONE article** (typically - need to verify if sometimes multiple)
  - Title (linked)
  - Source domain
  - Description/snippet (with **prompt injection** bolded)
  - Social share buttons (Facebook, Twitter)
  - "Flag as irrelevant" link
- "See more results" link
- Footer with unsubscribe, manage alerts, RSS feed

---

## Article Link Structure

**Google Tracking URL Format:**
```
https://www.google.com/url?rct=j&sa=t&url=https://ACTUAL-ARTICLE-URL&ct=ga&cd=...&usg=...
```

**Key Observations:**
1. Actual URL is in the `url=` parameter
2. URL is URL-encoded (e.g., `/` becomes `%2F`)
3. Contains tracking parameters we need to strip

**Examples:**

**Email 1 (Nov 8 - BusinessToday Malaysia):**
```
Google URL: https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga&cd=CAEYACoT...
Actual URL: https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/
```

**Email 2 (Nov 7 - Yahoo Tech):**
```
Google URL: https://www.google.com/url?rct=j&sa=t&url=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ct=ga&cd=CAEYACoT...
Actual URL: https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html
```

---

## Real-World Duplication Example

**Emails 1 & 2 are the SAME story:**
- Both reference Tenable research on ChatGPT vulnerabilities
- Both mention "seven prompt injection flaws" or "Seven Ways"
- Both mention "HackedGPT" attack chain
- Different publication (BusinessToday vs Yahoo) = different URLs
- Published 1 day apart (Nov 7 vs Nov 8)

**This is the core problem we're solving:**
- Need to identify that these two articles are **blog reposts** of the same original Tenable security report
- Need to find and fetch the **original Tenable report URL** (likely embedded in these articles)
- Once we have the original URL, we can deduplicate all future reposts

**Email 3 is DIFFERENT:**
- "Cybersecurity Forecast 2026" report from Google
- Only mentions prompt injection in passing (not a specific vulnerability report)
- This is NOT a repost - it's original content that happens to mention the term
- Should be classified as "not-relevant" (not a new attack/vulnerability)

---

## Types of Articles (From Manual Inspection)

Based on the 3 examples:

1. **Repost/News Coverage** (Emails 1 & 2)
   - Blog posts or news sites covering someone else's research
   - Contains phrases like "Tenable said...", "Researchers found...", "According to..."
   - Usually includes link to original report (we need to extract this)
   - COMMON (majority of alerts)

2. **Generic Mention** (Email 3)
   - Article mentions "prompt injection" but isn't about a specific vulnerability
   - Forecast reports, general AI security articles, educational content
   - NOT a security disclosure
   - Should be filtered as "not-relevant"

3. **Original Report** (haven't seen one yet in these 3 samples)
   - Published by the researchers themselves
   - Contains actual technical details, CVE numbers, PoC code
   - These are the ones we want to track
   - RARE (maybe 1-2 out of every 10-20 emails)

---

## Link Extraction Strategy

For each email, we need to:

1. **Extract link from JSON metadata** (most reliable)
   - Parse JSON at top of email
   - Navigate to `cards[0].widgets[0].url`
   - This gives us the Google tracking URL

2. **Extract link from HTML** (fallback)
   - Look for markdown link syntax: `[Title](URL)`
   - First link after "NEWS" section is the article

3. **Unwrap Google tracking URL**
   - Parse URL query string
   - Extract `url=` parameter
   - URL-decode it to get actual article URL

---

## Gmail Query Used

```
from:"googlealerts-noreply@google.com" subject:"prompt injection"
```

This successfully fetches all and only the prompt injection alerts.

---

## Key Technical Decisions

### 1. How to Handle "See more results"?
Each email has a "See more results" link that goes to Google Alerts web UI showing more matches for that time period.

**Decision:** **Ignore** - We only process the ONE featured article per email. If user wants more, they can increase Google Alerts frequency.

### 2. Parse JSON or HTML?
**Decision:** **Parse JSON first** - It's structured data and easier to extract cleanly. Fall back to HTML parsing only if JSON is malformed.

### 3. How many articles per email?
**Observation:** All 3 examined emails have exactly ONE article.

**Decision:** Assume 1 article per email for v1. If we encounter emails with multiple articles, add TODO to handle that case.

### 4. What constitutes "same report"?
**Decision:** **URL-based deduplication after tracking original source**
- Extract link from email
- Classify: is this a repost or original?
- If repost: extract original report URL
- If original: this IS the original URL
- Normalize URL and check against existing database

---

## Data We Can Extract from Email

From the email itself (before fetching article):
- ✅ Email received date
- ✅ Article title
- ✅ Article description/snippet
- ✅ Article URL (after unwrapping)
- ✅ Source domain (from URL)
- ✅ Gmail message ID (for deduplication)

From fetching the article:
- ✅ Full article content
- ✅ Links within article (to find original report)
- ✅ Author, publish date (if available)

---

## Next Steps

1. ✅ **DONE**: Understand email structure
2. ✅ **DONE**: Identify duplication patterns
3. **TODO**: Test unwrapping Google tracking URLs
4. **TODO**: Fetch actual article content for 2-3 examples
5. **TODO**: Test if LLM can identify "this is a repost of X" from article content
6. **TODO**: Test if LLM can extract original report URL from article content
7. **TODO**: Document gmail-charm-creator pattern API for integration

---

## Example Implementation Notes

### Unwrapping Google URL (JavaScript/TypeScript)
```typescript
function unwrapGoogleAlertURL(googleURL: string): string {
  try {
    const url = new URL(googleURL);
    const actualURL = url.searchParams.get('url');
    return actualURL ? decodeURIComponent(actualURL) : googleURL;
  } catch {
    return googleURL; // If parsing fails, return as-is
  }
}

// Test:
// Input: "https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga"
// Output: "https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/"
```

### Normalizing URLs for Deduplication
```typescript
function normalizeURL(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                           'fbclid', 'gclid', 'msclkid', 'ref', 'source'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    // Remove fragment
    parsed.hash = '';

    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, '');

    // Convert to lowercase
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Test:
// Input: "https://Example.com/report?utm_source=twitter#intro"
// Output: "https://example.com/report"
```

---

## Questions for Next Research Phase

1. ☐ Can we fetch article content using WebFetch? (Test with 1-2 URLs)
2. ☐ Do all emails have JSON metadata, or just some?
3. ☐ Are there ever emails with 2+ articles? (Scan more emails)
4. ☐ How do we access Gmail importer data from our pattern? (Check gmail-charm-creator API)
5. ☐ What's the best way to store email message IDs for deduplication?

---

## CONCRETE EMAIL EXAMPLES (For Testing)

### Example 1: Repost - BusinessToday Malaysia (Nov 8, 2025)

**Email Date:** Fri, 07 Nov 2025 19:28:56 -0800
**Subject:** Google Alert - "prompt injection"
**Label:** CATEGORY_UPDATES

**Full Content:**
```
{ "api_version": "1.0", "publisher": { "api_key": "668269e72cfedea31b22524041ff21d9", "name": "Google Alerts" }, "entity": { "external_key": "Google Alert - \"prompt injection\"", "title": "Google Alert - \"prompt injection\"", "subtitle": "Latest: November 8, 2025", "avatar_image_url": "https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png", "main_image_url": "https://www.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/smartmail/mobile/il_newspaper_header_r1.png" }, "updates": { "snippets": [ { "icon": "BOOKMARK", "message": "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia" } ] }, "cards": [ { "title": "Google Alert - \"prompt injection\"", "subtitle": "Highlights from the latest email", "actions": [ { "name": "See more results", "url": "https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY\u0026start=1762563127\u0026end=1762572536\u0026source=alertsmail\u0026hl=en\u0026gl=US\u0026msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng#history" } ], "widgets": [ { "type": "LINK", "title": "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia", "description": "Tenable said the issues expose users to risks such as data exfiltration, safety override, and long-term compromise through indirect prompt injection ...", "url": "https://www.google.com/url?rct=j\u0026sa=t\u0026url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/\u0026ct=ga\u0026cd=CAEYACoTMzU1OTMxMjg0MTkzMjcxNTk4NjIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM\u0026usg=AOvVaw1g6vOl7Fp6PaQ3iRVpom4V" } ] } ] } [![Google](https://www.google.com/intl/en_us/alerts/logo.png?cd=KhMzNTU5MzEyODQxOTMyNzE1OTg2)](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng) "prompt injection" As-it-happens update ⋅ November 8, 2025 NEWS [Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia](https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga&cd=CAEYACoTMzU1OTMxMjg0MTkzMjcxNTk4NjIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw1g6vOl7Fp6PaQ3iRVpom4V) BusinessToday Malaysia Tenable said the issues expose users to risks such as data exfiltration, safety override, and long-term compromise through indirect prompt injection ... [![Facebook](https://www.gstatic.com/alerts/images/fb-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ss=fb&rt=Seven+Ways+Hackers+Can+Make+ChatGPT+Talk+Too+Much+-+BusinessToday+Malaysia&cd=KhMzNTU5MzEyODQxOTMyNzE1OTg2MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmVMZlmstOVKhTa-DsnNFBUnFpQarA) [![Twitter](https://www.gstatic.com/alerts/images/tw-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ss=tw&rt=Seven+Ways+Hackers+Can+Make+ChatGPT+Talk+Too+Much+-+BusinessToday+Malaysia&cd=KhMzNTU5MzEyODQxOTMyNzE1OTg2MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmVMZlmstOVKhTa-DsnNFBUnFpQarA) [Flag as irrelevant](https://www.google.com/alerts/feedback?ffu=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) [See more results](https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&start=1762563127&end=1762572536&source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng#history) | [Edit this alert](https://www.google.com/alerts/edit?source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&email=alex%40common.tools) You have received this email because you have subscribed to **Google Alerts**. [Unsubscribe](https://www.google.com/alerts/remove?source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) | [View all your alerts](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng) [![RSS](https://www.gstatic.com/alerts/images/rss-16.gif) Receive this alert as RSS feed](https://www.google.com/alerts/feeds/09728331254439921497/3457956146660750810) [ Send Feedback ](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&ffu=)
```

**Extracted Data:**
- **Article Title:** "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia"
- **Description:** "Tenable said the issues expose users to risks such as data exfiltration, safety override, and long-term compromise through indirect prompt injection ..."
- **Google Tracking URL:** `https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga&cd=CAEYACoTMzU1OTMxMjg0MTkzMjcxNTk4NjIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw1g6vOl7Fp6PaQ3iRVpom4V`
- **Actual Article URL:** `https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/`
- **Source Domain:** businesstoday.com.my
- **Classification:** Repost (references "Tenable said...")
- **Expected Original:** Tenable security advisory/blog post

---

### Example 2: Repost - Yahoo Tech (Nov 7, 2025)

**Email Date:** Fri, 07 Nov 2025 07:40:58 -0800
**Subject:** Google Alert - "prompt injection"
**Label:** CATEGORY_UPDATES

**Full Content:**
```
{ "api_version": "1.0", "publisher": { "api_key": "668269e72cfedea31b22524041ff21d9", "name": "Google Alerts" }, "entity": { "external_key": "Google Alert - \"prompt injection\"", "title": "Google Alert - \"prompt injection\"", "subtitle": "Latest: November 7, 2025", "avatar_image_url": "https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png", "main_image_url": "https://www.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/smartmail/mobile/il_newspaper_header_r1.png" }, "updates": { "snippets": [ { "icon": "BOOKMARK", "message": "Researchers claim ChatGPT has a whole host of worrying security flaws - here's what they found" } ] }, "cards": [ { "title": "Google Alert - \"prompt injection\"", "subtitle": "Highlights from the latest email", "actions": [ { "name": "See more results", "url": "https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY\u0026start=1762525841\u0026end=1762530058\u0026source=alertsmail\u0026hl=en\u0026gl=US\u0026msgid=ODcwODQ2OTkyMjA4MzYzODk4NA#history" } ], "widgets": [ { "type": "LINK", "title": "Researchers claim ChatGPT has a whole host of worrying security flaws - here's what they found", "description": "Tenable says it found seven prompt injection flaws in ChatGPT-4o, dubbed the "HackedGPT" attack chain. Vulnerabilities include hidden commands ...", "url": "https://www.google.com/url?rct=j\u0026sa=t\u0026url=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html\u0026ct=ga\u0026cd=CAEYACoTODcwODQ2OTkyMjA4MzYzODk4NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM\u0026usg=AOvVaw0dBHNWYCYitlxcnZn9r6Ne" } ] } ] } [![Google](https://www.google.com/intl/en_us/alerts/logo.png?cd=KhM4NzA4NDY5OTIyMDgzNjM4OTg0)](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA) "prompt injection" As-it-happens update ⋅ November 7, 2025 NEWS [Researchers claim ChatGPT has a whole host of worrying security flaws - here's what they found](https://www.google.com/url?rct=j&sa=t&url=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ct=ga&cd=CAEYACoTODcwODQ2OTkyMjA4MzYzODk4NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw0dBHNWYCYitlxcnZn9r6Ne) Yahoo! Tech Tenable says it found seven prompt injection flaws in ChatGPT-4o, dubbed the "HackedGPT" attack chain. Vulnerabilities include hidden commands ... [![Facebook](https://www.gstatic.com/alerts/images/fb-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ss=fb&rt=Researchers+claim+ChatGPT+has+a+whole+host+of+worrying+security+flaws+-+here%27s+what+they+found&cd=KhM4NzA4NDY5OTIyMDgzNjM4OTg0MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmVEaK44VcTKbFmjtb_MxA7iXjMJ_g) [![Twitter](https://www.gstatic.com/alerts/images/tw-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ss=tw&rt=Researchers+claim+ChatGPT+has+a+whole+host+of+worrying+security+flaws+-+here%27s+what+they+found&cd=KhM4NzA4NDY5OTIyMDgzNjM4OTg0MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmVEaK44VcTKbFmjtb_MxA7iXjMJ_g) [Flag as irrelevant](https://www.google.com/alerts/feedback?ffu=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) [See more results](https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&start=1762525841&end=1762530058&source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA#history) | [Edit this alert](https://www.google.com/alerts/edit?source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&email=alex%40common.tools) You have received this email because you have subscribed to **Google Alerts**. [Unsubscribe](https://www.google.com/alerts/remove?source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) | [View all your alerts](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA) [![RSS](https://www.gstatic.com/alerts/images/rss-16.gif) Receive this alert as RSS feed](https://www.google.com/alerts/feeds/09728331254439921497/3457956146660750810) [ Send Feedback ](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=ODcwODQ2OTkyMjA4MzYzODk4NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&ffu=)
```

**Extracted Data:**
- **Article Title:** "Researchers claim ChatGPT has a whole host of worrying security flaws - here's what they found"
- **Description:** "Tenable says it found seven prompt injection flaws in ChatGPT-4o, dubbed the "HackedGPT" attack chain. Vulnerabilities include hidden commands ..."
- **Google Tracking URL:** `https://www.google.com/url?rct=j&sa=t&url=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ct=ga&cd=CAEYACoTODcwODQ2OTkyMjA4MzYzODk4NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw0dBHNWYCYitlxcnZn9r6Ne`
- **Actual Article URL:** `https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html`
- **Source Domain:** tech.yahoo.com
- **Classification:** Repost (references "Tenable says...")
- **Expected Original:** Same Tenable report as Example 1
- **Duplication:** This is the SAME vulnerability as Example 1, different blog covering it

---

### Example 3: Generic Mention - Industrial Cyber (Nov 7, 2025)

**Email Date:** Fri, 07 Nov 2025 06:30:40 -0800
**Subject:** Google Alert - "prompt injection"
**Label:** CATEGORY_UPDATES

**Full Content:**
```
{ "api_version": "1.0", "publisher": { "api_key": "668269e72cfedea31b22524041ff21d9", "name": "Google Alerts" }, "entity": { "external_key": "Google Alert - \"prompt injection\"", "title": "Google Alert - \"prompt injection\"", "subtitle": "Latest: November 7, 2025", "avatar_image_url": "https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png", "main_image_url": "https://www.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/smartmail/mobile/il_newspaper_header_r1.png" }, "updates": { "snippets": [ { "icon": "BOOKMARK", "message": "Cybersecurity Forecast 2026 report (Google) - Industrial Cyber" } ] }, "cards": [ { "title": "Google Alert - \"prompt injection\"", "subtitle": "Highlights from the latest email", "actions": [ { "name": "See more results", "url": "https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY\u0026start=1762519149\u0026end=1762525840\u0026source=alertsmail\u0026hl=en\u0026gl=US\u0026msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA#history" } ], "widgets": [ { "type": "LINK", "title": "Cybersecurity Forecast 2026 report (Google) - Industrial Cyber", "description": "Threat actors will use AI for faster, more sophisticated attacks, including prompt injection and AI-driven social engineering, while defenders deploy ...", "url": "https://www.google.com/url?rct=j\u0026sa=t\u0026url=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/\u0026ct=ga\u0026cd=CAEYACoTNDI5MjI3MzgxNzY3MTA2ODk1NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM\u0026usg=AOvVaw02Io1L-8XGyO7eQxJ2O6sg" } ] } ] } [![Google](https://www.google.com/intl/en_us/alerts/logo.png?cd=KhM0MjkyMjczODE3NjcxMDY4OTU0)](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA) "prompt injection" As-it-happens update ⋅ November 7, 2025 NEWS [Cybersecurity Forecast 2026 report (Google) - Industrial Cyber](https://www.google.com/url?rct=j&sa=t&url=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/&ct=ga&cd=CAEYACoTNDI5MjI3MzgxNzY3MTA2ODk1NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw02Io1L-8XGyO7eQxJ2O6sg) Industrial Cyber Threat actors will use AI for faster, more sophisticated attacks, including prompt injection and AI-driven social engineering, while defenders deploy ... [![Facebook](https://www.gstatic.com/alerts/images/fb-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/&ss=fb&rt=Cybersecurity+Forecast+2026+report+(Google)+-+Industrial+Cyber&cd=KhM0MjkyMjczODE3NjcxMDY4OTU0MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmWCPVoAG9R99eAALefeEhlQi0lkMg) [![Twitter](https://www.gstatic.com/alerts/images/tw-24.png)](https://www.google.com/alerts/share?hl=en&gl=US&ru=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/&ss=tw&rt=Cybersecurity+Forecast+2026+report+(Google)+-+Industrial+Cyber&cd=KhM0MjkyMjczODE3NjcxMDY4OTU0MhoxMzZhMTdmOGY4ZDIzNjBiOmNvbTplbjpVUw&ssp=AMJHsmWCPVoAG9R99eAALefeEhlQi0lkMg) [Flag as irrelevant](https://www.google.com/alerts/feedback?ffu=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/&source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) [See more results](https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&start=1762519149&end=1762525840&source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA#history) | [Edit this alert](https://www.google.com/alerts/edit?source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&email=alex%40common.tools) You have received this email because you have subscribed to **Google Alerts**. [Unsubscribe](https://www.google.com/alerts/remove?source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY) | [View all your alerts](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA) [![RSS](https://www.gstatic.com/alerts/images/rss-16.gif) Receive this alert as RSS feed](https://www.google.com/alerts/feeds/09728331254439921497/3457956146660750810) [ Send Feedback ](https://www.google.com/alerts?source=alertsmail&hl=en&gl=US&msgid=NDI5MjI3MzgxNzY3MTA2ODk1NA&s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&ffu=)
```

**Extracted Data:**
- **Article Title:** "Cybersecurity Forecast 2026 report (Google) - Industrial Cyber"
- **Description:** "Threat actors will use AI for faster, more sophisticated attacks, including prompt injection and AI-driven social engineering, while defenders deploy ..."
- **Google Tracking URL:** `https://www.google.com/url?rct=j&sa=t&url=https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/&ct=ga&cd=CAEYACoTNDI5MjI3MzgxNzY3MTA2ODk1NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw02Io1L-8XGyO7eQxJ2O6sg`
- **Actual Article URL:** `https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/`
- **Source Domain:** industrialcyber.co
- **Classification:** Not Relevant (forecast report, not a specific vulnerability)
- **Expected Original:** N/A (this IS original content, just not a vulnerability report)

---

## Pattern Recognition: What Makes a "Repost"?

**Linguistic Markers** (from examples):
- "Tenable said..." / "Tenable says..."
- "Researchers claim..." / "Researchers found..."
- "According to [company/researcher]..."
- Direct quotes with attribution
- Phrases like "dubbed the 'HackedGPT' attack chain" (quoting original naming)

**Expected in Original Reports:**
- First-person: "We discovered...", "Our research shows..."
- Technical details without attribution
- CVE numbers, PoC code, technical diagrams
- Published on company blog, GitHub, or security advisory sites

---

## Testing URLs (For Development)

Use these actual URLs from the emails for testing web fetching:

1. **Repost (BusinessToday):**
   `https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/`

2. **Repost (Yahoo Tech):**
   `https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html`

3. **Generic Mention:**
   `https://industrialcyber.co/download/cybersecurity-forecast-2026-report-google/`

4. **Expected Original (need to find):**
   Likely a Tenable blog post or security advisory about "HackedGPT" / ChatGPT-4o vulnerabilities

---

## URL Unwrapping Test Cases

```javascript
// Test Case 1: BusinessToday
const input1 = "https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga&cd=CAEYACoTMzU1OTMxMjg0MTkzMjcxNTk4NjIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw1g6vOl7Fp6PaQ3iRVpom4V";
const expected1 = "https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/";

// Test Case 2: Yahoo Tech
const input2 = "https://www.google.com/url?rct=j&sa=t&url=https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html&ct=ga&cd=CAEYACoTODcwODQ2OTkyMjA4MzYzODk4NDIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw0dBHNWYCYitlxcnZn9r6Ne";
const expected2 = "https://tech.yahoo.com/ai/chatgpt/articles/researchers-claim-chatgpt-whole-host-202600741.html";
```

---

## URL Normalization Test Cases

```javascript
// Test Case 1: Remove tracking params
const input1 = "https://example.com/article?utm_source=twitter&utm_campaign=fall2025&id=123";
const expected1 = "https://example.com/article?id=123"; // Keep non-tracking params

// Test Case 2: Remove fragment
const input2 = "https://example.com/article#section-2";
const expected2 = "https://example.com/article";

// Test Case 3: Trailing slash
const input3 = "https://example.com/article/";
const expected3 = "https://example.com/article";

// Test Case 4: Lowercase
const input4 = "https://Example.COM/Article";
const expected4 = "https://example.com/article";

// Test Case 5: Combined
const input5 = "https://Example.com/Article/?utm_source=email#intro";
const expected5 = "https://example.com/article";
```

---

## Message ID Format (For Deduplication)

Based on Gmail API, each email will have:
- **messageId**: Unique identifier (e.g., `"193a4f2e8b9c1234"`)
- **threadId**: Thread identifier (SAME for all alerts, since they're threaded)

**Critical:** Use `messageId`, NOT `threadId` for deduplication!

---

## JSON Parsing Strategy

**Option 1: Parse structured JSON**
```typescript
const jsonMatch = emailContent.match(/^\{[\s\S]*?\}\s*\[/);
if (jsonMatch) {
  const metadata = JSON.parse(jsonMatch[0].slice(0, -1));
  const articleURL = metadata.cards[0].widgets[0].url;
  const articleTitle = metadata.cards[0].widgets[0].title;
  const articleDesc = metadata.cards[0].widgets[0].description;
}
```

**Option 2: Extract from markdown links**
```typescript
// Pattern: [Title](URL) after "NEWS"
const newsMatch = emailContent.match(/NEWS\s+\[([^\]]+)\]\(([^)]+)\)/);
if (newsMatch) {
  const title = newsMatch[1];
  const url = newsMatch[2];
}
```

**Recommendation:** Try Option 1 first (JSON), fall back to Option 2 if JSON parse fails.

---

## Testing Data for Pattern Development

When building the pattern, use these concrete examples:

### Minimal Test Email (for parsing tests):
```typescript
const testEmail1 = {
  id: "test-msg-001",
  date: "Fri, 07 Nov 2025 19:28:56 -0800",
  subject: 'Google Alert - "prompt injection"',
  content: `{ "api_version": "1.0", "publisher": { "api_key": "668269e72cfedea31b22524041ff21d9", "name": "Google Alerts" }, "entity": { "external_key": "Google Alert - \\"prompt injection\\"", "title": "Google Alert - \\"prompt injection\\"", "subtitle": "Latest: November 8, 2025", "avatar_image_url": "https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png", "main_image_url": "https://www.gstatic.com/bt/C3341AA7A1A076756462EE2E5CD71C11/smartmail/mobile/il_newspaper_header_r1.png" }, "updates": { "snippets": [ { "icon": "BOOKMARK", "message": "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia" } ] }, "cards": [ { "title": "Google Alert - \\"prompt injection\\"", "subtitle": "Highlights from the latest email", "actions": [ { "name": "See more results", "url": "https://www.google.com/alerts?s=AB2Xq4hfMvQDHVcPndrwdvPS1x-ZavblHX2NMwY&start=1762563127&end=1762572536&source=alertsmail&hl=en&gl=US&msgid=MzU1OTMxMjg0MTkzMjcxNTk4Ng#history" } ], "widgets": [ { "type": "LINK", "title": "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia", "description": "Tenable said the issues expose users to risks such as data exfiltration, safety override, and long-term compromise through indirect prompt injection ...", "url": "https://www.google.com/url?rct=j&sa=t&url=https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/&ct=ga&cd=CAEYACoTMzU1OTMxMjg0MTkzMjcxNTk4NjIaMTM2YTE3ZjhmOGQyMzYwYjpjb206ZW46VVM&usg=AOvVaw1g6vOl7Fp6PaQ3iRVpom4V" } ] } ] }`
};
```

Expected extraction:
- Title: "Seven Ways Hackers Can Make ChatGPT Talk Too Much - BusinessToday Malaysia"
- Description: "Tenable said the issues expose users to risks such as data exfiltration, safety override, and long-term compromise through indirect prompt injection ..."
- Unwrapped URL: "https://www.businesstoday.com.my/2025/11/08/seven-ways-hackers-can-make-chatgpt-talk-too-much/"
- Classification hint: "Tenable said..." indicates this is a repost

---

## Summary for Implementation

### What We Know:
✅ Email structure is consistent (JSON + HTML)
✅ One article per email (typical case)
✅ Google wraps URLs in tracking redirects
✅ Articles fall into: Repost | Original | Generic Mention
✅ Threading creates many emails but each has unique message ID
✅ URL-based deduplication after finding original source

### What We Need to Build:
1. **Gmail email fetcher** - Get new messages by message ID
2. **JSON parser** - Extract article data from email
3. **URL unwrapper** - Convert Google tracking URL to actual URL
4. **Web content fetcher** - Get article HTML/text
5. **LLM classifier** - Determine: Original | Repost (+ extract original URL) | Generic
6. **URL normalizer** - Clean URLs for comparison
7. **Deduplication checker** - Compare against existing reports by normalized URL
8. **Structured extractor** - Generate report from original article content

### Critical Path:
Email → Parse JSON → Unwrap URL → Fetch Article → LLM Classify → [If Repost: Extract & Fetch Original] → Normalize URL → Check Duplicates → [If Novel: LLM Extract] → Save Report
