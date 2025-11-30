# Redactor Pattern Design

## Overview

The Redactor pattern provides a privacy-preserving layer between sensitive user data and untrusted systems (primarily LLMs). It accepts a structured list of PII (Personally Identifying Information), redacts that PII from outgoing text by replacing it with realistic-looking nonces, and restores the original PII when responses come back.

**Key insight**: The LLM never sees real PII, but produces responses that reference the nonces. When restored, the output appears as if the LLM had access to the real data.

## Goals

1. **Privacy**: PII never leaves the local system
2. **Transparency**: Upstream consumers see seamless results (as if PII was used)
3. **Consistency**: Same PII maps to same nonce within a prompt (so LLM reasoning is coherent)
4. **Robustness**: Resist evasion attempts (whitespace, unicode tricks, etc.)
5. **Realism**: Nonces look like plausible real data of the same type

## Threat Model

### What we're defending against

1. **Direct PII exposure**: User accidentally pastes content containing their PII into a prompt
2. **Inference attacks**: Attacker tries to extract PII by observing patterns in redacted output
3. **Evasion attacks**: Malicious input tries to sneak PII through via:
   - Whitespace insertion: `J o h n   S m i t h`
   - Case variations: `JOHN smith`, `jOhN sMiTh`
   - Punctuation: `J.o.h.n. S.m.i.t.h.`
   - Line breaks: `John\nSmith`
   - Unicode confusables: `Jоhn` (Cyrillic 'о')
   - Zero-width characters: `Jo​hn` (zero-width space)
   - Combining characters: Diacritics that look like base letters

### What we're NOT defending against

1. **Semantic inference**: If PII is "works at Google" and prompt says "the user's employer", LLM might still reference Google
2. **Side-channel attacks**: Timing, response length variations
3. **Determined adversaries with full system access**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Redactor                                │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ PII Registry │    │  Normalizer  │    │  Nonce Generator │   │
│  │             │    │              │    │                  │   │
│  │ - names     │    │ - canonical  │    │ - per-category   │   │
│  │ - emails    │    │   form       │    │   realistic data │   │
│  │ - phones    │    │ - position   │    │                  │   │
│  │ - ssns      │    │   tracking   │    │                  │   │
│  │ - addresses │    │              │    │                  │   │
│  │ - custom    │    │              │    │                  │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Session State                         │   │
│  │                                                          │   │
│  │   pii_to_nonce: Map<CanonicalPII, Nonce>                │   │
│  │   nonce_to_pii: Map<Nonce, OriginalPII>                 │   │
│  │                                                          │   │
│  │   (Reset per prompt/response cycle)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────┐              ┌────────────────────────┐    │
│  │    redact()    │              │       restore()        │    │
│  │                │              │                        │    │
│  │ input text ──► │              │ ◄── LLM response       │    │
│  │                │              │                        │    │
│  │ ──► safe text  │              │ restored text ──►      │    │
│  └────────────────┘              └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Structures

### PII Categories

```typescript
type PIICategory =
  | 'name'      // Full names, first names, last names
  | 'email'     // Email addresses
  | 'phone'     // Phone numbers
  | 'ssn'       // Social Security Numbers
  | 'address'   // Physical addresses
  | 'custom';   // User-defined sensitive strings

interface PIIEntry {
  category: PIICategory;
  value: string;           // Original value
  canonical: string;       // Normalized form for matching
}

interface PIIRegistry {
  entries: PIIEntry[];
  // Sorted by canonical length descending (match longest first)
}
```

### Nonce Pools

