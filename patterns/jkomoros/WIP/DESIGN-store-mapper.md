# Store Mapper - Design Document

## Goal

Create a pattern that helps users map their grocery store layout for use with aisle-sorted shopping lists. The map should be easy to create through natural interaction (typing/pasting OR photos) and use AI to help users identify missing sections.

## Problem Statement

Current shopping-list-launcher.tsx has a hardcoded `KROGER_OUTLINE`. Users shopping at different stores (Safeway, Whole Foods, local markets) need to create their own store maps. Manually typing structured layouts is tedious.

## Design Principles

1. **Natural Input First**: Users should be able to just talk/paste/type naturally
2. **AI as Assistant**: AI helps organize and validate, doesn't force a rigid flow
3. **Flexible Methods**: Support both text input AND photo capture
4. **Smart Suggestions**: AI detects gaps and missing sections, but user has final say
5. **Simple Data Model**: Just name + description per aisle

## User Experience

### Main Interface

```
┌─────────────────────────────────────────────────────┐
│ 🗺️ Store Map                                        │
│                                                     │
│ Store Name: [Kroger Main St_______________]        │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Aisle 1 - Produce                      [×]  │   │
│ │ ┌───────────────────────────────────────┐   │   │
│ │ │ Fruits, vegetables, salads, herbs,    │   │   │
│ │ │ organic produce                       │   │   │
│ │ └───────────────────────────────────────┘   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Aisle 2 - Bakery                       [×]  │   │
│ │ ┌───────────────────────────────────────┐   │   │
│ │ │ Bread, bagels, tortillas, cakes       │   │   │
│ │ └───────────────────────────────────────┘   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ [+ Add Aisle]  [📷 Add from Photo]                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⚠️ Possibly Missing:                                │
│ [Aisle 3] [Dairy] [Deli] [Pharmacy]                │
│                                                     │
│ Not in this store: Frozen Foods, Aisle 7           │
└─────────────────────────────────────────────────────┘
```

### Interactions

**Adding Aisles Manually:**
1. Click [+ Add Aisle]
2. Type name: "Aisle 1 - Produce"
3. Type description: "fruits, veggies, herbs"
4. Or paste full outline and let AI parse it

**Adding from Photo:**
1. Click [📷 Add from Photo]
2. Upload one or more aisle sign photos
3. AI extracts text: "AISLE 5 | Frozen Foods • Ice Cream"
4. AI figures out where to insert (after Aisle 4, or at end)
5. New aisle appears with extracted info
6. User can edit if needed

**Handling Suggestions:**
- Click suggestion tag `[Aisle 3]` → Adds empty Aisle 3 entry, focuses cursor
- Click `×` on suggestion → Adds to "Not in Store" list, tag disappears, AI won't suggest again

**Natural Text Parsing:**
User can paste this:
```
Aisle 1 - Produce: fruits, vegetables
Aisle 2 - Bakery: bread, pastries
Bakery Department
bread, cakes, donuts
```

AI parses and creates appropriate aisle entries.

## Data Model

```typescript
interface StoreAisle {
  name: string;                      // "Aisle 1 - Produce" or "Bakery"
  description: Default<string, "">;  // Freeform what's in this aisle
}

interface StoreMapInput {
  storeName: Default<string, "">;
  aisles: Default<StoreAisle[], []>;
  notInStore: Default<string[], []>;  // Sections confirmed to NOT exist
}

interface StoreMapOutput extends StoreMapInput {
  // Formatted outline for shopping-list to consume
  outline: string;  // "# Aisle 1 - Produce\nfruits, vegetables\n\n# Aisle 2..."
}
```

## AI Features

### 1. Missing Section Detection

Continuously analyzes the map and suggests missing sections as tags at the bottom.

**Detection Logic:**
- **Gap Detection**: Aisle 1, 2, 4 → suggest "Aisle 3"
- **Common Sections**: Check for typical departments (Produce, Bakery, Deli, Dairy, Meat, Pharmacy)
- **Respect Exclusions**: Don't suggest anything in `notInStore` array

**LLM Call:**
```typescript
const detectedMissing = llm({
  system: `Analyze store map. Return array of likely missing sections.

  Check for:
  1. Numbered aisle gaps (1,2,4 → missing 3)
  2. Common departments not listed: Produce, Bakery, Deli, Meat, Dairy, Pharmacy, Frozen

  CRITICAL: Do NOT suggest anything in "Not in Store" list.

  Return ONLY high-confidence suggestions. Max 5 suggestions.`,

  messages: [{
    role: "user",
    content: str`Store: ${storeName}

Aisles:
${aisles.map(a => `${a.name}: ${a.description}`).join('\n')}

Not in Store: ${notInStore.join(', ') || 'None'}

What sections are likely missing?`
  }],

  model: "anthropic:claude-sonnet-4-5"
});

const missingSections = derive(detectedMissing.result, (result) => {
  if (!result || typeof result !== 'string') return [];
  // Parse LLM response into array of section names
  return result.split('\n').map(s => s.trim()).filter(Boolean);
});
```

### 2. Photo Text Extraction

When user uploads photo, extract aisle information and merge into map.

