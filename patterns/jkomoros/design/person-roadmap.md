# Person Pattern Enhancement - Feature Roadmap

## Vision Statement

**"A contact manager that learns from how you actually describe people."**

Most contact apps force you into rigid fields. CommonTools Person learns what matters to *you* by watching what you write in notes, then adapts its data model automatically. It's personal data that grows with you.

## Current State (Already Built ✓)

- Basic profile fields (name, email, phone, social media)
- Free-form notes with markdown editor
- LLM extraction from notes (manual trigger)
- Change preview with diff visualization
- Accept/Cancel workflow for extracted changes
- patternTool export for omnibot integration
- Bidirectional binding for all fields

## The Demo Story (5 minutes)

### Act 1: Natural Data Entry (1 min)
"Watch me add a contact the way I actually think about people..."

```
Action: Create new Person
Action: Paste into notes field:
  "Sarah Chen - worked with at Acme Corp on Phoenix project
  sarah.chen@acmecorp.com / +1-415-555-0123
  Now VP Eng at StartupCo
  Birthday: March 15
  @GitHub: schen @Twitter: sarahc
  Great at React, loves coffee, has 2 kids
  Met at React Conf 2019"

Result: Auto-extraction triggers on paste (no button click)
Result: Shows diff preview:
  - First Name: → Sarah
  - Last Name: → Chen
  - Email: → sarah.chen@acmecorp.com
  - Phone: → +1-415-555-0123
  - Birthday: → 1985-03-15 (inferred or asked)
  - GitHub: → schen
  - Twitter: → sarahc
  - Notes: → "Great at React, loves coffee, has 2 kids. Met at React Conf 2019"

Action: Click Accept
Result: Fields populate, notes cleaned to just unstructured parts
```

**Investor sees:**
- Natural text → structured data
- No forms to fill out
- AI extracts, human approves

### Act 2: The System Learns (2 min)
"Now I'll add a few more people..."

```
Action: Create "Marcus Lee"
Action: Paste:
  "Marcus Lee - also from Acme Corp on Phoenix project
  marcus@acmecorp.com
  Current company: TechCo
  Kids: 3 (always talks about them)"

Action: Create "David Kim"
Action: Paste:
  "David Kim - contractor on Phoenix project
  dave@freelance.com
  Current company: Self-employed
  Specializes in backend architecture"

Result: All three profiles now have "Current company" in notes
```

Now the magic:

```
Action: Click "Suggest New Fields" (lightning bolt icon)
Result: Modal appears:

  📊 Data Model Suggestions

  I found patterns across 3 profiles. Suggested new fields:

  ✓ "Current Company" (appears in 3/3 profiles)
    Sarah: "StartupCo"
    Marcus: "TechCo"
    David: "Self-employed"

  ✓ "Kids" (appears in 2/3 profiles)
    Sarah: "2"
    Marcus: "3"

  ✓ "Former Company" (appears in 3/3 profiles)
    All: "Acme Corp"

  ✓ "Project Connection" (appears in 3/3 profiles)
    All: "Phoenix project"

  [ ] Add "Current Company" field to schema
  [ ] Add "Kids" field to schema
  [ ] Add "Former Company" field to schema
  [ ] Add "Project Connection" field to schema

  [Cancel] [Add Selected Fields]
```

**Investor sees:**
- System analyzes patterns across all contacts
- Suggests new structured fields based on YOUR usage
- Data model adapts to how you think
- "This is like a CRM that learns your business"

### Act 3: Network Effects (1.5 min)
"Notice how Sarah mentioned 'Phoenix project'..."

```
Action: In Sarah's notes, type: "Worked with [[Marcus Lee]] and [[David Kim]]"
Result: As you type [[, autocomplete appears with other Person charms
Result: Names become clickable links (blue, underlined)

Action: Click on [[Marcus Lee]]
Result: Navigate to Marcus's person card
Result: Shows "Backlinks" section at bottom:
  "Referenced by: Sarah Chen"

Action: Navigate back to Sarah
Result: Shows "Mentions" section:
  "Marcus Lee, David Kim"
```

**Investor sees:**
- Building a personal knowledge graph
- Bi-directional linking (like Roam/Obsidian)
- Network of relationships emerges naturally
- "This is personal CRM meets second brain"

### Act 4: Voice of the User (30 sec)
"Now ask the system about these people..."