```typescript
interface NoncePools {
  name: {
    first: string[];    // ["Alice", "Bob", "Carol", "David", ...]
    last: string[];     // ["Anderson", "Brown", "Chen", "Davis", ...]
  };
  email: {
    domains: string[];  // ["example.com", "test.org", "sample.net"]
  };
  phone: {
    // 555-01XX range is reserved for fiction
    patterns: string[]; // ["555-0100", "555-0101", ...]
  };
  ssn: {
    // 987-65-4320 through 987-65-4329 are reserved for advertising
    // 900-999 range is not issued
    patterns: string[]; // ["900-00-0001", "900-00-0002", ...]
  };
  address: {
    streets: string[];  // ["123 Example St", "456 Test Ave", ...]
    cities: string[];   // ["Anytown", "Somewhere", ...]
  };
  custom: {
    // Generic placeholders
    patterns: string[]; // ["[REDACTED-A]", "[REDACTED-B]", ...]
  };
}
```

### Session State

```typescript
interface RedactionSession {
  // Forward mapping: what nonce did we use for this PII?
  piiToNonce: Map<string, string>;  // canonical PII → nonce

  // Reverse mapping: what PII does this nonce represent?
  nonceToPii: Map<string, string>;  // nonce → original PII (preserving case)

  // Track which nonces have been used (to avoid collisions)
  usedNonces: Set<string>;

  // Counter for generating unique nonces per category
  nonceCounters: Map<PIICategory, number>;
}
```

## Algorithms

### 1. Canonicalization

Transform text into a normalized form for matching:

```typescript
function canonicalize(text: string): { canonical: string; positionMap: number[] } {
  // positionMap[i] = index in original text that produced canonical[i]

  const result: string[] = [];
  const positionMap: number[] = [];

  // Step 1: Unicode NFKC normalization
  // Handles: ﬁ→fi, ２→2, etc.
  let normalized = text.normalize('NFKC');

  // Step 2: Map Unicode confusables to ASCII
  // Cyrillic а→a, о→o, е→e, etc.
  // Greek ο→o, etc.
  normalized = mapConfusables(normalized);

  // Step 3: Remove zero-width characters
  // U+200B (zero-width space), U+200C, U+200D, U+FEFF
  normalized = removeZeroWidth(normalized);

  // Step 4: Collapse whitespace and track positions
  let i = 0;
  let inWhitespace = false;

  for (const char of normalized) {
    if (isWhitespace(char) || isPunctuation(char)) {
      inWhitespace = true;
    } else {
      if (inWhitespace && result.length > 0) {
        // Don't add whitespace to canonical, but note the boundary
      }
      result.push(char.toLowerCase());
      positionMap.push(i);
      inWhitespace = false;
    }
    i++;
  }

  return {
    canonical: result.join(''),
    positionMap
  };
}
```

### 2. PII Matching

Find all PII occurrences in text, handling evasion attempts:

```typescript
function findPIIMatches(
  text: string,
  registry: PIIRegistry
): PIIMatch[] {
  const { canonical: canonicalText, positionMap } = canonicalize(text);
  const matches: PIIMatch[] = [];

  // Sort PII by canonical length descending (match longest first)
  const sortedPII = [...registry.entries].sort(
    (a, b) => b.canonical.length - a.canonical.length
  );

  // Track which positions are already matched (for overlapping PII)
  const matchedPositions = new Set<number>();

  for (const pii of sortedPII) {
    let searchStart = 0;

    while (true) {
      const matchIndex = canonicalText.indexOf(pii.canonical, searchStart);
      if (matchIndex === -1) break;

      // Check if any position in this match is already taken
      let overlaps = false;
      for (let i = matchIndex; i < matchIndex + pii.canonical.length; i++) {
        if (matchedPositions.has(i)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        // Map back to original text positions
        const originalStart = positionMap[matchIndex];
        const originalEnd = positionMap[matchIndex + pii.canonical.length - 1] + 1;

        // Expand to include surrounding whitespace/punctuation that was part of evasion
        const expandedSpan = expandToOriginalBoundaries(text, originalStart, originalEnd);

        matches.push({
          pii,
          originalStart: expandedSpan.start,
          originalEnd: expandedSpan.end,
          originalText: text.slice(expandedSpan.start, expandedSpan.end)
        });

        // Mark positions as matched
        for (let i = matchIndex; i < matchIndex + pii.canonical.length; i++) {
          matchedPositions.add(i);
        }
      }

      searchStart = matchIndex + 1;
    }
  }

  // Sort by position for replacement
  return matches.sort((a, b) => a.originalStart - b.originalStart);
}
```

