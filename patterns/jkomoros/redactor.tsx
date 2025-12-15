/// <cts-enable />
import { Cell, computed, Default, NAME, pattern, UI, wish } from "commontools";

// ============================================================================
// Types
// ============================================================================

type PIICategory = "name" | "email" | "phone" | "ssn" | "address" | "custom";

interface PIIEntry {
  category: PIICategory;
  value: string;
}

interface CanonicalPIIEntry extends PIIEntry {
  canonical: string;
}

// Use plain objects for JSON serialization in Cells
interface RedactionSession {
  piiToNonce: Record<string, string>;
  nonceToPii: Record<string, string>;
  usedNonces: string[];
  nonceCounters: Record<string, number>;
}

// ============================================================================
// Canonicalization - Core algorithm for evasion resistance
// ============================================================================

// Unicode confusables mapping (Cyrillic, Greek, etc. → Latin)
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  // Greek
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ζ': 'Z',
  // Common substitutions
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e',
  // Add more as needed
};

// Zero-width characters to remove
const ZERO_WIDTH_CHARS = new Set([
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\uFEFF', // Zero-width no-break space (BOM)
  '\u00AD', // Soft hyphen
]);

/**
 * Canonicalize text for matching:
 * 1. Unicode NFKC normalization
 * 2. Map confusables to ASCII
 * 3. Remove zero-width characters
 * 4. Remove whitespace and punctuation
 * 5. Lowercase
 *
 * Returns canonical form and position mapping back to original.
 */
function canonicalize(text: string): { canonical: string; positionMap: number[] } {
  const positionMap: number[] = [];
  const result: string[] = [];

  // Step 1: Unicode NFKC normalization
  const normalized = text.normalize('NFKC');

  // Process character by character, tracking original positions
  // Note: After NFKC, positions may shift. We track based on the normalized string
  // and assume the caller works with normalized input.
  let i = 0;
  for (const char of normalized) {
    // Step 2: Skip zero-width characters
    if (ZERO_WIDTH_CHARS.has(char)) {
      i++;
      continue;
    }

    // Step 3: Map confusables
    let mappedChar = CONFUSABLES[char] || char;

    // Step 4: Skip whitespace and punctuation
    if (/[\s\p{P}]/u.test(mappedChar)) {
      i++;
      continue;
    }

    // Step 5: Lowercase and add to result
    result.push(mappedChar.toLowerCase());
    positionMap.push(i);
    i++;
  }

  return {
    canonical: result.join(''),
    positionMap
  };
}

/**
 * Check if a position is a word boundary in the original text.
 */
function isWordBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  const char = text[index];
  if (/\s/.test(char)) return true;
  if (/[\p{P}]/u.test(char)) return true;
  return false;
}

// ============================================================================
// Nonce Generation - Realistic replacements per category
// ============================================================================

const NONCE_POOLS = {
  name: {
    first: ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'],
    last: ['Anderson', 'Brown', 'Chen', 'Davis', 'Evans', 'Foster', 'Garcia', 'Harris', 'Irving', 'Jones'],
  },
  email: {
    domains: ['example.com', 'test.org', 'sample.net', 'demo.io'],
  },
  phone: {
    // 555-01XX range is reserved for fiction
    prefixes: ['555-0100', '555-0101', '555-0102', '555-0103', '555-0104'],
  },
  ssn: {
    // 900-XX-XXXX range is never issued
    prefixes: ['900-00-', '900-01-', '900-02-', '900-03-', '900-04-'],
  },
  address: {
    streets: ['Example St', 'Test Ave', 'Sample Blvd', 'Demo Ln', 'Mock Dr'],
    cities: ['Anytown', 'Somewhere', 'Testville', 'Mocksburg', 'Sampletown'],
  },
};

