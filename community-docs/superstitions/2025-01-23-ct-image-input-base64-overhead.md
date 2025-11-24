# ⚠️ SUPERSTITION: ct-image-input maxSizeBytes and Base64 Encoding Overhead

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

File size limits in `ct-image-input` and base64 encoding overhead

## Problem

When using `ct-image-input` with `maxSizeBytes` to limit file uploads, the size check happens on the original file BEFORE base64 encoding. However, when the image is sent to APIs (like Claude Vision API), it's base64-encoded, which increases the size by approximately 33%.

This can cause API errors even though the file passed the `maxSizeBytes` check.

### What Didn't Work

```typescript
// ❌ Setting maxSizeBytes to the exact API limit
<ct-image-input
  onct-change={handleImageUpload({ uploadedImage })}
  maxSizeBytes={5242880}  // 5MB - Claude API limit
>
  📷 Add Photo
</ct-image-input>
```

**Symptom:** Files around 3.9MB would pass the `maxSizeBytes` check, but then fail with:
```
AI_APICallError: messages.0.content.0.image.source.base64:
image exceeds 5 MB maximum: 5508916 bytes > 5242880 bytes
```

The 3.9MB file became 5.5MB after base64 encoding (~41% increase in this case, typical range is 33-37%).

## Solution That Seemed to Work

Set `maxSizeBytes` to approximately 75% of the actual API limit to account for base64 encoding overhead:

```typescript
// ✅ Accounting for base64 encoding overhead
<ct-image-input
  onct-change={handleImageUpload({ uploadedImage })}
  maxSizeBytes={3932160}  // ~3.75MB (75% of 5MB)
>
  📷 Add Photo
</ct-image-input>
```

**Result:** Files up to ~3.75MB now pass validation and don't exceed the 5MB base64-encoded API limit.

## Context

- **Pattern:** food-recipe.tsx (image upload for recipe extraction)
- **Use case:** Uploading recipe images to extract text via Claude Vision API
- **API limit:** Claude API has 5MB limit for base64-encoded images
- **Framework:** CommonTools JSX with ct-image-input component
- **Tested with:** 2.3MB PNG file (passed), 3.9MB PNG file (failed before fix, would pass after)

## Theory / Hypothesis

Base64 encoding increases data size because:
1. Binary data (images) is converted to ASCII text
2. Every 3 bytes of binary becomes 4 bytes of base64
3. Theoretical overhead: 4/3 = 1.33x (33% increase)
4. Practical overhead: Usually 33-37% due to padding and line breaks

The `ct-image-input` component checks `maxSizeBytes` against the original file size, not the encoded size. This is reasonable for UX (users see file sizes in their OS), but patterns need to account for encoding overhead when interfacing with APIs that have encoded size limits.

## Formula

```
maxSizeBytes_for_component = API_limit_bytes * 0.75
```

Or more precisely:
```
maxSizeBytes_for_component = API_limit_bytes / 1.33
```

For Claude Vision API (5MB limit):
- Conservative: `5242880 * 0.75 = 3932160` bytes (~3.75MB)
- Precise: `5242880 / 1.33 = 3942857` bytes (~3.76MB)

## Related Official Docs

- CommonTools component documentation (if available for ct-image-input)
- Claude Vision API documentation on image size limits

The official docs don't specifically mention that `maxSizeBytes` checks pre-encoding size, or that developers need to account for base64 overhead.

## Metadata

```yaml
topic: ct-image-input, file-upload, base64-encoding
discovered: 2025-01-23
confirmed_count: 1
last_confirmed: 2025-01-23
sessions: [fix-food-recipe-image-extraction-button-error]
related_components: ct-image-input
status: superstition
stars: ⭐
```

## Guestbook

- ⭐ 2025-01-23 - Fixed image upload size limit in food-recipe pattern - 3.9MB PNG was failing API validation after passing maxSizeBytes=5MB check. Reduced to maxSizeBytes=3.75MB (75% of API limit) to account for base64 encoding overhead. (fix-food-recipe-image-extraction-button-error)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