### 3. Nonce Generation

Generate realistic replacement values:

```typescript
function generateNonce(
  category: PIICategory,
  session: RedactionSession,
  pools: NoncePools
): string {
  const counter = session.nonceCounters.get(category) || 0;
  session.nonceCounters.set(category, counter + 1);

  let nonce: string;

  switch (category) {
    case 'name':
      // Combine first and last names
      const firstIdx = counter % pools.name.first.length;
      const lastIdx = Math.floor(counter / pools.name.first.length) % pools.name.last.length;
      nonce = `${pools.name.first[firstIdx]} ${pools.name.last[lastIdx]}`;
      break;

    case 'email':
      // Generate email from name nonce
      const nameForEmail = pools.name.first[counter % pools.name.first.length].toLowerCase();
      const domain = pools.email.domains[counter % pools.email.domains.length];
      nonce = `${nameForEmail}${counter}@${domain}`;
      break;

    case 'phone':
      // Use 555-01XX reserved range
      nonce = `555-01${String(counter % 100).padStart(2, '0')}`;
      break;

    case 'ssn':
      // Use 900-XX-XXXX (never issued)
      const group = Math.floor(counter / 10000) % 100;
      const serial = counter % 10000;
      nonce = `900-${String(group).padStart(2, '0')}-${String(serial).padStart(4, '0')}`;
      break;

    case 'address':
      const streetNum = 100 + counter;
      const street = pools.address.streets[counter % pools.address.streets.length];
      const city = pools.address.cities[counter % pools.address.cities.length];
      nonce = `${streetNum} ${street}, ${city}`;
      break;

    case 'custom':
    default:
      // Generic placeholder with unique ID
      nonce = `[ITEM-${String(counter + 1).padStart(3, '0')}]`;
      break;
  }

  // Ensure no collision with other nonces or existing PII
  while (session.usedNonces.has(nonce)) {
    nonce = `${nonce}_${Math.random().toString(36).slice(2, 6)}`;
  }

  session.usedNonces.add(nonce);
  return nonce;
}
```

### 4. Redaction

```typescript
function redact(
  text: string,
  registry: PIIRegistry,
  session: RedactionSession,
  pools: NoncePools
): string {
  const matches = findPIIMatches(text, registry);

  // Build result by replacing matches
  let result = '';
  let lastEnd = 0;

  for (const match of matches) {
    // Add text before this match
    result += text.slice(lastEnd, match.originalStart);

    // Get or create nonce for this PII
    let nonce = session.piiToNonce.get(match.pii.canonical);
    if (!nonce) {
      nonce = generateNonce(match.pii.category, session, pools);
      session.piiToNonce.set(match.pii.canonical, nonce);
      session.nonceToPii.set(nonce, match.pii.value);
    }

    result += nonce;
    lastEnd = match.originalEnd;
  }

  // Add remaining text
  result += text.slice(lastEnd);

  return result;
}
```

### 5. Restoration

```typescript
function restore(
  text: string,
  session: RedactionSession
): string {
  let result = text;

  // Sort nonces by length descending (match longest first)
  const sortedNonces = [...session.nonceToPii.entries()].sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [nonce, originalPII] of sortedNonces) {
    // Replace all occurrences of nonce with original PII
    result = result.split(nonce).join(originalPII);
  }

  return result;
}
```

### 6. Case Preservation

Apply the case pattern from the original matched text to the nonce:

```typescript
type CasePattern = 'lower' | 'upper' | 'title' | 'mixed';

function detectCasePattern(text: string): CasePattern {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'lower';

  const isAllLower = letters === letters.toLowerCase();
  const isAllUpper = letters === letters.toUpperCase();
  const isTitle = /^[A-Z][a-z]*(\s+[A-Z][a-z]*)*$/.test(text.trim());

  if (isAllLower) return 'lower';
  if (isAllUpper) return 'upper';
  if (isTitle) return 'title';
  return 'mixed';
}

function applyCasePattern(text: string, pattern: CasePattern): string {
  switch (pattern) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'title': return text.replace(/\b\w/g, c => c.toUpperCase());
    case 'mixed': return text; // Keep nonce's default case
    default: return text;
  }
}

// Usage in redact():
const casePattern = detectCasePattern(match.originalText);
const casedNonce = applyCasePattern(nonce, casePattern);
```

### 7. Format Preservation

Detect and apply format patterns (primarily for SSNs and phone numbers):

```typescript
interface FormatPattern {
  // Positions where separators appear in original
  separatorPositions: number[];
  // What separator character was used
  separator: string;
  // Total length without separators
  digitCount: number;
}

function detectFormatPattern(text: string): FormatPattern | null {
  const digitsOnly = text.replace(/\D/g, '');
  if (!digitsOnly) return null;

  const separatorPositions: number[] = [];
  let digitIndex = 0;
  let separator = '';

  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      digitIndex++;
    } else if (/[-.\s]/.test(text[i])) {
      separatorPositions.push(digitIndex);
      if (!separator) separator = text[i];
    }
  }

  return {
    separatorPositions,
    separator,
    digitCount: digitsOnly.length
  };
}

function applyFormatPattern(digits: string, pattern: FormatPattern | null): string {
  if (!pattern || pattern.separatorPositions.length === 0) {
    return digits; // No formatting needed
  }

  let result = '';
  let digitIndex = 0;

  for (let i = 0; i < digits.length; i++) {
    if (pattern.separatorPositions.includes(digitIndex) && digitIndex > 0) {
      result += pattern.separator;
    }
    result += digits[i];
    digitIndex++;
  }

  return result;
}

// Usage: SSN "123456789" with pattern from "123-45-6789" → "900-00-0001"
```

### 8. Word Boundary Checking

Ensure matches occur at word boundaries to avoid matching substrings:

```typescript
function isWordBoundary(text: string, index: number): boolean {
  // Start/end of string is a boundary
  if (index < 0 || index >= text.length) return true;

  const char = text[index];

  // Whitespace is a boundary
  if (/\s/.test(char)) return true;

  // Common punctuation is a boundary
  if (/[.,;:!?@#$%^&*()\[\]{}<>\/\\|`~"'=+\-]/.test(char)) return true;

  return false;
}

function isValidMatch(
  text: string,
  matchStart: number,
  matchEnd: number
): boolean {
  // Check boundary before match
  const beforeBoundary = isWordBoundary(text, matchStart - 1);

  // Check boundary after match
  const afterBoundary = isWordBoundary(text, matchEnd);

  return beforeBoundary && afterBoundary;
}

// Integration with findPIIMatches():
// After finding a canonical match, verify word boundaries in original text
if (!isValidMatch(text, expandedSpan.start, expandedSpan.end)) {
  // Skip this match - not at word boundary
  continue;
}
```

### 9. Partial Name Auto-Splitting

When adding a name, automatically create entries for component parts:

```typescript
function addNamePII(
  registry: PIIRegistry,
  fullName: string,
  session: RedactionSession,
  pools: NoncePools
): void {
  // Add the full name
  const fullNameEntry: PIIEntry = {
    category: 'name',
    value: fullName,
    canonical: canonicalize(fullName).canonical
  };
  registry.entries.push(fullNameEntry);

  // Generate nonce for full name
  const fullNonce = generateNonce('name', session, pools);
  // e.g., "Alice Anderson"

  // Split into components
  const parts = fullName.trim().split(/\s+/);
  const nonceParts = fullNonce.trim().split(/\s+/);

  // Add each part as a linked entry
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length < 2) continue; // Skip initials

    const partEntry: PIIEntry = {
      category: 'name',
      value: part,
      canonical: canonicalize(part).canonical,
      // Link to the corresponding nonce part
      linkedNonce: nonceParts[i] || nonceParts[nonceParts.length - 1]
    };
    registry.entries.push(partEntry);
  }
}