function generateNonce(category: PIICategory, session: RedactionSession): string {
  const counter = session.nonceCounters[category] || 0;
  session.nonceCounters[category] = counter + 1;

  let nonce: string;

  switch (category) {
    case 'name': {
      const firstIdx = counter % NONCE_POOLS.name.first.length;
      const lastIdx = Math.floor(counter / NONCE_POOLS.name.first.length) % NONCE_POOLS.name.last.length;
      nonce = `${NONCE_POOLS.name.first[firstIdx]} ${NONCE_POOLS.name.last[lastIdx]}`;
      break;
    }
    case 'email': {
      const nameForEmail = NONCE_POOLS.name.first[counter % NONCE_POOLS.name.first.length].toLowerCase();
      const domain = NONCE_POOLS.email.domains[counter % NONCE_POOLS.email.domains.length];
      nonce = `${nameForEmail}${counter}@${domain}`;
      break;
    }
    case 'phone': {
      const prefix = NONCE_POOLS.phone.prefixes[counter % NONCE_POOLS.phone.prefixes.length];
      nonce = prefix;
      break;
    }
    case 'ssn': {
      const prefix = NONCE_POOLS.ssn.prefixes[counter % NONCE_POOLS.ssn.prefixes.length];
      const serial = String(counter % 10000).padStart(4, '0');
      nonce = `${prefix}${serial}`;
      break;
    }
    case 'address': {
      const streetNum = 100 + counter;
      const street = NONCE_POOLS.address.streets[counter % NONCE_POOLS.address.streets.length];
      const city = NONCE_POOLS.address.cities[counter % NONCE_POOLS.address.cities.length];
      nonce = `${streetNum} ${street}, ${city}`;
      break;
    }
    case 'custom':
    default:
      nonce = `[REDACTED-${String(counter + 1).padStart(3, '0')}]`;
      break;
  }

  // Ensure no collision
  while (session.usedNonces.includes(nonce)) {
    nonce = `${nonce}_${Math.random().toString(36).slice(2, 6)}`;
  }
  session.usedNonces.push(nonce);

  return nonce;
}

// ============================================================================
// PII Matching
// ============================================================================

interface PIIMatch {
  pii: CanonicalPIIEntry;
  originalStart: number;
  originalEnd: number;
  originalText: string;
}

/**
 * Prepare PII entries by computing their canonical forms.
 * Also splits names into components for partial matching.
 */
function preparePIIEntries(entries: PIIEntry[]): CanonicalPIIEntry[] {
  const result: CanonicalPIIEntry[] = [];

  for (const entry of entries) {
    const { canonical } = canonicalize(entry.value);
    result.push({ ...entry, canonical });

    // For names, also add individual components
    if (entry.category === 'name') {
      const parts = entry.value.trim().split(/\s+/);
      for (const part of parts) {
        if (part.length >= 2) {
          const { canonical: partCanonical } = canonicalize(part);
          result.push({
            category: 'name',
            value: part,
            canonical: partCanonical,
          });
        }
      }
    }

    // For emails, extract local part and possibly domain
    if (entry.category === 'email') {
      const atIndex = entry.value.lastIndexOf('@');
      if (atIndex > 0) {
        const localPart = entry.value.slice(0, atIndex);
        const domain = entry.value.slice(atIndex + 1).toLowerCase();

        // Add local part
        const { canonical: localCanonical } = canonicalize(localPart);
        result.push({
          category: 'name',
          value: localPart,
          canonical: localCanonical,
        });

        // Add domain if not a common provider
        const COMMON_PROVIDERS = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'aol', 'protonmail', 'mail', 'live', 'msn'];
        const provider = domain.split('.')[0];
        if (!COMMON_PROVIDERS.includes(provider)) {
          const { canonical: domainCanonical } = canonicalize(domain);
          result.push({
            category: 'custom',
            value: domain,
            canonical: domainCanonical,
          });
        }
      }
    }
  }

  // Sort by canonical length descending (match longest first)
  result.sort((a, b) => b.canonical.length - a.canonical.length);

  // Remove duplicates
  const seen = new Set<string>();
  return result.filter(entry => {
    if (seen.has(entry.canonical)) return false;
    seen.add(entry.canonical);
    return true;
  });
}

/**
 * Find all PII matches in text.
 */
