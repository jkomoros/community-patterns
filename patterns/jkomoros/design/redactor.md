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

## Open Questions

1. **Persistence**: Should PII registry persist across sessions (with encryption)? Or always start fresh for security?

2. **Partial name matching**: If PII includes "John Smith", should we also match just "John" or "Smith" alone? Could lead to over-redaction but better privacy.

3. **Context-aware matching**: "John" in "Dear John," vs "John" in "john_doe_123" - should matching be word-boundary aware?

4. **Case preservation**: If input has "JOHN SMITH" (shouting), should nonce also be uppercase? Probably yes for realism.

5. **Format preservation**: SSN written as "123456789" vs "123-45-6789" - both should match, but should replacement match input format?

6. **Multi-language support**: Names in non-Latin scripts? Would need localized nonce pools.

7. **Audit logging**: Should we log (locally) what was redacted and when? Useful for debugging but creates another sensitive data store.

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