// Example:
// addNamePII(registry, "John Michael Smith", session, pools)
// Creates entries for:
//   - "John Michael Smith" → "Alice Beth Anderson"
//   - "John" → "Alice"
//   - "Michael" → "Beth"
//   - "Smith" → "Anderson"
```

### 10. Email Auto-Splitting

When adding an email, split into local part and domain:

```typescript
const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'mail.com',
  'live.com', 'msn.com', 'ymail.com', 'googlemail.com'
]);

function addEmailPII(
  registry: PIIRegistry,
  email: string,
  session: RedactionSession,
  pools: NoncePools
): void {
  // Add full email
  const emailEntry: PIIEntry = {
    category: 'email',
    value: email,
    canonical: canonicalize(email).canonical
  };
  registry.entries.push(emailEntry);

  // Parse email
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1).toLowerCase();

  // Always add local part (often contains name)
  const localEntry: PIIEntry = {
    category: 'name', // Treat as name-like for matching
    value: localPart,
    canonical: canonicalize(localPart).canonical
  };
  registry.entries.push(localEntry);

  // Add domain only if not a common provider
  if (!COMMON_EMAIL_DOMAINS.has(domain)) {
    const domainEntry: PIIEntry = {
      category: 'custom',
      value: domain,
      canonical: canonicalize(domain).canonical
    };
    registry.entries.push(domainEntry);
  }
}

// Example:
// addEmailPII(registry, "john.smith@acme-corp.com", session, pools)
// Creates entries for:
//   - "john.smith@acme-corp.com" → "alice0@example.com"
//   - "john.smith" → "Alice" (name-like)
//   - "acme-corp.com" → "[ITEM-001]" (custom, not common domain)
//
// addEmailPII(registry, "john.smith@gmail.com", session, pools)
// Creates entries for:
//   - "john.smith@gmail.com" → "alice0@example.com"
//   - "john.smith" → "Alice" (name-like)
//   - (gmail.com NOT added - common provider)
```

## API Design

### Core Interface

```typescript
interface Redactor {
  // Add PII to the registry
  addPII(category: PIICategory, value: string): void;
  addPIIBatch(entries: Array<{ category: PIICategory; value: string }>): void;

  // Clear all PII
  clearPII(): void;

  // Create a new session for a prompt/response cycle
  createSession(): RedactionSession;

  // Redact text using a session
  redact(text: string, session: RedactionSession): string;

  // Restore text using the same session
  restore(text: string, session: RedactionSession): string;
}
```

### Usage Pattern

```typescript
// Setup
const redactor = createRedactor();
redactor.addPII('name', 'John Smith');
redactor.addPII('email', 'john.smith@company.com');
redactor.addPII('ssn', '123-45-6789');

// For each LLM interaction
const session = redactor.createSession();

const unsafePrompt = `
  Please help John Smith with his tax return.
  His SSN is 123-45-6789 and email is john.smith@company.com.
`;

const safePrompt = redactor.redact(unsafePrompt, session);
// "Please help Alice Anderson with his tax return.
//  His SSN is 900-00-0001 and email is alice0@example.com."

const llmResponse = await callLLM(safePrompt);
// "I'd be happy to help Alice Anderson. I'll send the forms to alice0@example.com..."