function findPIIMatches(text: string, piiEntries: CanonicalPIIEntry[]): PIIMatch[] {
  const { canonical: canonicalText, positionMap } = canonicalize(text);
  const matches: PIIMatch[] = [];
  const matchedPositions = new Set<number>();

  for (const pii of piiEntries) {
    if (pii.canonical.length === 0) continue;

    let searchStart = 0;
    while (true) {
      const matchIndex = canonicalText.indexOf(pii.canonical, searchStart);
      if (matchIndex === -1) break;

      // Check if any position is already matched
      let overlaps = false;
      for (let i = matchIndex; i < matchIndex + pii.canonical.length; i++) {
        if (matchedPositions.has(i)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        // Map back to original positions
        const originalStart = positionMap[matchIndex];
        const originalEnd = positionMap[matchIndex + pii.canonical.length - 1] + 1;

        // Expand to capture any in-between punctuation/whitespace
        let expandedStart = originalStart;
        let expandedEnd = originalEnd;

        // Expand backwards to word boundary
        while (expandedStart > 0 && !isWordBoundary(text, expandedStart - 1)) {
          expandedStart--;
        }

        // Expand forwards to word boundary
        while (expandedEnd < text.length && !isWordBoundary(text, expandedEnd)) {
          expandedEnd++;
        }

        // Verify word boundaries
        if (isWordBoundary(text, expandedStart - 1) && isWordBoundary(text, expandedEnd)) {
          matches.push({
            pii,
            originalStart: expandedStart,
            originalEnd: expandedEnd,
            originalText: text.slice(expandedStart, expandedEnd),
          });

          // Mark positions as matched
          for (let i = matchIndex; i < matchIndex + pii.canonical.length; i++) {
            matchedPositions.add(i);
          }
        }
      }

      searchStart = matchIndex + 1;
    }
  }

  // Sort by position
  return matches.sort((a, b) => a.originalStart - b.originalStart);
}

// ============================================================================
// Redact and Restore
// ============================================================================

function createSession(): RedactionSession {
  return {
    piiToNonce: {},
    nonceToPii: {},
    usedNonces: [],
    nonceCounters: {},
  };
}

function redact(text: string, piiEntries: CanonicalPIIEntry[], session: RedactionSession): string {
  const matches = findPIIMatches(text, piiEntries);

  let result = '';
  let lastEnd = 0;

  for (const match of matches) {
    result += text.slice(lastEnd, match.originalStart);

    // Get or create nonce
    let nonce = session.piiToNonce[match.pii.canonical];
    if (!nonce) {
      nonce = generateNonce(match.pii.category, session);
      session.piiToNonce[match.pii.canonical] = nonce;
      session.nonceToPii[nonce] = match.pii.value;
    }

    result += nonce;
    lastEnd = match.originalEnd;
  }

  result += text.slice(lastEnd);
  return result;
}

function restore(text: string, session: RedactionSession): string {
  let result = text;

  // Sort nonces by length descending
  const sortedNonces = Object.entries(session.nonceToPii).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [nonce, originalPII] of sortedNonces) {
    result = result.split(nonce).join(originalPII);
  }

  return result;
}

// ============================================================================
// Pattern
// ============================================================================

interface InputSchema {
  title: Default<string, "Redactor">;
  piiEntries: Default<PIIEntry[], []>;
  inputText: Default<string, "">;
  llmResponse: Default<string, "">;
}

/** Text redactor that replaces PII with nonces for LLM safety. #redactor */
interface OutputSchema {
  title: Default<string, "Redactor">;
  piiEntries: Default<PIIEntry[], []>;
  inputText: Default<string, "">;
  llmResponse: Default<string, "">;
  redactedText: string;
  restoredText: string;
}

// Type for wish result
type WishedVault = { entries: PIIEntry[] };

