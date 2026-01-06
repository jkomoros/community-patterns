# Redactor Pattern Improvements

## Overview

The redactor pattern currently requires users to manually specify all PII entries upfront. This design doc outlines improvements to add **auto-detection** of common PII patterns, inspired by production privacy SDKs like Rehydra.

## Current State

The redactor has strong foundations:
- **Evasion resistance**: Unicode normalization, confusables mapping, zero-width char removal
- **Realistic replacements**: Uses fiction-reserved phone numbers (555-01XX), never-issued SSNs (900-XX-XXXX)
- **Fail-closed design**: Refuses to pass text without a PII vault connected
- **Session-based**: Consistent nonce mapping within a session

## Problem

Users must manually enumerate all PII. If they forget an email address or phone number, it gets sent to the LLM unredacted. This creates a gap between "PII I know about" and "PII in the text."

## Proposed Improvements

### 1. Auto-Detection Layer (High Priority)

Add regex-based detection for structured PII patterns:

| Type | Pattern | Notes |
|------|---------|-------|
| Email | Standard email regex | High confidence |
| Phone | US/intl formats | Medium confidence (many false positives) |
| SSN | XXX-XX-XXXX | High confidence |
| Credit Card | 13-19 digits with Luhn check | High confidence |
| IP Address | IPv4/IPv6 | Context-dependent |

**Design decisions:**
- Auto-detected PII supplements (doesn't replace) manual entries
- Manual entries take precedence for categorization
- Flag auto-detected items in UI so user can review

### 2. Confidence Levels (Medium Priority)

Not all detections are equal:
- **High confidence**: SSN, credit card (with Luhn), email with known domain
- **Medium confidence**: Phone numbers, names (without NER)
- **Low confidence**: Potential addresses, ambiguous patterns

Show confidence in UI. Let user confirm/reject low-confidence detections.

### 3. Leak Scanning (Medium Priority)

After restoration, scan for any original PII that might have leaked through:
- LLM might have reconstructed PII from context
- Nonce might not have been used consistently
- Warn user if leaks detected

### 4. Detection Stats (Low Priority)

Show what was auto-detected vs manual:
- "Redacted 3 manual entries + 2 auto-detected emails"
- Helps users understand coverage

## Non-Goals (for now)

- **NER-based detection**: Would require ONNX runtime, significant complexity
- **Encrypted session storage**: Current in-memory approach is fine for pattern scope
- **Multi-turn persistence**: Sessions live within pattern instance

## Implementation Plan

1. Add regex patterns for email, phone, SSN, credit card
2. Integrate auto-detection into `findPIIMatches`
3. Update UI to show auto-detected vs manual entries
4. Add leak scanning on restore
5. Test with various evasion attempts

## Testing Strategy

- Unit test each regex pattern
- Test interaction between manual and auto-detected PII
- Test evasion attempts (Unicode tricks, spacing)
- Test leak detection

## Open Questions

- Should auto-detection be opt-in or opt-out?
- How to handle false positives (e.g., "Call 555-1234" in fiction)?
- Should we warn about PII categories not covered by manual entries?
