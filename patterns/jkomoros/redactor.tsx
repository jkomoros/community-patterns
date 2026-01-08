/// <cts-enable />
import { computed, Default, NAME, pattern, UI, wish } from "commontools";

// ============================================================================
// Types
// ============================================================================

type PIICategory = "name" | "email" | "phone" | "ssn" | "address" | "custom";
type DetectionSource = "manual" | "auto";
type ConfidenceLevel = "high" | "medium";

interface PIIEntry {
  category: PIICategory;
  value: string;
  source?: DetectionSource;  // defaults to "manual"
  confidence?: ConfidenceLevel;  // only present for auto-detected
}

interface CanonicalPIIEntry extends PIIEntry {
  canonical: string;
}

// Auto-detection result for internal use
interface AutoDetectedPII {
  category: PIICategory;
  value: string;
  confidence: ConfidenceLevel;
  matchStart: number;
  matchEnd: number;
  patternName: string;
}

// Leak scan result
interface LeakScanResult {
  found: boolean;
  leakedValues: string[];
}

// Stats for UI display
interface RedactionStats {
  manualCount: number;
  autoDetectedCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
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
// Auto-Detection - Regex patterns for common PII formats
// ============================================================================

interface PIIPattern {
  regex: RegExp;
  category: PIICategory;
  confidence: ConfidenceLevel;
  name: string;
  validator?: (match: string) => boolean;
}

/**
 * Luhn algorithm for credit card validation.
 * Returns true if the number passes the checksum.
 */
function luhnValidate(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate SSN ranges per SSA rules.
 * Invalid: area 000, 666, or 900-999; group 00; serial 0000
 */
function validateSSN(ssn: string): boolean {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  const area = parseInt(digits.slice(0, 3), 10);
  const group = parseInt(digits.slice(3, 5), 10);
  const serial = parseInt(digits.slice(5, 9), 10);

  // Invalid area numbers: 000, 666, 900-999
  if (area === 0 || area === 666 || area >= 900) return false;
  // Invalid group number: 00
  if (group === 0) return false;
  // Invalid serial number: 0000
  if (serial === 0) return false;

  return true;
}

/**
 * Validate US phone number structure.
 * Area code and exchange must start with 2-9.
 */
function validateUSPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  // Remove country code if present
  const normalized = digits.length === 11 && digits[0] === '1'
    ? digits.slice(1)
    : digits;

  if (normalized.length !== 10) return false;

  // Area code (first 3) and exchange (next 3) must start with 2-9
  const areaFirst = parseInt(normalized[0], 10);
  const exchangeFirst = parseInt(normalized[3], 10);

  return areaFirst >= 2 && areaFirst <= 9 &&
         exchangeFirst >= 2 && exchangeFirst <= 9;
}

const PII_PATTERNS: PIIPattern[] = [
  // Email - high confidence (structured format)
  {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    category: "email",
    confidence: "high",
    name: "email",
  },
  // SSN with hyphens - high confidence with validation for invalid ranges
  {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: "ssn",
    confidence: "high",
    name: "ssn_hyphen",
    validator: validateSSN,
  },
  // SSN without hyphens - high confidence (9 consecutive digits)
  // Note: Higher false positive risk, but important to catch
  {
    regex: /\b\d{9}\b/g,
    category: "ssn",
    confidence: "high",
    name: "ssn_nohyphen",
    validator: validateSSN,
  },
  // Credit card - high confidence with Luhn validation
  // Matches 13-19 digits with optional spaces or dashes
  {
    regex: /\b(?:\d{4}[- ]?){3,4}\d{1,4}\b/g,
    category: "custom",
    confidence: "high",
    name: "credit_card",
    validator: luhnValidate,
  },
  // US Phone - medium confidence with validation
  // Fixed: uses (?:\(\d{3}\)|\d{3}) to prevent unbalanced parentheses
  // Matches: (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567
  {
    regex: /\b(?:\+1[- .]?)?(?:\(\d{3}\)|\d{3})[- .]?\d{3}[- .]?\d{4}\b/g,
    category: "phone",
    confidence: "medium",
    name: "phone_us",
    validator: validateUSPhone,
  },
];

/**
 * Run auto-detection on input text.
 * Returns detected PII items with positions and confidence.
 */
function autoDetectPII(text: string): AutoDetectedPII[] {
  const results: AutoDetectedPII[] = [];
  const coveredRanges: Array<[number, number]> = [];

  for (const pattern of PII_PATTERNS) {
    // Create a new regex instance to reset lastIndex
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;

      // Check for overlap with existing matches (longer matches take precedence)
      const overlaps = coveredRanges.some(
        ([s, e]) => start < e && end > s
      );
      if (overlaps) continue;

      // Run validator if present
      if (pattern.validator && !pattern.validator(value)) continue;

      results.push({
        category: pattern.category,
        value,
        confidence: pattern.confidence,
        matchStart: start,
        matchEnd: end,
        patternName: pattern.name,
      });

      coveredRanges.push([start, end]);
    }
  }