export default pattern<InputSchema, OutputSchema>(({ title, piiEntries, inputText, llmResponse }) => {
  // Wish for a PII vault as fallback if none linked
  // TODO(CT-1084): Update to wish({ query: "#pii-vault" }) when object syntax bug is fixed
  const wishedVault = wish<WishedVault>("#pii-vault");

  // Effective PII entries: use linked entries if present, otherwise use wished vault
  const effectivePII = computed(() => {
    // If we have directly linked entries, use those
    if (piiEntries.length > 0) {
      return [...piiEntries] as PIIEntry[];
    }
    // Otherwise try the wished vault
    const vault = wishedVault;
    if (vault && vault.entries && vault.entries.length > 0) {
      return [...vault.entries] as PIIEntry[];
    }
    return [] as PIIEntry[];
  });

  // Stats
  const piiCount = computed(() => effectivePII.length);
  const hasPII = computed(() => effectivePII.length > 0);

  // Auto-redact whenever inputText changes (reactive)
  // FAIL CLOSED: If no PII entries, output error message instead of passing through
  const redactionResult = computed(() => {
    const text = inputText;
    const entries = effectivePII;

    // Fail closed: require PII entries
    if (entries.length === 0) {
      return {
        redacted: "⚠️ ERROR: No PII vault connected. Cannot safely redact. Please link a PII vault or add entries.",
        session: null as RedactionSession | null,
      };
    }

    // No text to redact
    if (!text || text.trim() === "") {
      return {
        redacted: "",
        session: null as RedactionSession | null,
      };
    }

    // Perform redaction
    const preparedPII = preparePIIEntries(entries);
    const session = createSession();
    const redacted = redact(text, preparedPII, session);
    return { redacted, session };
  });

  // Reactive outputs from redaction
  const redactedText = computed(() => redactionResult.redacted);

  // Auto-restore whenever llmResponse changes (reactive)
  const restoredText = computed(() => {
    const response = llmResponse;
    const session = redactionResult.session;

    // No session means no redaction happened yet
    if (!session) {
      if (response && response.trim() !== "") {
        return "⚠️ ERROR: No active redaction session. Enter input text first.";
      }
      return "";
    }

    // No response to restore
    if (!response || response.trim() === "") {
      return "";
    }

    // Perform restoration
    return restore(response, session);
  });

  return {
    [NAME]: title,
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "900px" }}>
        <h2 style={{ margin: "0 0 1rem 0" }}>{title}</h2>

        {/* Status bar */}
        <div style={{ marginBottom: "1rem", fontSize: "13px" }}>
          {computed(() =>
            hasPII ? (
              <span style={{ color: "#16a34a" }}>
                ✓ {piiCount} PII entries loaded - auto-redacting
              </span>
            ) : (
              <span style={{ color: "#dc2626", fontWeight: "500" }}>
                ⚠️ No PII vault connected - FAIL CLOSED MODE
              </span>
            )
          )}
        </div>

        {/* Warning banner when no PII */}
        {computed(() =>
          !hasPII ? (
            <div
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#991b1b",
              }}
            >
              <strong>Security Warning:</strong> No PII vault is connected.
              The redactor will not pass through any text without a vault.
              Please link a PII vault or favorite one tagged with #pii-vault.
            </div>
          ) : null
        )}

        {/* Input section */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
            Input Text (may contain PII)
          </h3>
          <ct-input
            $value={inputText}
            placeholder="Paste or link text that may contain PII..."
          />
          <div style={{ marginTop: "0.5rem", fontSize: "12px", color: "#666" }}>
            Redaction happens automatically when text changes
          </div>
        </div>

        {/* Redacted output */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
            Redacted Output (safe to send to LLM)
          </h3>
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              minHeight: "60px",
            }}
          >
            {redactedText}
          </div>
        </div>

        {/* LLM Response section */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
            LLM Response (paste or link response here)
          </h3>
          <ct-input
            $value={llmResponse}
            placeholder="Paste or link LLM response containing nonces..."
          />
          <div style={{ marginTop: "0.5rem", fontSize: "12px", color: "#666" }}>
            Restoration happens automatically when response changes
          </div>
        </div>

        {/* Restored output */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>
            Restored Output
          </h3>
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              minHeight: "60px",
            }}
          >
            {restoredText}
          </div>
        </div>
      </div>
    ),
    title,
    piiEntries,
    inputText,
    llmResponse,
    redactedText,
    restoredText,
  };
});
