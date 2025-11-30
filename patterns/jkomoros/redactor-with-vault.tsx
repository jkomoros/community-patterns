/// <cts-enable />
/**
 * REDACTOR WITH VAULT (Combo Pattern)
 *
 * HACK: This pattern bundles a PII vault and redactor together as a workaround
 * because wish-based charm discovery is currently broken/unreliable.
 *
 * Ideally, these would be separate patterns:
 * - SimplePIIVault: stores sensitive PII entries
 * - Redactor: wishes for #pii-vault and auto-discovers it
 *
 * Once wish() works reliably, this combo pattern should be deprecated in favor
 * of the separated approach which is more flexible (one vault, many redactors).
 *
 * TODO: Remove this pattern when wish("#pii-vault") works reliably
 */
import { Cell, computed, Default, derive, handler, NAME, pattern, UI } from "commontools";

// ============================================================================
// Types (shared with simple-pii-vault.tsx and redactor.tsx)
// ============================================================================

type PIICategory = "name" | "email" | "phone" | "ssn" | "address" | "custom";

interface PIIEntry {
  category: PIICategory;
  value: string;
}

interface CanonicalPIIEntry extends PIIEntry {
  canonical: string;
}

interface RedactionSession {
  piiToNonce: Record<string, string>;
  nonceToPii: Record<string, string>;
  usedNonces: string[];
  nonceCounters: Record<string, number>;
}

interface InputSchema {
  title: Default<string, "PII Redactor">;
  entries: Default<PIIEntry[], []>;
  inputText: Default<string, "">;
  llmResponse: Default<string, "">;
}

// ============================================================================
// Vault: Category info and handlers
// ============================================================================

const CATEGORY_INFO: Record<PIICategory, { label: string; placeholder: string }> = {
  name: { label: "Name", placeholder: "John Smith" },
  email: { label: "Email", placeholder: "john@example.com" },
  phone: { label: "Phone", placeholder: "555-123-4567" },
  ssn: { label: "SSN", placeholder: "123-45-6789" },
  address: { label: "Address", placeholder: "123 Main St, Anytown" },
  custom: { label: "Custom", placeholder: "Any sensitive text" },
};

const addEntry = handler<
  unknown,
  { entries: Cell<PIIEntry[]>; category: Cell<PIICategory>; value: Cell<string> }
>((_event, { entries, category, value }) => {
  const val = value.get().trim();
  if (val) {
    entries.push({ category: category.get(), value: val });
    value.set("");
  }
});

const removeEntry = handler<
  unknown,
  { entries: Cell<Array<Cell<PIIEntry>>>; entry: Cell<PIIEntry> }
>((_event, { entries, entry }) => {
  const current = entries.get();
  const index = current.findIndex((el) => el.equals(entry));
  if (index >= 0) {
    entries.set(current.toSpliced(index, 1));
  }
});

// ============================================================================
// Redactor: Canonicalization and matching (copied from redactor.tsx)
// ============================================================================

const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ζ': 'Z',
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
};

const ZERO_WIDTH_CHARS = new Set([
  '\u200B', '\u200C', '\u200D', '\uFEFF', '\u00AD',
]);

function canonicalize(text: string): { canonical: string; positionMap: number[] } {
  const positionMap: number[] = [];
  const result: string[] = [];
  const normalized = text.normalize('NFKC');
  let i = 0;
  for (const char of normalized) {
    if (ZERO_WIDTH_CHARS.has(char)) { i++; continue; }
    let mappedChar = CONFUSABLES[char] || char;
    if (/[\s\p{P}]/u.test(mappedChar)) { i++; continue; }
    result.push(mappedChar.toLowerCase());
    positionMap.push(i);
    i++;
  }
  return { canonical: result.join(''), positionMap };
}

const COMMON_EMAIL_PROVIDERS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol', 'protonmail', 'mail', 'live', 'msn'];

function preparePIIEntries(entries: PIIEntry[]): CanonicalPIIEntry[] {
  const result: CanonicalPIIEntry[] = [];
  const seen = new Set<string>();

  function addIfNew(entry: PIIEntry) {
    const { canonical } = canonicalize(entry.value);
    if (canonical.length >= 2 && !seen.has(canonical)) {
      seen.add(canonical);
      result.push({ ...entry, canonical });
    }
  }

  for (const entry of entries) {
    addIfNew(entry);
    if (entry.category === 'name') {
      const parts = entry.value.trim().split(/\s+/);
      if (parts.length > 1) {
        for (const part of parts) {
          if (part.length >= 2) {
            addIfNew({ category: 'name', value: part });
          }
        }
      }
    }
    if (entry.category === 'email') {
      const atIndex = entry.value.indexOf('@');
      if (atIndex > 0) {
        const localPart = entry.value.substring(0, atIndex);
        if (localPart.length >= 2) {
          addIfNew({ category: 'custom', value: localPart });
        }
        const domain = entry.value.substring(atIndex + 1);
        const dotIndex = domain.lastIndexOf('.');
        if (dotIndex > 0) {
          const domainName = domain.substring(0, dotIndex).toLowerCase();
          if (!COMMON_EMAIL_PROVIDERS.includes(domainName) && domainName.length >= 2) {
            addIfNew({ category: 'custom', value: domain });
          }
        }
      }
    }
  }

  result.sort((a, b) => b.canonical.length - a.canonical.length);
  return result;
}

