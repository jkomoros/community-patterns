# TODO: GPS-Based Store Mapping Sharing Demo

## Concept
Demonstrate that if someone has already mapped a store at a specific GPS location, other users visiting that same location can benefit from the existing mapping.

## Demo Flow (Faked for Now)

### User Experience
1. User opens shopping list app
2. App detects GPS location (or user selects from a list of "nearby stores")
3. **If mapping exists at this location:**
   - Show notification: "✨ Good news! Someone has already mapped this store"
   - Button: "Use Existing Mapping"
   - Show preview of the store layout (aisles, sections)
   - One-click to import the mapping
4. **If no mapping exists:**
   - Show: "Be the first to map this store and help others!"
   - Button: "Map This Store"

### Mock Implementation Strategy

#### Phase 1: Fake GPS Detection
```typescript
const mockLocations = {
  "kroger-main-st": {
    lat: 37.7749,
    lng: -122.4194,
    storeName: "Kroger Main St",
    hasMappingAvailable: true,
  },
  "safeway-downtown": {
    lat: 37.7833,
    lng: -122.4167,
    storeName: "Safeway Downtown",
    hasMappingAvailable: false,
  },
  "whole-foods-market": {
    lat: 37.7858,
    lng: -122.4064,
    storeName: "Whole Foods Market",
    hasMappingAvailable: true,
  }
};

// In the pattern, fake "detect current location"
const currentLocation = mockLocations["kroger-main-st"];
```

#### Phase 2: Mock Mapping Database
```typescript
const existingMappings = {
  "kroger-main-st": {
    mappedBy: "Anonymous User #1234",
    mappedAt: "2025-11-05",
    outline: `# Aisle 1 - Produce
Fresh fruits, vegetables...

# Aisle 2 - Bakery
Bread, bagels, donuts...

# Aisle 3 - Dairy & Eggs
...`,
    confidence: 0.95, // How many users have verified this mapping
    usageCount: 47, // How many people have used it
  },
  "whole-foods-market": {
    mappedBy: "Anonymous User #5678",
    mappedAt: "2025-11-08",
    outline: `# Section 1 - Organic Produce
...`,
    confidence: 0.88,
    usageCount: 23,
  }
};
```

#### Phase 3: UI Components

**StoreLocationPicker Component:**
- Shows list of "nearby" stores (from mock data)
- Each store shows:
  - Store name
  - Distance (faked: "0.2 miles away")
  - Mapping status: ✅ "Mapped by 47 shoppers" or ⚠️ "Not yet mapped"

**MappingAvailableNotification:**
```tsx
<div style="background: #e8f5e9; padding: 1rem; border-radius: 8px; border: 2px solid #4caf50;">
  <div style="font-weight: 600; color: #2e7d32;">
    ✨ This store has been mapped!
  </div>
  <div style="font-size: 14px; color: #555; margin-top: 0.5rem;">
    47 shoppers have used this mapping. Last updated 5 days ago.
  </div>
  <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
    <ct-button variant="primary" onclick={loadExistingMapping}>
      Use This Mapping
    </ct-button>
    <ct-button variant="secondary" onclick={previewMapping}>
      Preview Layout
    </ct-button>
  </div>
</div>
```

**NoMappingNotification:**
```tsx
<div style="background: #fff3e0; padding: 1rem; border-radius: 8px; border: 2px solid #ff9800;">
  <div style="font-weight: 600; color: #e65100;">
    🗺️ This store hasn't been mapped yet
  </div>
  <div style="font-size: 14px; color: #555; margin-top: 0.5rem;">
    Be the first to map this store and help other shoppers!
  </div>
  <div style="margin-top: 1rem;">
    <ct-button variant="primary" onclick={startMapping}>
      Map This Store
    </ct-button>
  </div>
</div>
```

#### Phase 4: Integration with Shopping List Launcher

Add to `shopping-list-launcher.tsx`:

```typescript
interface LauncherInput {
  items: Default<ShoppingItem[], []>;
  storeOutline: Default<string, "">;
  storeName: Default<string, "Kroger Main St">;
  gpsLocation?: { lat: number; lng: number };  // NEW
  useSharedMapping?: Default<boolean, false>;   // NEW
}

// Check if mapping exists for current location
const locationKey = getLocationKey(gpsLocation);
const existingMapping = existingMappings[locationKey];

// If mapping exists, show notification
const showMappingNotification = !!existingMapping;
```

## Demo Script

### Scenario 1: Store Already Mapped
1. User: "I'm at Kroger Main St"
2. App: Detects location (mocked)
3. App: Shows "✨ This store has been mapped by 47 shoppers!"
4. User: Clicks "Use This Mapping"
5. App: Loads store outline automatically
6. User: Adds items to list, clicks "Sort by Aisle"
7. App: Items are pre-sorted because mapping exists!

### Scenario 2: Unmapped Store
1. User: "I'm at Safeway Downtown"
2. App: Detects location (mocked)
3. App: Shows "🗺️ This store hasn't been mapped yet"
4. User: Clicks "Map This Store"
5. App: Opens store-mapper tool
6. User: Maps the store using photo wizard
7. App: "Great! Your mapping will help future shoppers at this location"

## Technical Notes

### Future (Real Implementation)
When this becomes real, we'd need:
- Real GPS API integration (navigator.geolocation)
- Backend database to store/retrieve mappings by lat/lng
- Privacy considerations (anonymous contributions)
- Mapping verification system (upvotes/downvotes)
- Conflict resolution (multiple mappings for same location)
- Store chain intelligence (all Krogers might share similar layouts)

### For Now (Demo)
Keep everything client-side and hardcoded:
- Mock GPS data
- Fake mapping database in pattern
- Simulate the UX without backend
- Focus on showing the value proposition

## Success Metrics (for Demo)
- Clearly shows the "network effect" value
- User understands they're benefiting from community mapping
- Encourages users to contribute their own mappings
- Feels magical when mapping "just works"

## Files to Modify
- `shopping-list-launcher.tsx` - Add GPS detection and mapping lookup
- `store-mapper.tsx` - Add "save for others" messaging
- New: `store-location-picker.tsx` - Component for selecting nearby stores
- New: `gps-store-demo.tsx` - Standalone demo of the full flow