```
Action: Ask omnibot: "Who from my contacts worked at Acme Corp?"
Result: "Sarah Chen, Marcus Lee, and David Kim all worked at Acme Corp
         on the Phoenix project."

Action: Ask omnibot: "Extract Sarah's Twitter handle"
Result: *extracts and returns* "@sarahc"

Action: Ask omnibot: "Add a note to Marcus that he recommended a restaurant"
Result: *updates Marcus's notes*
```

**Investor sees:**
- Natural language over personal data
- No query language to learn
- Context-aware responses
- "ChatGPT for my contacts, but actually useful"

### Act 5: The Import Story (30 sec)
"This works with existing data too..."

```
Action: Drag a vCard file onto any Person card
Result: Shows preview:
  "Import detected:
   - Name: Jennifer Park
   - Email: jpark@company.com
   - Phone: +1-415-555-9999
   [Import] [Cancel]"

Action: Click Import
Result: Fields populate from vCard
```

**Investor sees:**
- Interoperable with existing systems
- Drag-and-drop simplicity
- Migration path from other CRMs

## Feature Roadmap

### Phase 1: Polish Existing (1-2 days)
*Goal: Fix the rough edges on what's already built*

#### 1.1 Extraction UX Improvements
- [x] Extract button exists
- [ ] **Auto-extract on paste** - Trigger extraction automatically when text is pasted into notes
- [ ] **Extract button above fold** - Move to header area with lightning bolt icon
- [ ] **Preserve exact remaining text** - Extraction should return EXACTLY the text that wasn't pulled out, character-for-character
- [ ] **Better diff rendering** - Current word-diff works, ensure it's prominent in preview modal

#### 1.2 Name Display Polish
- [x] displayName defaults to "First 'Nick' Last" computed value
- [ ] **Show nickname in quotes** - "Sarah 'Chef' Chen" format in [NAME]
- [ ] **Empty state handling** - If no name at all, show "Unnamed Person"

#### 1.3 Omnibot Integration
- [x] patternTool exists for extraction
- [ ] **Test omnibot commands**:
  - "Extract data from Sarah's notes"
  - "Update Marcus's email to xyz@example.com"
  - "Add a note to David that he recommended a restaurant"
- [ ] **Return meaningful results** - patternTool should return updated data, not just status

**Demo Impact:** Extraction feels magical, not clunky. Investors see polish.

---

### Phase 2: Meta-Analysis (2-3 days)
*Goal: System learns what fields matter based on actual usage*

#### 2.1 Pattern Discovery Engine
- [ ] **Cross-profile analyzer** - Scan all Person charms in space for repeated patterns
- [ ] **Smart extraction** - Use LLM to identify common concepts:
  ```
  Prompt: "Analyze these note excerpts and identify fields that appear
          in at least 2 profiles. Return field name, sample values,
          and frequency."
  ```
- [ ] **Field suggestion UI** - Modal showing:
  - Field name (e.g., "Current Company")
  - How many profiles have it (e.g., "3/10")
  - Sample values
  - Checkbox to add to schema
  - Preview of what would change

#### 2.2 Dynamic Schema Extension
- [ ] **Add fields to pattern dynamically** - When user accepts suggestions:
  ```typescript
  // This is the hard part - patterns have static schemas
  // Options:
  // A) Store custom fields in a { customFields: Record<string, any> }
  // B) Generate a new pattern with extended schema (advanced)
  // C) Use a flexible "properties: { [key]: { label, value } }[]" array
  ```
- [ ] **Backward compatibility** - Old Person charms still work after schema changes
- [ ] **Re-extraction** - After adding field, offer to re-extract all notes to populate it

#### 2.3 Meta-Analysis patternTool
- [ ] **Omnibot access** - "Suggest new person fields based on my contacts"
- [ ] **Continuous learning** - Suggestion button shows count: "3 new suggestions"

**Demo Impact:** "The CRM adapts to my business, not vice versa." This is the killer feature.

**Technical Challenge:** Dynamic schema extension is non-trivial in CTS. Consider using:
```typescript
type ProfileData = {
  // ... existing fields ...
  customFields: Default<Array<{ key: string; label: string; value: string }>, []>;
};
```

---

### Phase 3: Network Effects (2-3 days)
*Goal: Build a personal knowledge graph*

#### 3.1 @ Mentions in Notes
- [ ] **Integration with backlinks-index.tsx** - Use existing mentionable system
- [ ] **Autocomplete** - When typing `[[` or `@`, show list of Person charms
- [ ] **Clickable links** - Mentioned people are navigable
- [ ] **Backlinks section** - Show "Referenced by: [list of people who mention this person]"
- [ ] **Bi-directional updates** - Adding/removing mentions updates both ends