const NONCE_POOLS: Record<PIICategory, string[]> = {
  name: ['Alice Anderson', 'Bob Builder', 'Carol Chen', 'David Davis', 'Emma Edwards', 'Frank Foster', 'Grace Green', 'Henry Harris'],
  email: ['alice', 'bob', 'carol', 'david', 'emma', 'frank', 'grace', 'henry'],
  phone: ['555-0100', '555-0101', '555-0102', '555-0103', '555-0104', '555-0105'],
  ssn: ['900-00-0001', '900-00-0002', '900-00-0003', '900-00-0004'],
  address: ['123 Example St, Anytown, ST 00000', '456 Sample Ave, Somewhere, ST 00001', '789 Test Blvd, Nowhere, ST 00002'],
  custom: ['[REDACTED-1]', '[REDACTED-2]', '[REDACTED-3]', '[REDACTED-4]', '[REDACTED-5]'],
};

function createSession(): RedactionSession {
  return { piiToNonce: {}, nonceToPii: {}, usedNonces: [], nonceCounters: {} };
}

function generateNonce(category: PIICategory, session: RedactionSession): string {
  const pool = NONCE_POOLS[category];
  const counter = session.nonceCounters[category] || 0;
  session.nonceCounters[category] = counter + 1;

  if (category === 'email') {
    const base = pool[counter % pool.length];
    return `${base}${counter}@example.com`;
  }

  let nonce = pool[counter % pool.length];
  if (counter >= pool.length) {
    nonce = `${nonce} (${Math.floor(counter / pool.length) + 1})`;
  }

  if (!session.usedNonces.includes(nonce)) {
    session.usedNonces.push(nonce);
  }
  return nonce;
}

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  const prevChar = text[index - 1];
  return /[\s\p{P}]/u.test(prevChar);
}

function isWordBoundaryEnd(text: string, index: number): boolean {
  if (index >= text.length) return true;
  const nextChar = text[index];
  return /[\s\p{P}]/u.test(nextChar);
}