const restoredResponse = redactor.restore(llmResponse, session);
// "I'd be happy to help John Smith. I'll send the forms to john.smith@company.com..."
```

## Pattern Implementation

### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│  PII Registry                                               │
├─────────────────────────────────────────────────────────────┤
│  Category: [Name ▼]     Value: [________________] [+ Add]   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Name: John Smith                              [×]    │   │
│  │ Email: john.smith@company.com                 [×]    │   │
│  │ SSN: 123-45-6789                              [×]    │   │
│  │ Custom: Project Codename Alpha                [×]    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Input Text                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Please help John Smith with his tax return.         │   │
│  │ His SSN is 123-45-6789...                           │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [Redact ▶]                                                 │
├─────────────────────────────────────────────────────────────┤
│  Redacted Output (safe to send to LLM)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Please help Alice Anderson with his tax return.     │   │
│  │ His SSN is 900-00-0001...                           │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  LLM Response (paste response here)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ I'll help Alice Anderson with the tax forms...      │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [Restore ▶]                                                │
├─────────────────────────────────────────────────────────────┤
│  Restored Output                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ I'll help John Smith with the tax forms...          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Pattern State

```typescript
// Cells for the pattern
const piiRegistry = cell<PIIEntry[]>([]);
const inputText = cell<string>('');
const llmResponse = cell<string>('');

// Derived state
const currentSession = cell<RedactionSession | null>(null);
const redactedOutput = cell<string>('');
const restoredOutput = cell<string>('');
```

## Design Decisions

### Resolved

1. **Partial name matching**: YES. If PII includes "John Smith", we automatically also match "John" and "Smith" individually. This provides better privacy at the cost of potential over-redaction. When adding a name, we split on whitespace and add each component as a separate PII entry (linked to the same nonce family for consistency).

2. **Case preservation**: YES. If input has "JOHN SMITH", the nonce should also be "ALICE ANDERSON". Analyze the case pattern of the matched text and apply it to the nonce.

3. **Format preservation**: YES. If SSN is registered as "123-45-6789" but input has "123456789", the replacement should also be "900000001" (no dashes). Detect the format pattern and apply to nonce.

4. **Word boundary awareness**: YES. "John" should NOT match inside "Johnson". Matching requires word boundaries (whitespace, punctuation, or start/end of string) on both sides. However, "John" SHOULD match in "John@email.com" since @ is a word boundary.

5. **PII registry as input**: The pattern accepts PII as an input cell. Don't worry about persistence or where it comes from - that's the caller's responsibility.

6. **Custom category nonces**: Use `[ITEM-001]` style for custom PII. Simple and clear.

7. **Email auto-splitting**: When adding an email like `john.smith@company.com`:
   - Always add the local part (`john.smith`) as a separate name-like entry
   - Add the domain (`company.com`) UNLESS it's a common provider (gmail.com, hotmail.com, yahoo.com, outlook.com, icloud.com, aol.com, protonmail.com, mail.com, live.com, msn.com)
   - This prevents over-redaction of common domains while protecting custom/corporate domains

8. **Address handling**: Treat addresses as opaque strings. Don't attempt to parse into components (street, city, zip). Too complex and error-prone.

### Open (for future consideration)

1. **Multi-language support**: Names in non-Latin scripts would need localized nonce pools. Defer for now.

2. **Audit logging**: Could log what was redacted locally for debugging. Defer - creates another sensitive data store.

## Future Extensions

1. **Auto-extraction**: Pattern that scans documents and extracts likely PII automatically
2. **LLM wrapper**: Middleware that automatically redacts prompts and restores responses
3. **Confidence scoring**: Mark matches with confidence levels (exact match vs fuzzy)
4. **Allowlisting**: Mark certain contexts where PII is OK (e.g., "My name is {name}" pattern)
5. **Streaming support**: Handle streaming LLM responses with incremental restoration

## Security Considerations

1. **PII storage**: The PII registry is the most sensitive part. In the pattern, it lives only in browser memory. Never persist to server without encryption.

2. **Nonce collisions**: Ensure generated nonces can't accidentally match other PII items.

3. **Timing attacks**: Canonicalization and matching should be constant-time if possible (probably not critical for this use case).

4. **Memory clearing**: When session ends, explicitly clear nonce mappings from memory.

5. **Copy/paste safety**: Warn users that redacted text is safe to copy, but the mapping info should never leave the pattern.