#### 3.2 Visual Network
- [ ] **Mentions section** - Show all people this person mentions
- [ ] **Shared connections** - "Sarah and Marcus both mention: David"
- [ ] **Visual graph (optional)** - D3.js network visualization of connections

#### 3.3 Omnibot Queries
- [ ] "Who knows Sarah?" → returns people who mention Sarah
- [ ] "Who do Sarah and Marcus both know?" → shared connections
- [ ] "Show me everyone from Acme Corp" → search across notes

**Demo Impact:** Personal CRM becomes personal knowledge graph. Investors see network effects.

**Technical Note:** Much of this already exists in backlinks-index.tsx. Need to integrate.

---

### Phase 4: Import/Export (1-2 days)
*Goal: Interoperability with existing systems*

#### 4.1 Drag-and-Drop Import
- [ ] **vCard support** - Drag .vcf file onto Person charm
- [ ] **Parse vCard** - Extract FN, EMAIL, TEL, BDAY, URL fields
- [ ] **Preview modal** - Show what will be imported before accepting
- [ ] **LinkedIn export** - Parse LinkedIn connection export CSV
- [ ] **Google Contacts** - Parse Google Contacts CSV

#### 4.2 Bulk Import
- [ ] **Import pattern** - Separate pattern for "Import Contacts"
- [ ] **Upload CSV** - Drag entire contact database
- [ ] **Mapping UI** - "CSV column 'Company' → Person field 'customFields.company'"
- [ ] **Batch creation** - Create multiple Person charms at once

#### 4.3 Export
- [ ] **Export to vCard** - Single person or entire space
- [ ] **Export to CSV** - For spreadsheet analysis
- [ ] **Export to JSON** - For developers

**Demo Impact:** "We can migrate your Salesforce/HubSpot data in minutes."

---

### Phase 5: Advanced Features (Nice-to-have)
*Goal: Differentiate from traditional CRM*

#### 5.1 Smart Reminders
- [ ] **Last contact tracking** - "You haven't talked to Sarah in 6 months"
- [ ] **Birthday reminders** - "Marcus's birthday is next week"
- [ ] **Follow-up prompts** - "You mentioned following up with David about X"

