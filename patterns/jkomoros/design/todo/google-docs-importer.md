# Google Docs to Markdown Importer - Design Doc

## Overview

A pattern that imports Google Docs and converts them to markdown notes, including comment threads.

## Architecture Decision: Reuse vs Custom

### Option A: Extend Existing Infrastructure (RECOMMENDED)

We already have significant Google Docs infrastructure in this workspace:

- **`util/google-auth-manager.tsx`** - Handles OAuth with drive/docs scopes
- **`google-docs-comment-orchestrator.tsx`** - Has `GoogleDocsClient` class that:
  - Fetches document content via Docs API
  - Fetches comments via Drive API
  - Handles authentication, rate limiting, retries
  - Has `extractDocText()` for basic text extraction

**Recommendation**: Extract and extend the existing client, add markdown conversion logic.

### Option B: Build from scratch

Not recommended - would duplicate ~300 lines of auth/API code.

---

## Implementation Plan

### Phase 1: Create Google Docs Markdown Client

Create `util/google-docs-markdown-client.ts` that:
1. Extends/imports the existing Google Docs API infrastructure
2. Adds proper markdown conversion from Google Docs JSON structure
3. Handles:
   - Headings (HEADING_1 through HEADING_6)
   - Paragraphs with text formatting (bold, italic, links)
   - Lists (ordered and unordered) with nesting
   - Tables
   - Horizontal rules
   - Images (as markdown links)

### Phase 2: Comment Integration

Port comment extraction logic from the Apps Script:
1. Fetch comments via Drive API v3 (already implemented)
2. Map comments to positions in document (by quotedFileContent)
3. Interleave comment threads with content in markdown output

### Phase 3: Main Pattern

Create `WIP/google-docs-importer.tsx` with:
- URL input for Google Doc
- Auth UI (via createGoogleAuth)
- Import button
- Preview of generated markdown
- Option to save as a Note charm (navigate to new Note with content)

---

## Technical Details

### Google Docs API JSON Structure

The Google Docs API returns a document object with this structure:
```typescript
interface GoogleDocsDocument {
  body: {
    content: StructuralElement[];
  };
}

interface StructuralElement {
  startIndex: number;
  endIndex: number;
  paragraph?: Paragraph;
  table?: Table;
  sectionBreak?: SectionBreak;
}

interface Paragraph {
  paragraphStyle: {
    namedStyleType?: string; // "HEADING_1", "NORMAL_TEXT", etc.
  };
  elements: ParagraphElement[];
  bullet?: {
    listId: string;
    nestingLevel: number;
  };
}

interface ParagraphElement {
  textRun?: {
    content: string;
    textStyle?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      link?: { url: string };
    };
  };
}

interface Table {
  rows: number;
  columns: number;
  tableRows: TableRow[];
}
```

### Markdown Conversion Algorithm

```
For each StructuralElement in body.content:
  if paragraph:
    if bullet:
      → List item with nesting (- or 1.)
    elif heading style:
      → # ## ### etc based on HEADING_1-6
    else:
      → Regular paragraph with inline formatting
  elif table:
    → Markdown table with | separators and --- header row
  elif sectionBreak:
    → Horizontal rule ---
```

### Comment Interleaving Strategy

1. After fetching comments, build a map: quotedText → comment[]
2. During markdown generation, after each paragraph:
   - Check if any quoted text appears in that paragraph
   - If yes, insert formatted comment thread as blockquote
3. Append orphan comments (without matching quotes) at end

---

## Required Scopes

- `drive` - To read comments via Drive API
- `docs` - To read document content via Docs API

Same scopes as `google-docs-comment-orchestrator.tsx`.

---

## UI Mockup

```
┌─────────────────────────────────────────────┐
│ Google Docs Markdown Importer               │
├─────────────────────────────────────────────┤
│ [Google Auth Status]                        │
│                                             │
│ Document URL:                               │
│ [https://docs.google.com/document/d/...]    │
│                                             │
│ Options:                                    │
│ [x] Include comments                        │
│ [ ] Include resolved comments               │
│                                             │
│ [Import Document]                           │
├─────────────────────────────────────────────┤
│ Preview:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ # Document Title                        │ │
│ │                                         │ │
│ │ This is paragraph text with **bold**... │ │
│ │                                         │ │
│ │ > 💬 Comment Thread                     │ │
│ │ > **Author** (date): Comment text       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Copy to Clipboard] [Save as Note]          │
└─────────────────────────────────────────────┘
```

---

## Files to Create/Modify

1. **NEW**: `util/google-docs-markdown.ts` - Markdown conversion utilities
2. **NEW**: `WIP/google-docs-importer.tsx` - Main pattern
3. **REFERENCE**: `google-docs-comment-orchestrator.tsx` - Borrow client code
4. **REFERENCE**: `util/google-auth-manager.tsx` - Use for auth

---

## Open Questions

1. Should we create a new Note charm with the imported content, or just show/copy the markdown?
   - **Decision**: Both - show preview + copy button + "Save as Note" button

2. Handle document images?
   - Images in Google Docs are referenced by URL
   - Option: Convert to markdown image syntax `![alt](url)`
   - Caveat: URLs may require auth - might break when viewing outside
   - **Decision**: Include images as links, warn about auth

3. Handle document tabs (newer Google Docs feature)?
   - Only process first tab initially
   - Could add tab selector in v2

---

## Status

- [x] Research existing infrastructure
- [x] Design document created
- [ ] Create `util/google-docs-markdown.ts`
- [ ] Create `WIP/google-docs-importer.tsx`
- [ ] Test with sample documents
- [ ] Handle edge cases (empty docs, large docs, no comments)
