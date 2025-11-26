# Store Mapper Improvements TODO

## Status: ✅ ALL COMPLETE

All 6 issues have been implemented and tested.

### Completed Issues

1. ✅ **Title placeholder** - Shows "(Untitled map)" when storeName is empty
2. ✅ **"No more entrances" button** - Toggle button to mark entrances complete
3. ✅ **Gray out already-added entrance buttons** - Disabled styling when position already used
4. ✅ **Photo analysis bug fix** - Removed auto-delete to prevent losing diffs after "Add all"
5. ✅ **"Add all from ALL photos" button** - Batch add non-conflicting aisles from all photos
6. ✅ **Item Locations UI** - Form to add new corrections with item name, correct aisle, incorrect aisle

## Technical Notes

### Photo Extraction Reactivity Bug
When `uploadedPhotos` array changes (from deleting photos), `photoExtractions.map()` re-evaluates and creates new `generateObject` calls, resetting all photos to "Analyzing..." state.

**Solution:** Don't auto-delete photos. Use `hidden` property workaround instead - mark photos as hidden rather than splicing from array.

**Root cause:** Framework map identity tracking issue - framework authors confirmed this needs fixing upstream.

## File Location
`patterns/jkomoros/store-mapper.tsx`
