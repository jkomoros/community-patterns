# Components - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/COMPONENTS.md`

---

## ct-card: Don't Add Your Own Padding

**Verified:** 2025-11-23, jkomoros session
**Status:** Folk Wisdom

### The Issue

`ct-card` already includes generous padding (`1.5rem` = 24px) on its content area. Adding additional padding in your child elements creates excessive whitespace.

This applies to **any** child of ct-card, including layout containers like `ct-vstack` and `ct-hstack`. Don't add padding via inline styles or the `padding` attribute when these are direct children of ct-card.

### What NOT to Do

```tsx
// ❌ BAD - Double padding via inline style (24px from ct-card + 10px = 34px total)
<ct-card>
  <ct-vstack gap={1} style="padding: 10px;">
    <h3>My Content</h3>
    ...
  </ct-vstack>
</ct-card>

// ❌ ALSO BAD - Double padding via padding attribute
<ct-card>
  <ct-vstack gap={1} padding="2">
    <h3>My Content</h3>
    ...
  </ct-vstack>
</ct-card>

// ❌ ALSO BAD - Double padding on div
<ct-card>
  <div style="padding: 12px;">
    <h3>My Content</h3>
    ...
  </div>
</ct-card>
```

### What TO Do

```tsx
// ✅ GOOD - Let ct-card handle the padding
<ct-card>
  <ct-vstack gap={1}>
    <h3>My Content</h3>
    ...
  </ct-vstack>
</ct-card>

// ✅ ALSO GOOD - Use gap for spacing between elements
<ct-card>
  <ct-vstack gap={2}>
    <h3>Section 1</h3>
    <p>Content...</p>
    <h3>Section 2</h3>
    <p>More content...</p>
  </ct-vstack>
</ct-card>
```

### Technical Details

- `ct-card` applies `padding: 1.5rem` to `.card-content` (defined in `/Users/alex/Code/labs/packages/ui/src/v2/components/ct-card/ct-card.ts:109-111`)
- This padding is intentional and sufficient for most use cases
- Adding your own padding stacks with ct-card's padding, creating 32-34px or more of total whitespace
- The padding is already responsive and follows design system conventions

### When You Might Need Extra Padding

In rare cases where you need more control (e.g., asymmetric padding), consider:
1. Using margin instead of padding on specific child elements
2. Using flex/grid gap properties for spacing between elements
3. Only adding top/bottom padding if truly needed, never all-around padding

### Related

- See `~/Code/labs/packages/ui/src/v2/components/ct-card/ct-card.ts` for implementation
- Official component docs: `~/Code/labs/docs/common/COMPONENTS.md`