  // Sort by position
  return results.sort((a, b) => a.matchStart - b.matchStart);
}

/**
 * Convert auto-detected items to PIIEntry format, removing duplicates
 * that overlap with manual entries.
 */
function deduplicateAutoDetected(
  autoDetected: AutoDetectedPII[],
  manualEntries: CanonicalPIIEntry[]
): PIIEntry[] {
  const manualCanonicals = new Set(manualEntries.map(e => e.canonical));

  return autoDetected
    .filter(auto => {
      const { canonical } = canonicalize(auto.value);
      return !manualCanonicals.has(canonical);
    })
    .map(auto => ({
      category: auto.category,
      value: auto.value,
      source: "auto" as DetectionSource,
      confidence: auto.confidence,
    }));
}

// ============================================================================
// Leak Scanning - Detect if original PII appears in restored output
// ============================================================================

// Minimum canonical length to scan for leaks (avoids false positives from
// short strings like "Al" matching "algorithm")
const MIN_LEAK_CANONICAL_LENGTH = 3;

/**
 * Scan restored text for any original PII that might have leaked.
 * Uses the same word-boundary matching as redaction for consistency,
 * avoiding false positives from substring matches.
 */
function scanForLeaks(
  restoredText: string,
  originalPII: CanonicalPIIEntry[]
): LeakScanResult {
  const leaks: LeakScanResult = {
    found: false,
    leakedValues: [],
  };

  if (!restoredText || restoredText.trim() === "") {
    return leaks;
  }

  // Filter to meaningful-length entries to reduce false positives
  const significantPII = originalPII.filter(
    pii => pii.canonical.length >= MIN_LEAK_CANONICAL_LENGTH
  );

  if (significantPII.length === 0) {
    return leaks;
  }

  // Reuse findPIIMatches for consistent word-boundary behavior
  // This prevents false positives like "John" matching "Johnathan"
  const matches = findPIIMatches(restoredText, significantPII);

  if (matches.length > 0) {
    leaks.found = true;
    // Deduplicate leaked values
    for (const match of matches) {
      if (!leaks.leakedValues.includes(match.pii.value)) {
        leaks.leakedValues.push(match.pii.value);
      }
    }
  }

  return leaks;
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
  autoDetectEnabled: Default<boolean, false>;  // Opt-IN to preserve fail-closed behavior
}

/** Text redactor that replaces PII with nonces for LLM safety. #redactor */
interface OutputSchema {
  title: Default<string, "Redactor">;
  piiEntries: Default<PIIEntry[], []>;
  inputText: Default<string, "">;
  llmResponse: Default<string, "">;
  autoDetectEnabled: Default<boolean, false>;
  redactedText: string;
  restoredText: string;
  autoDetectedPII: PIIEntry[];
  leakScanResult: LeakScanResult;
  stats: RedactionStats;
}

// Type for wish result
type WishedVault = { entries: PIIEntry[] };