function redact(text: string, piiEntries: CanonicalPIIEntry[], session: RedactionSession): string {
  if (!text || piiEntries.length === 0) return text;

  const { canonical: canonicalText, positionMap } = canonicalize(text);
  const normalized = text.normalize('NFKC');

  interface Match { start: number; end: number; pii: CanonicalPIIEntry; nonce: string; }
  const matches: Match[] = [];

  for (const pii of piiEntries) {
    let searchStart = 0;
    while (true) {
      const idx = canonicalText.indexOf(pii.canonical, searchStart);
      if (idx === -1) break;

      const originalStart = positionMap[idx];
      const originalEnd = positionMap[idx + pii.canonical.length - 1] + 1;

      if (isWordBoundary(normalized, originalStart) && isWordBoundaryEnd(normalized, originalEnd)) {
        let nonce = session.piiToNonce[pii.canonical];
        if (!nonce) {
          nonce = generateNonce(pii.category, session);
          session.piiToNonce[pii.canonical] = nonce;
          session.nonceToPii[nonce] = pii.value;
        }
        matches.push({ start: originalStart, end: originalEnd, pii, nonce });
      }
      searchStart = idx + 1;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const filtered: Match[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  let result = '';
  let pos = 0;
  for (const m of filtered) {
    result += normalized.substring(pos, m.start);
    result += m.nonce;
    pos = m.end;
  }
  result += normalized.substring(pos);

  return result;
}

function restore(text: string, session: RedactionSession): string {
  if (!text) return text;
  let result = text;
  for (const [nonce, original] of Object.entries(session.nonceToPii)) {
    result = result.split(nonce).join(original);
  }
  return result;
}

// ============================================================================
// Combined Pattern
// ============================================================================

export default pattern<InputSchema>(({ title, entries, inputText, llmResponse }) => {
  // Vault state
  const newCategory = Cell.of<PIICategory>("name");
  const newValue = Cell.of("");

  // Stats
  const entryCount = computed(() => entries.length);
  const hasPII = computed(() => entries.length > 0);

  // Auto-redact (FAIL CLOSED if no entries)
  const redactionResult = computed(() => {
    const text = inputText;
    const piiList = [...entries] as PIIEntry[];

    if (piiList.length === 0) {
      return {
        redacted: text ? "⚠️ ERROR: No PII entries. Add entries above before redacting." : "",
        session: null as RedactionSession | null,
      };
    }

    if (!text || text.trim() === "") {
      return { redacted: "", session: null as RedactionSession | null };
    }

    const preparedPII = preparePIIEntries(piiList);
    const session = createSession();
    const redacted = redact(text, preparedPII, session);
    return { redacted, session };
  });

  const redactedText = computed(() => redactionResult.redacted);

  // Auto-restore
  const restoredText = computed(() => {
    const response = llmResponse;
    const session = redactionResult.session;

    if (!session) {
      if (response && response.trim() !== "") {
        return "⚠️ ERROR: No active session. Enter input text first.";
      }
      return "";
    }

    if (!response || response.trim() === "") return "";
    return restore(response, session);
  });

  const currentPlaceholder = computed(() => {
    const cat = newCategory.get();
    return CATEGORY_INFO[cat]?.placeholder || "Enter value...";
  });

  return {
    [NAME]: title,
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "900px" }}>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>{title}</h2>
        <div style={{ marginBottom: "1rem", fontSize: "12px", color: "#666", fontStyle: "italic" }}>
          Combined vault + redactor (workaround while wish is broken)
        </div>

        {/* Vault Section */}
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          backgroundColor: "#f8fafc",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
        }}>
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "14px" }}>
            🔐 PII Vault ({entryCount} entries)
          </h3>

          {/* Add form */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "flex-end" }}>
            <div style={{ minWidth: "100px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", fontWeight: "500" }}>Category</label>
              <ct-select
                $value={newCategory}
                items={[
                  { label: "Name", value: "name" },
                  { label: "Email", value: "email" },
                  { label: "Phone", value: "phone" },
                  { label: "SSN", value: "ssn" },
                  { label: "Address", value: "address" },
                  { label: "Custom", value: "custom" },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", fontWeight: "500" }}>Value</label>
              <ct-input $value={newValue} placeholder={currentPlaceholder} />
            </div>
            <ct-button onClick={addEntry({ entries, category: newCategory, value: newValue })} size="sm">
              Add
            </ct-button>
          </div>

          {/* Entries list */}
          {derive(entryCount, (count) =>
            count === 0 ? (
              <div style={{ padding: "0.5rem", textAlign: "center", color: "#999", fontSize: "12px" }}>
                No entries yet. Add PII above to enable redaction.
              </div>
            ) : null
          )}

          <div style={{ maxHeight: "150px", overflow: "auto" }}>
            {entries.map((entry) => (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.5rem",
                backgroundColor: "#fff",
                borderRadius: "4px",
                marginBottom: "4px",
                fontSize: "12px",
              }}>
                <span style={{
                  padding: "1px 6px",
                  borderRadius: "3px",
                  fontSize: "10px",
                  fontWeight: "500",
                  backgroundColor: "#e2e8f0",
                  minWidth: "50px",
                  textAlign: "center",
                }}>
                  {entry.category}
                </span>
                <span style={{ flex: 1, fontFamily: "monospace", fontSize: "11px" }}>
                  {entry.value}
                </span>
                <ct-button variant="destructive" size="sm" onClick={removeEntry({ entries, entry })}>
                  ×
                </ct-button>
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div style={{ marginBottom: "1rem", fontSize: "13px" }}>
          {derive(hasPII, (has) =>
            has ? (
              <span style={{ color: "#16a34a" }}>✓ Auto-redacting with {entryCount} entries</span>
            ) : (
              <span style={{ color: "#dc2626", fontWeight: "500" }}>⚠️ Add PII entries above to enable redaction</span>
            )
          )}
        </div>

        {/* Input */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>Input Text</h3>
          <ct-input $value={inputText} placeholder="Text that may contain PII..." />
        </div>

        {/* Redacted output */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>Redacted Output</h3>
          <div style={{
            padding: "0.75rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "6px",
            fontFamily: "monospace",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            minHeight: "40px",
          }}>
            {redactedText}
          </div>
        </div>

        {/* LLM Response */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>LLM Response</h3>
          <ct-input $value={llmResponse} placeholder="Paste LLM response with nonces..." />
        </div>

        {/* Restored output */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>Restored Output</h3>
          <div style={{
            padding: "0.75rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "6px",
            fontFamily: "monospace",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            minHeight: "40px",
          }}>
            {restoredText}
          </div>
        </div>
      </div>
    ),
    title,
    entries,
    inputText,
    llmResponse,
    redactedText,
    restoredText,
  };
});