**Vision LLM Call:**
```typescript
const photoData = cell<string>("");  // Base64 from file upload

const extractedAisle = generateObject({
  model: "google:gemini-2.5-pro",  // Vision model

  messages: [{
    role: "user",
    content: [
      {
        type: "text",
        text: "Extract aisle information from this grocery store sign. Return the aisle name and list of product categories shown."
      },
      {
        type: "image",
        image: photoData  // Base64 string
      }
    ]
  }],

  schema: {
    type: "object",
    properties: {
      name: { type: "string" },       // "Aisle 5 - Frozen Foods"
      description: { type: "string" } // "Ice cream, frozen vegetables, frozen meals, pizza"
    }
  }
});
```

**Auto-Insertion Logic:**
```typescript
const handlePhotoExtracted = handler<
  unknown,
  { extractedAisle: any, aisles: Cell<StoreAisle[]> }
>((_event, { extractedAisle, aisles }) => {
  const data = extractedAisle;
  if (!data?.name) return;

  // Extract aisle number if present
  const aisleNum = data.name.match(/Aisle\s+(\d+)/)?.[1];

  if (aisleNum) {
    // Find where to insert (after previous aisle number)
    const currentAisles = aisles.get();
    let insertIdx = currentAisles.length;

    for (let i = 0; i < currentAisles.length; i++) {
      const existingNum = currentAisles[i].name.match(/Aisle\s+(\d+)/)?.[1];
      if (existingNum && parseInt(existingNum) > parseInt(aisleNum)) {
        insertIdx = i;
        break;
      }
    }

    // Insert at correct position
    const updated = [...currentAisles];
    updated.splice(insertIdx, 0, {
      name: data.name,
      description: data.description || ""
    });
    aisles.set(updated);
  } else {
    // Non-numbered section, add at end
    aisles.push({
      name: data.name,
      description: data.description || ""
    });
  }
});
```

### 3. Natural Text Parsing (Optional Enhancement)

User pastes bulk text, AI parses into aisles:

```typescript
const parseBulkText = handler<
  { detail: { text: string } },
  { aisles: Cell<StoreAisle[]> }
>(({ detail }, { aisles }) => {
  // Could trigger LLM to parse free-form text into structured aisles
  // But might not be needed if user can just manually add them
});
```

## Technical Considerations

### Image Upload Flow

1. User clicks [📷 Add from Photo]
2. `common-input-file` opens file picker (or camera on mobile)
3. Component loads image as base64
4. Handler receives `{filesContent: [{content: base64String}]}`
5. For each photo:
   - Trigger vision LLM extraction
   - Show "Processing..." indicator
   - When result arrives, auto-insert aisle
   - User can edit if extraction was wrong

### Camera vs Upload

`common-input-file` with `accept="image/*"`:
- Desktop: Opens file picker
- Mobile: **May** offer camera option (browser-dependent)
- Can add `capture="environment"` attribute for direct camera on mobile

If we want explicit camera button:
```html
<input type="file" accept="image/*" capture="environment">
```

This would need a custom web component wrapping the native input.

## Implementation Plan

### Phase 1: Basic Manual Entry (30 min)
- [ ] Create store-mapper.tsx pattern
- [ ] Store name input
- [ ] Aisle array with name + description
- [ ] Add/remove aisle handlers
- [ ] Bidirectional binding on name and description
- [ ] Export formatted outline

### Phase 2: Missing Section Detection (45 min)
- [ ] LLM call to detect missing sections
- [ ] Parse response into array of suggestions
- [ ] Render suggestion tags at bottom
- [ ] Click tag → add aisle
- [ ] Click × → add to notInStore
- [ ] Filter suggestions by notInStore list
- [ ] Show "Not in this store: X, Y, Z" list

### Phase 3: Photo Upload & Vision Extraction (60 min)
- [ ] Add `common-input-file` component
- [ ] Handler to receive base64 images
- [ ] Vision LLM call with image content
- [ ] Auto-insertion logic (find correct position)
- [ ] Processing indicator while extracting
- [ ] Handle multiple photos in batch

### Phase 4: Polish & Testing (30 min)
- [ ] Gap detection for numbered aisles
- [ ] Auto-sort numbered aisles if out of order
- [ ] Test with various input methods
- [ ] Test with real photos (if available)
- [ ] Export outline format compatible with shopping-list

### Phase 5: Integration (30 min)
- [ ] Link store-mapper to shopping-list-launcher
- [ ] Replace hardcoded KROGER_OUTLINE with mapped store
- [ ] Allow selecting from multiple saved store maps
- [ ] Test end-to-end aisle sorting with custom map

## Open Questions

1. **Photo quality**: Will photos of aisle signs work well enough? (Need real-world testing)
2. **Multi-store**: Should users be able to save multiple store maps?
3. **Sharing**: Should store maps be shareable between users?
4. **Mobile camera**: Do we need custom web component or is `accept="image/*"` enough?
5. **Outline format**: Should match current KROGER_OUTLINE structure or improve it?

## Success Criteria

✅ User can create store map by typing aisle names and descriptions
✅ User can upload photos of aisle signs to auto-populate
✅ AI detects and suggests missing sections (numbered gaps + common departments)
✅ User can dismiss suggestions that don't apply to their store
✅ AI respects dismissed suggestions (doesn't re-suggest)
✅ Exported outline works with shopping-list aisle sorting
✅ Testing with 2-3 different store layouts

## Future Enhancements

- Drag-to-reorder aisles manually
- Store photos for visual reference
- Multi-store management (home, work, vacation)
- Collaborative maps (share with household)
- Learn from shopping patterns (frequently bought together → same aisle)

---

**Status**: Design complete, ready to implement Phase 1