#### 5.2 Relationship Scoring
- [ ] **Strength indicator** - Based on mentions, recency, note length
- [ ] **Prioritization** - "Top 10 connections this month"
- [ ] **Decay detection** - "Connections at risk" (haven't contacted in >1 year)

#### 5.3 Context Enrichment
- [ ] **LinkedIn scraping** (with MCP?) - Auto-fill job history
- [ ] **Gmail integration** - Last email date, email count
- [ ] **Calendar integration** - Last meeting date
- [ ] **Social media** - Auto-fetch profile pictures from Twitter/GitHub

#### 5.4 Collaboration
- [ ] **Shared contacts** - Team members can see/edit shared Person charms
- [ ] **Activity log** - "Marcus updated by: Alex (2 hours ago)"
- [ ] **Permissions** - Some fields private, some shared

**Demo Impact:** Goes beyond "better contact manager" to "intelligent relationship OS."

---

## Implementation Priority for Investor Demo

### Must Have (Before Demo)
1. **Auto-extract on paste** (Phase 1.1) - Makes entry feel magical
2. **Meta-analysis suggestions** (Phase 2) - The "wow" moment
3. **@ Mentions** (Phase 3.1) - Shows network effects
4. **Drag-and-drop vCard** (Phase 4.1) - Shows interoperability
5. **Polish existing extraction** (Phase 1) - No rough edges

### Should Have (Nice to demo)
6. **Visual network graph** (Phase 3.2) - Eye candy for investors
7. **Omnibot integration tests** (Phase 1.3 & 3.3) - Shows voice UI
8. **Birthday reminders** (Phase 5.1) - Practical feature

### Can Defer (Post-demo)
- Bulk import (Phase 4.2)
- Relationship scoring (Phase 5.2)
- Context enrichment (Phase 5.3)
- Collaboration (Phase 5.4)

---

## Technical Architecture

### Enhanced ProfileData Schema

```typescript
type ProfileData = {
  // Basic identity (existing)
  displayName: Default<string, "">;
  givenName: Default<string, "">;
  familyName: Default<string, "">;
  nickname: Default<string, "">;
  pronouns: Default<string, "">;

  // Contact (existing)
  emails: Default<EmailEntry[], []>;
  phones: Default<PhoneEntry[], []>;

  // Social (existing)
  socialLinks: Default<SocialLink[], []>;

  // Metadata (existing)
  birthday: Default<string, "">;
  tags: Default<string[], []>;
  notes: Default<string, "">;
  photoUrl: Default<string, "">;

  // NEW: Dynamic fields
  customFields: Default<Array<{
    key: string;        // e.g., "currentCompany"
    label: string;      // e.g., "Current Company"
    value: string;      // e.g., "StartupCo"
    dataType: "text" | "number" | "date" | "url";
  }>, []>;

  // NEW: Network
  mentions: Default<Array<OpaqueRef<Person>>, []>;  // People this person mentions
  backlinks: Default<Array<OpaqueRef<Person>>, []>; // People who mention this person

  // NEW: Metadata
  lastModified: Default<string, "">;
  importSource: Default<string, "">; // "manual", "vCard", "LinkedIn", etc.
};
```

### Meta-Analysis Pattern

```typescript
// meta-analyzer.tsx - Separate pattern for cross-profile analysis

const MetaAnalyzer = recipe(
  "MetaAnalyzer",
  ({ personCharms }: { personCharms: Array<OpaqueRef<Person>> }) => {

    // Collect all notes from all Person charms
    const allNotes = derive(personCharms, (charms) => {
      return charms.map(c => ({
        id: c[ID],
        name: c.displayName || "Unnamed",
        notes: c.notes || "",
      }));
    });

    // LLM analysis to find patterns
    const suggestions = generateObject({
      system: `Analyze contact notes to suggest new structured fields.

      Look for patterns that appear in at least 2 profiles.
      For each pattern:
      - Suggest a field name (camelCase)
      - Suggest a display label
      - Provide sample values
      - Count how many profiles have this pattern

      Common patterns: company, job title, location, industry,
      relationship type, how you met, interests, etc.`,

      prompt: derive(allNotes, (notes) => {
        return str`Analyze these ${notes.length} contact profiles:

${notes.map(n => `--- ${n.name} ---\n${n.notes}\n`).join('\n')}

Suggest new fields based on patterns.`;
      }),

      model: "anthropic:claude-sonnet-4-5",

      schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fieldKey: { type: "string" },
                fieldLabel: { type: "string" },
                dataType: { type: "string", enum: ["text", "number", "date", "url"] },
                frequency: { type: "number" },
                samples: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      personName: { type: "string" },
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      [NAME]: "Contact Field Suggestions",
      [UI]: (/* suggestion UI */),
      suggestions: suggestions.result,
    };
  }
);
```

### Auto-Extract on Paste

```typescript
// In person pattern, add paste handler:

const handlePaste = handler<
  { detail: { value: string } },
  { notes: Cell<string>; extractTrigger: Cell<string> }
>(
  async ({ detail }, { notes, extractTrigger }) => {
    const pastedText = detail?.value ?? "";

    // Only auto-extract if paste is substantial
    if (pastedText.length > 50) {
      // Update notes first
      notes.set(pastedText);

      // Then trigger extraction
      extractTrigger.set(`${pastedText}\n---EXTRACT-${Date.now()}---`);
    }
  }
);

// In UI:
<ct-code-editor
  $value={notes}
  onct-paste={handlePaste({ notes, extractTrigger })}
  // ... other props
/>
```

---

## Demo Script (Detailed)

### Setup (Before investors arrive)
```bash
# Create demo space
export CT_API_URL="http://localhost:8000/"
export CT_IDENTITY="/Users/alex/Code/labs/claude.key"

deno task ct charm new \
  --space alex-person-demo-v2 \
  /Users/alex/Code/recipes/recipes/alex/WIP/person-updated.tsx
```

### Script

**[0:00 - Introduction]**
"Contact managers force you into their rigid fields. What if your CRM learned what fields *you* need by watching how you describe people? Let me show you."

**[0:30 - Act 1: Natural Entry]**
*Create new Person charm*
"I'll add a contact the way I actually think about them..."
*Paste Sarah's info into notes*
"Watch - no forms, just natural text."
*Auto-extraction triggers*
"The system extracts structured data automatically. I can review and approve."
*Show diff, click Accept*
"Fields populated, notes cleaned. That's how it should work."

**[2:00 - Act 2: System Learns]**
"Now I'll add a couple more people..."
*Add Marcus and David*
"Notice I mentioned 'Current Company' for all three. The system notices too."
*Click "Suggest New Fields" button*
"Here's the magic: it analyzed all my contacts and found patterns."
*Show suggestions modal*
"'Current Company' appears in 3 out of 3 profiles. Same with 'Former Company' and 'Phoenix project'."
"I can add these as structured fields with one click."
*Click "Add Selected Fields"*
"Now my CRM adapts to MY business, not the other way around."

**[3:30 - Act 3: Network Effects]**
"These people worked together. Let me connect them..."
*In Sarah's notes, type [[Marcus*
"I can link contacts together using @ mentions."
*Autocomplete shows Marcus, select it*
*Type [[David, select*
"Now Sarah's profile shows her connections."
*Click on Marcus link*
"And Marcus's profile shows he's referenced by Sarah."
"It's building a personal knowledge graph automatically."

**[4:30 - Act 4: Voice Interface]**
"Ask the system questions in natural language..."
*Ask omnibot: "Who from my contacts worked at Acme Corp?"*
"It searches across all contacts and understands context."
*Ask: "Extract Sarah's Twitter handle"*
"It can interact with individual profiles too."

**[5:00 - Closing]**
"This is just contact management. But the same principles apply to anything:
- Projects that learn what fields matter
- Notes that suggest their own structure
- Data models that adapt to you

That's the CommonTools vision: software that learns from how you work."

---

## Success Metrics

### For Demo
- [ ] Can complete full 5-minute demo without errors
- [ ] Auto-extraction triggers < 1 second after paste
- [ ] Meta-analysis finds 3+ valid suggestions
- [ ] @ mention autocomplete feels instant
- [ ] Omnibot answers correctly
- [ ] No crashes, no loading spinners > 3 seconds

### For Production
- [ ] Users create 10+ contacts (adoption)
- [ ] 50%+ use auto-extract feature (engagement)
- [ ] 30%+ accept meta-analysis suggestions (validation)
- [ ] 40%+ use @ mentions (network effects)
- [ ] Average 5+ custom fields per user (personalization)

---

## Investor Talking Points

### What Makes This Special?

1. **Adaptive Data Model**
   - Traditional CRM: "Here are 50 fields, figure it out"
   - CommonTools: "I noticed you mention X a lot, want a field for it?"

2. **Natural Input**
   - Traditional: Click 15 form fields
   - CommonTools: Paste natural text, system extracts

3. **Network Effects**
   - Traditional: Contacts are isolated records
   - CommonTools: Personal knowledge graph emerges naturally

4. **Privacy-First AI**
   - Traditional: Your data uploaded to vendor cloud
   - CommonTools: Analysis happens locally, you control everything

5. **Living Software**
   - Traditional: Software is static, you adapt to it
   - CommonTools: Software adapts to you over time

### Market Positioning

- **Not competing with**: Salesforce, HubSpot (too enterprise)
- **Competing with**: Clay.com, Folk, Obsidian + notion + simple CRM
- **Better than**: Monica CRM, Dex, personal CRM tools
- **Unique angle**: Only CRM with adaptive schema based on your usage

### Business Model (if asked)

- **Today**: Platform play (sell the framework)
- **Tomorrow**: Templates marketplace (e.g., "Recruiter's Person Pattern")
- **Future**: Hosted version with team collaboration

---

## Files to Create

```
/Users/alex/Code/recipes/recipes/alex/WIP/
├── person-updated.tsx              # Start here, enhance this one
├── meta-analyzer.tsx               # New: Cross-profile pattern discovery
├── person-import.tsx               # New: vCard/CSV import pattern
├── person-enhancement-roadmap.md   # This file
└── demo/
    ├── sarah-chen.txt             # Sample paste data
    ├── marcus-lee.txt             # Sample paste data
    ├── david-kim.txt              # Sample paste data
    └── demo-script.md             # Speaker notes
```

---

## Next Steps

**Ready to start? Here's the recommended order:**

1. **Quick wins first** (1 day):
   - [ ] Auto-extract on paste (Phase 1.1)
   - [ ] Extract button above fold (Phase 1.1)
   - [ ] Test omnibot integration (Phase 1.3)

2. **The wow feature** (2 days):
   - [ ] Build meta-analyzer.tsx (Phase 2)
   - [ ] Add "Suggest Fields" button to person pattern
   - [ ] Implement customFields in schema

3. **Network effects** (1-2 days):
   - [ ] Integrate backlinks-index.tsx (Phase 3.1)
   - [ ] Add mentions/backlinks sections to UI
   - [ ] Test @ mention autocomplete

4. **Polish & practice** (1 day):
   - [ ] Create sample paste files
   - [ ] Run through demo script 5x
   - [ ] Time each section
   - [ ] Prepare fallback plan

**Total: 5-6 days to demo-ready**

Let me know which phase you want to tackle first!