export default pattern<InputSchema, OutputSchema>(({ title, piiEntries, inputText, llmResponse, autoDetectEnabled }) => {
  // Wish for a PII vault as fallback if none linked
  // TODO(CT-1084): Update to wish({ query: "#pii-vault" }) when object syntax bug is fixed
  const wishedVault = wish<WishedVault>("#pii-vault");

  // Manual PII entries: use linked entries if present, otherwise use wished vault
  const manualPII = computed(() => {
    // If we have directly linked entries, use those
    if (piiEntries.length > 0) {
      return [...piiEntries].map(e => ({ ...e, source: "manual" as DetectionSource })) as PIIEntry[];
    }
    // Otherwise try the wished vault
    const vault = wishedVault;
    if (vault && vault.entries && vault.entries.length > 0) {
      return [...vault.entries].map(e => ({ ...e, source: "manual" as DetectionSource })) as PIIEntry[];
    }
    return [] as PIIEntry[];
  });

  // Auto-detected PII from input text
  const autoDetectedPII = computed(() => {
    if (!autoDetectEnabled) return [] as PIIEntry[];
    const text = inputText;
    if (!text || text.trim() === "") return [] as PIIEntry[];

    // Prepare manual entries for deduplication
    const preparedManual = preparePIIEntries(manualPII);

    // Run auto-detection and deduplicate
    const detected = autoDetectPII(text);
    return deduplicateAutoDetected(detected, preparedManual);
  });

  // Combined PII: manual entries take precedence, then auto-detected
  const combinedPII = computed(() => {
    const manual = manualPII as PIIEntry[];
    const auto = autoDetectedPII as PIIEntry[];
    return [...manual, ...auto];
  });

  // Stats for UI
  const stats = computed((): RedactionStats => {
    const manual = manualPII as PIIEntry[];
    const auto = autoDetectedPII as PIIEntry[];
    return {
      manualCount: manual.length,
      autoDetectedCount: auto.length,
      highConfidenceCount: auto.filter(e => e.confidence === "high").length,
      mediumConfidenceCount: auto.filter(e => e.confidence === "medium").length,
    };
  });

  // Legacy compatibility
  const hasPII = computed(() => combinedPII.length > 0);
  const hasAutoDetected = computed(() => (autoDetectedPII as PIIEntry[]).length > 0);

  // Auto-redact whenever inputText changes (reactive)
  // FAIL CLOSED: If no PII entries AND no auto-detection, output error message
  const redactionResult = computed(() => {
    const text = inputText;
    const entries = combinedPII as PIIEntry[];

    // Fail closed: require some PII protection (manual or auto-detected)
    if (entries.length === 0 && !autoDetectEnabled) {
      return {
        redacted: "⚠️ ERROR: No PII vault connected and auto-detection disabled. Cannot safely redact.",
        session: null as RedactionSession | null,
        preparedPII: [] as CanonicalPIIEntry[],
      };
    }

    // No text to redact
    if (!text || text.trim() === "") {
      return {
        redacted: "",
        session: null as RedactionSession | null,
        preparedPII: [] as CanonicalPIIEntry[],
      };
    }

    // Perform redaction with combined PII
    const preparedPII = preparePIIEntries(entries);
    const session = createSession();
    const redacted = redact(text, preparedPII, session);
    return { redacted, session, preparedPII };
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

  // Leak scanning - check if original PII appears in restored output
  const leakScanResult = computed((): LeakScanResult => {
    const restored = restoredText as string;
    const preparedPII = redactionResult.preparedPII;

    if (!restored || restored.trim() === "" || !preparedPII || preparedPII.length === 0) {
      return { found: false, leakedValues: [] };
    }

    return scanForLeaks(restored, preparedPII);
  });

  return {
    [NAME]: title,
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "900px" }}>
        <h2 style={{ margin: "0 0 1rem 0" }}>{title}</h2>

        {/* Auto-detection toggle */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ct-checkbox $checked={autoDetectEnabled}>
              <span style={{ fontSize: "13px" }}>
                Auto-detect common PII patterns (supplements manual entries)
              </span>
            </ct-checkbox>
          </div>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "4px", marginLeft: "24px" }}>
            Detects: US emails, phones, SSNs, credit cards. Does NOT detect: names, addresses, international formats.
          </div>
        </div>

        {/* Enhanced status bar with breakdown */}
        <div style={{ marginBottom: "1rem", fontSize: "13px" }}>
          {computed(() =>
            hasPII || hasAutoDetected ? (
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#16a34a" }}>
                  ✓ {stats.manualCount + stats.autoDetectedCount} PII items - auto-redacting
                </span>
                {stats.manualCount > 0 && (
                  <span style={{
                    padding: "2px 8px",
                    backgroundColor: "#dbeafe",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#1e40af",
                  }}>
                    {stats.manualCount} manual
                  </span>
                )}
                {stats.autoDetectedCount > 0 && (
                  <span style={{
                    padding: "2px 8px",
                    backgroundColor: "#f3e8ff",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#7c3aed",
                  }}>
                    {stats.autoDetectedCount} auto-detected
                  </span>
                )}
                {stats.highConfidenceCount > 0 && (
                  <span style={{
                    padding: "2px 8px",
                    backgroundColor: "#d1fae5",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#065f46",
                  }} title="High confidence detections">
                    {stats.highConfidenceCount} high
                  </span>
                )}
                {stats.mediumConfidenceCount > 0 && (
                  <span style={{
                    padding: "2px 8px",
                    backgroundColor: "#fef3c7",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#92400e",
                  }} title="Medium confidence detections">
                    {stats.mediumConfidenceCount} medium
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: "#dc2626", fontWeight: "500" }}>
                ⚠️ No PII protection active - {autoDetectEnabled ? "enter text to auto-detect" : "FAIL CLOSED MODE"}
              </span>
            )
          )}
        </div>

        {/* Warning banner when no PII and auto-detect disabled */}
        {computed(() =>
          !hasPII && !autoDetectEnabled ? (
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
              <strong>Security Warning:</strong> No PII vault is connected and auto-detection is disabled.
              The redactor will not pass through any text. Enable auto-detection or link a PII vault.
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

        {/* Auto-detected PII section */}
        {computed(() =>
          hasAutoDetected ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>Auto-Detected PII</span>
                <span style={{
                  padding: "2px 8px",
                  backgroundColor: "#f3e8ff",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "normal",
                  color: "#7c3aed",
                }}>
                  {(autoDetectedPII as PIIEntry[]).length} items
                </span>
              </h3>
              <div style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
              }}>
                {(autoDetectedPII as PIIEntry[]).map((item: PIIEntry) => (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: "#fafafa",
                  }}>
                    {/* Category badge */}
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: "500",
                      backgroundColor: "#e0e7ff",
                      color: "#3730a3",
                      minWidth: "50px",
                      textAlign: "center",
                    }}>
                      {item.category}
                    </span>
                    {/* Confidence badge */}
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      fontWeight: "500",
                      backgroundColor: item.confidence === "high" ? "#d1fae5" : "#fef3c7",
                      color: item.confidence === "high" ? "#065f46" : "#92400e",
                    }}>
                      {item.confidence}
                    </span>
                    {/* Value */}
                    <span style={{ flex: 1, fontFamily: "monospace", fontSize: "13px" }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}

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

        {/* Leak scan result */}
        {computed(() =>
          (leakScanResult as LeakScanResult).found ? (
            <div style={{
              padding: "1rem",
              marginTop: "1rem",
              backgroundColor: "#fef2f2",
              border: "2px solid #dc2626",
              borderRadius: "8px",
              color: "#991b1b",
            }}>
              <strong>⚠️ LEAK DETECTED!</strong>
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "13px" }}>
                Original PII was found in the restored output. The following values may have leaked:
              </p>
              <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
                {(leakScanResult as LeakScanResult).leakedValues.map((val: string) => (
                  <li style={{ fontFamily: "monospace" }}>{val}</li>
                ))}
              </ul>
            </div>
          ) : restoredText && (restoredText as string).trim() !== "" ? (
            <div style={{
              padding: "0.5rem 1rem",
              marginTop: "0.5rem",
              backgroundColor: "#fefce8",
              border: "1px solid #fde047",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#854d0e",
            }}>
              <div>No leaks detected for <strong>known PII entries</strong></div>
              <div style={{ fontSize: "11px", marginTop: "4px", color: "#a16207" }}>
                Note: Only checks PII you provided or auto-detected. Names, addresses, and international formats may not be covered.
              </div>
            </div>
          ) : null
        )}
      </div>
    ),
    title,
    piiEntries,
    inputText,
    llmResponse,
    autoDetectEnabled,
    redactedText,
    restoredText,
    autoDetectedPII,
    leakScanResult,
    stats,
  };
});
