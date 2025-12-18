/// <cts-enable />
/**
 * Record Pattern - A data-up meta-container for accumulating data.
 *
 * Start with just notes, add structure over time. A record becomes a
 * person record, project record, etc. by adding relevant sub-charms.
 *
 * Goals:
 * - G1: Stable entity handle (charm ID stays same as sub-charms change)
 * - G2: Bottom-up data accumulation (start minimal, grow structure)
 * - G3: Layout management (tabbed for now, more layouts later)
 *
 * #record
 */

import {
  Cell,
  computed,
  type Default,
  derive,
  handler,
  ifElse,
  NAME,
  recipe,
  str,
  UI,
} from "commontools";
import { getAvailableTypes, getDefinition } from "./sub-charms/registry.ts";
import type {
  AddressData,
  BirthdayData,
  ContactData,
  EnabledSubCharms,
  GiftPrefsData,
  LinkData,
  LocationData,
  ModuleType,
  RatingData,
  RecordContext,
  RecordInput,
  RelationshipData,
  SocialData,
  StatusData,
  SubCharmType,
  TagsData,
  TimelineData,
  TimingData,
} from "./types/record-types.ts";

interface RecordOutput {
  title: Default<string, "">;
  notes: Default<string, "">;
  enabledSubCharms: Default<EnabledSubCharms, []>;
  pinnedModules: Default<ModuleType[], ["notes"]>; // Pinned modules for adaptive layout
  birthdayData: Default<BirthdayData, { birthDate: ""; birthYear: null }>;
  ratingData: Default<RatingData, { rating: null }>;
  tagsData: Default<TagsData, { tags: [] }>;
  contactData: Default<ContactData, { email: ""; phone: ""; website: "" }>;
  // Wave 2 modules
  statusData: Default<StatusData, { status: "" }>;
  addressData: Default<AddressData, { street: ""; city: ""; state: ""; zip: "" }>;
  timelineData: Default<TimelineData, { startDate: ""; targetDate: ""; completedDate: "" }>;
  socialData: Default<SocialData, { platform: ""; handle: ""; url: "" }>;
  linkData: Default<LinkData, { url: ""; linkTitle: ""; description: "" }>;
  // Wave 3 modules
  locationData: Default<LocationData, { locationName: ""; locationAddress: ""; coordinates: "" }>;
  relationshipData: Default<RelationshipData, { relationTypes: []; closeness: ""; howWeMet: ""; innerCircle: false }>;
  giftPrefsData: Default<GiftPrefsData, { giftTier: ""; favorites: []; avoid: [] }>;
  timingData: Default<TimingData, { prepTime: null; cookTime: null; restTime: null }>;
}

const Record = recipe<RecordInput, RecordOutput>(
  "Record",
  ({ title, notes, enabledSubCharms, pinnedModules, birthdayData, ratingData, tagsData, contactData, statusData, addressData, timelineData, socialData, linkData, locationData, relationshipData, giftPrefsData, timingData }) => {
    // Active tab - "notes" is always first, then sub-charm types
    const activeTab = Cell.of<string>("notes");

    // Selected type for the "Add" dropdown
    const selectedAddType = Cell.of<string>("");

    // Add sub-charm handler - just adds to enabledSubCharms list
    const addSubCharm = handler<
      { detail: { value: string } },
      {
        enabledSubCharms: Cell<EnabledSubCharms>;
        activeTab: Cell<string>;
        selectedAddType: Cell<string>;
      }
    >(({ detail }, { enabledSubCharms, activeTab, selectedAddType }) => {
      const type = detail?.value as SubCharmType;
      if (!type) return;

      const current = enabledSubCharms.get();

      // Check if type already exists (singleton sub-charms)
      if (current.includes(type)) {
        return;
      }

      enabledSubCharms.set([...current, type]);

      // Switch to the new tab
      activeTab.set(type);

      // Reset the select
      selectedAddType.set("");
    });

    // Handler for birthday year input (number conversion)
    const updateBirthYear = handler<
      { detail: { value: string } },
      { birthdayData: Cell<BirthdayData> }
    >(({ detail }, { birthdayData }) => {
      const val = detail?.value;
      const current = birthdayData.get();
      birthdayData.set({
        ...current,
        birthYear: val ? parseInt(val, 10) : null,
      });
    });

    // Handler for birthday date input
    const updateBirthDate = handler<
      { detail: { value: string } },
      { birthdayData: Cell<BirthdayData> }
    >(({ detail }, { birthdayData }) => {
      const val = detail?.value ?? "";
      const current = birthdayData.get();
      birthdayData.set({
        ...current,
        birthDate: val,
      });
    });

    // ===== Rating handlers =====
    const updateRating = handler<
      { detail: { value: string } },
      { ratingData: Cell<RatingData> }
    >(({ detail }, { ratingData }) => {
      const val = detail?.value;
      ratingData.set({
        rating: val ? parseInt(val, 10) : null,
      });
    });

    // ===== Tags handlers =====
    const tagInput = Cell.of<string>("");

    const addTag = handler<
      { detail: { value: string } },
      { tagsData: Cell<TagsData> }
    >(({ detail }, { tagsData }) => {
      const newTag = detail?.value?.trim();
      if (!newTag) return;
      const current = tagsData.get();
      if (!current.tags.includes(newTag)) {
        tagsData.set({ ...current, tags: [...current.tags, newTag] });
      }
    });

    const removeTag = handler<
      Record<string, never>,
      { tagsData: Cell<TagsData>; tag: string }
    >((_event, { tagsData, tag }) => {
      const current = tagsData.get();
      tagsData.set({ ...current, tags: current.tags.filter((t: string) => t !== tag) });
    });

    // ===== Contact handlers =====
    const updateEmail = handler<
      { detail: { value: string } },
      { contactData: Cell<ContactData> }
    >(({ detail }, { contactData }) => {
      const current = contactData.get();
      contactData.set({ ...current, email: detail?.value ?? "" });
    });

    const updatePhone = handler<
      { detail: { value: string } },
      { contactData: Cell<ContactData> }
    >(({ detail }, { contactData }) => {
      const current = contactData.get();
      contactData.set({ ...current, phone: detail?.value ?? "" });
    });

    const updateWebsite = handler<
      { detail: { value: string } },
      { contactData: Cell<ContactData> }
    >(({ detail }, { contactData }) => {
      const current = contactData.get();
      contactData.set({ ...current, website: detail?.value ?? "" });
    });

    // ===== Status handlers =====
    const updateStatus = handler<
      { detail: { value: string } },
      { statusData: Cell<StatusData> }
    >(({ detail }, { statusData }) => {
      statusData.set({ status: detail?.value ?? "" });
    });

    // ===== Address handlers =====
    const updateStreet = handler<
      { detail: { value: string } },
      { addressData: Cell<AddressData> }
    >(({ detail }, { addressData }) => {
      const current = addressData.get();
      addressData.set({ ...current, street: detail?.value ?? "" });
    });

    const updateCity = handler<
      { detail: { value: string } },
      { addressData: Cell<AddressData> }
    >(({ detail }, { addressData }) => {
      const current = addressData.get();
      addressData.set({ ...current, city: detail?.value ?? "" });
    });

    const updateState = handler<
      { detail: { value: string } },
      { addressData: Cell<AddressData> }
    >(({ detail }, { addressData }) => {
      const current = addressData.get();
      addressData.set({ ...current, state: detail?.value ?? "" });
    });

    const updateZip = handler<
      { detail: { value: string } },
      { addressData: Cell<AddressData> }
    >(({ detail }, { addressData }) => {
      const current = addressData.get();
      addressData.set({ ...current, zip: detail?.value ?? "" });
    });

    // ===== Timeline handlers =====
    const updateStartDate = handler<
      { detail: { value: string } },
      { timelineData: Cell<TimelineData> }
    >(({ detail }, { timelineData }) => {
      const current = timelineData.get();
      timelineData.set({ ...current, startDate: detail?.value ?? "" });
    });

    const updateTargetDate = handler<
      { detail: { value: string } },
      { timelineData: Cell<TimelineData> }
    >(({ detail }, { timelineData }) => {
      const current = timelineData.get();
      timelineData.set({ ...current, targetDate: detail?.value ?? "" });
    });

    const updateCompletedDate = handler<
      { detail: { value: string } },
      { timelineData: Cell<TimelineData> }
    >(({ detail }, { timelineData }) => {
      const current = timelineData.get();
      timelineData.set({ ...current, completedDate: detail?.value ?? "" });
    });

    // ===== Social handlers =====
    const updatePlatform = handler<
      { detail: { value: string } },
      { socialData: Cell<SocialData> }
    >(({ detail }, { socialData }) => {
      const current = socialData.get();
      socialData.set({ ...current, platform: detail?.value ?? "" });
    });

    const updateHandle = handler<
      { detail: { value: string } },
      { socialData: Cell<SocialData> }
    >(({ detail }, { socialData }) => {
      const current = socialData.get();
      socialData.set({ ...current, handle: detail?.value ?? "" });
    });

    const updateSocialUrl = handler<
      { detail: { value: string } },
      { socialData: Cell<SocialData> }
    >(({ detail }, { socialData }) => {
      const current = socialData.get();
      socialData.set({ ...current, url: detail?.value ?? "" });
    });

    // ===== Link handlers =====
    const updateLinkUrl = handler<
      { detail: { value: string } },
      { linkData: Cell<LinkData> }
    >(({ detail }, { linkData }) => {
      const current = linkData.get();
      linkData.set({ ...current, url: detail?.value ?? "" });
    });

    const updateLinkTitle = handler<
      { detail: { value: string } },
      { linkData: Cell<LinkData> }
    >(({ detail }, { linkData }) => {
      const current = linkData.get();
      linkData.set({ ...current, linkTitle: detail?.value ?? "" });
    });

    const updateLinkDescription = handler<
      { detail: { value: string } },
      { linkData: Cell<LinkData> }
    >(({ detail }, { linkData }) => {
      const current = linkData.get();
      linkData.set({ ...current, description: detail?.value ?? "" });
    });

    // ===== Location handlers =====
    const updateLocationName = handler<
      { detail: { value: string } },
      { locationData: Cell<LocationData> }
    >(({ detail }, { locationData }) => {
      const current = locationData.get();
      locationData.set({ ...current, locationName: detail?.value ?? "" });
    });

    const updateLocationAddress = handler<
      { detail: { value: string } },
      { locationData: Cell<LocationData> }
    >(({ detail }, { locationData }) => {
      const current = locationData.get();
      locationData.set({ ...current, locationAddress: detail?.value ?? "" });
    });

    const updateCoordinates = handler<
      { detail: { value: string } },
      { locationData: Cell<LocationData> }
    >(({ detail }, { locationData }) => {
      const current = locationData.get();
      locationData.set({ ...current, coordinates: detail?.value ?? "" });
    });

    // ===== Relationship handlers =====
    const updateCloseness = handler<
      { detail: { value: string } },
      { relationshipData: Cell<RelationshipData> }
    >(({ detail }, { relationshipData }) => {
      const current = relationshipData.get();
      relationshipData.set({ ...current, closeness: detail?.value ?? "" });
    });

    const updateHowWeMet = handler<
      { detail: { value: string } },
      { relationshipData: Cell<RelationshipData> }
    >(({ detail }, { relationshipData }) => {
      const current = relationshipData.get();
      relationshipData.set({ ...current, howWeMet: detail?.value ?? "" });
    });

    const toggleInnerCircle = handler<
      unknown,
      { relationshipData: Cell<RelationshipData> }
    >((_event, { relationshipData }) => {
      const current = relationshipData.get();
      relationshipData.set({ ...current, innerCircle: !current.innerCircle });
    });

    const addRelationType = handler<
      { detail: { value: string } },
      { relationshipData: Cell<RelationshipData> }
    >(({ detail }, { relationshipData }) => {
      const newType = detail?.value?.trim();
      if (!newType) return;
      const current = relationshipData.get();
      if (!current.relationTypes.includes(newType)) {
        relationshipData.set({ ...current, relationTypes: [...current.relationTypes, newType] });
      }
    });

    const removeRelationType = handler<
      Record<string, never>,
      { relationshipData: Cell<RelationshipData>; relType: string }
    >((_event, { relationshipData, relType }) => {
      const current = relationshipData.get();
      relationshipData.set({ ...current, relationTypes: current.relationTypes.filter((t: string) => t !== relType) });
    });

    // ===== GiftPrefs handlers =====
    const updateGiftTier = handler<
      { detail: { value: string } },
      { giftPrefsData: Cell<GiftPrefsData> }
    >(({ detail }, { giftPrefsData }) => {
      const current = giftPrefsData.get();
      giftPrefsData.set({ ...current, giftTier: detail?.value ?? "" });
    });

    const addFavorite = handler<
      { detail: { value: string } },
      { giftPrefsData: Cell<GiftPrefsData> }
    >(({ detail }, { giftPrefsData }) => {
      const newFav = detail?.value?.trim();
      if (!newFav) return;
      const current = giftPrefsData.get();
      if (!current.favorites.includes(newFav)) {
        giftPrefsData.set({ ...current, favorites: [...current.favorites, newFav] });
      }
    });

    const removeFavorite = handler<
      Record<string, never>,
      { giftPrefsData: Cell<GiftPrefsData>; fav: string }
    >((_event, { giftPrefsData, fav }) => {
      const current = giftPrefsData.get();
      giftPrefsData.set({ ...current, favorites: current.favorites.filter((f: string) => f !== fav) });
    });

    const addAvoid = handler<
      { detail: { value: string } },
      { giftPrefsData: Cell<GiftPrefsData> }
    >(({ detail }, { giftPrefsData }) => {
      const newAvoid = detail?.value?.trim();
      if (!newAvoid) return;
      const current = giftPrefsData.get();
      if (!current.avoid.includes(newAvoid)) {
        giftPrefsData.set({ ...current, avoid: [...current.avoid, newAvoid] });
      }
    });

    const removeAvoid = handler<
      Record<string, never>,
      { giftPrefsData: Cell<GiftPrefsData>; item: string }
    >((_event, { giftPrefsData, item }) => {
      const current = giftPrefsData.get();
      giftPrefsData.set({ ...current, avoid: current.avoid.filter((a: string) => a !== item) });
    });

    // ===== Timing handlers =====
    const updatePrepTime = handler<
      { detail: { value: string } },
      { timingData: Cell<TimingData> }
    >(({ detail }, { timingData }) => {
      const val = detail?.value;
      const current = timingData.get();
      timingData.set({ ...current, prepTime: val ? parseInt(val, 10) : null });
    });

    const updateCookTime = handler<
      { detail: { value: string } },
      { timingData: Cell<TimingData> }
    >(({ detail }, { timingData }) => {
      const val = detail?.value;
      const current = timingData.get();
      timingData.set({ ...current, cookTime: val ? parseInt(val, 10) : null });
    });

    const updateRestTime = handler<
      { detail: { value: string } },
      { timingData: Cell<TimingData> }
    >(({ detail }, { timingData }) => {
      const val = detail?.value;
      const current = timingData.get();
      timingData.set({ ...current, restTime: val ? parseInt(val, 10) : null });
    });

    // ===== Pin/Layout handlers =====
    // Pre-bound handlers for each module type (avoids cell serialization in ifElse)
    const createTogglePinHandler = (moduleType: ModuleType) =>
      handler<Record<string, never>, { pinnedModules: Cell<ModuleType[]> }>(
        (_event, { pinnedModules: pm }) => {
          const current = pm.get();
          if (current.includes(moduleType)) {
            pm.set(current.filter((t) => t !== moduleType));
          } else {
            pm.set([...current, moduleType]);
          }
        }
      );

    // Create all handlers at top level, binding pinnedModules once
    const toggleNotesPin = createTogglePinHandler("notes")({ pinnedModules });
    const toggleBirthdayPin = createTogglePinHandler("birthday")({ pinnedModules });
    const toggleRatingPin = createTogglePinHandler("rating")({ pinnedModules });
    const toggleTagsPin = createTogglePinHandler("tags")({ pinnedModules });
    const toggleContactPin = createTogglePinHandler("contact")({ pinnedModules });
    const toggleStatusPin = createTogglePinHandler("status")({ pinnedModules });
    const toggleAddressPin = createTogglePinHandler("address")({ pinnedModules });
    const toggleTimelinePin = createTogglePinHandler("timeline")({ pinnedModules });
    const toggleSocialPin = createTogglePinHandler("social")({ pinnedModules });
    const toggleLinkPin = createTogglePinHandler("link")({ pinnedModules });
    const toggleLocationPin = createTogglePinHandler("location")({ pinnedModules });
    const toggleRelationshipPin = createTogglePinHandler("relationship")({ pinnedModules });
    const toggleGiftPrefsPin = createTogglePinHandler("giftprefs")({ pinnedModules });
    const toggleTimingPin = createTogglePinHandler("timing")({ pinnedModules });

    // Derived pin state
    const pinnedList = derive(pinnedModules, (p) => p ?? ["notes"]);
    const pinnedCount = derive(pinnedList, (p) => p.length);

    // Pre-computed pinned state for each module (avoids closure issues)
    const isNotesPinned = derive(pinnedList, (p) => p.includes("notes"));
    const isBirthdayPinned = derive(pinnedList, (p) => p.includes("birthday"));
    const isRatingPinned = derive(pinnedList, (p) => p.includes("rating"));
    const isTagsPinned = derive(pinnedList, (p) => p.includes("tags"));
    const isContactPinned = derive(pinnedList, (p) => p.includes("contact"));
    const isStatusPinned = derive(pinnedList, (p) => p.includes("status"));
    const isAddressPinned = derive(pinnedList, (p) => p.includes("address"));
    const isTimelinePinned = derive(pinnedList, (p) => p.includes("timeline"));
    const isSocialPinned = derive(pinnedList, (p) => p.includes("social"));
    const isLinkPinned = derive(pinnedList, (p) => p.includes("link"));
    const isLocationPinned = derive(pinnedList, (p) => p.includes("location"));
    const isRelationshipPinned = derive(pinnedList, (p) => p.includes("relationship"));
    const isGiftPrefsPinned = derive(pinnedList, (p) => p.includes("giftprefs"));
    const isTimingPinned = derive(pinnedList, (p) => p.includes("timing"));

    // Helper function for dynamic lookup (use pre-computed values in JSX)
    const isModulePinned = (moduleType: ModuleType) =>
      derive(pinnedList, (p) => p.includes(moduleType));

    // Display name - derive() gives proper types without casts
    const displayName = derive(title, (t) => t.trim() || "(Untitled Record)");

    // Check if sub-charms are enabled
    const hasBirthday = derive(enabledSubCharms, (e) => e.includes("birthday"));
    const hasRating = derive(enabledSubCharms, (e) => e.includes("rating"));
    const hasTags = derive(enabledSubCharms, (e) => e.includes("tags"));
    const hasContact = derive(enabledSubCharms, (e) => e.includes("contact"));
    // Wave 2
    const hasStatus = derive(enabledSubCharms, (e) => e.includes("status"));
    const hasAddress = derive(enabledSubCharms, (e) => e.includes("address"));
    const hasTimeline = derive(enabledSubCharms, (e) => e.includes("timeline"));
    const hasSocial = derive(enabledSubCharms, (e) => e.includes("social"));
    const hasLink = derive(enabledSubCharms, (e) => e.includes("link"));
    // Wave 3
    const hasLocation = derive(enabledSubCharms, (e) => e.includes("location"));
    const hasRelationship = derive(enabledSubCharms, (e) => e.includes("relationship"));
    const hasGiftPrefs = derive(enabledSubCharms, (e) => e.includes("giftprefs"));
    const hasTiming = derive(enabledSubCharms, (e) => e.includes("timing"));

    // Get birthday display values
    const birthDateValue = derive(birthdayData, (b) => b.birthDate);
    const birthYearValue = derive(birthdayData, (b) => b.birthYear);

    // Get rating display value
    const ratingValue = derive(ratingData, (r) => r.rating);

    // Get tags display value
    const tagsValue = derive(tagsData, (t) => t.tags);

    // Get contact display values
    const emailValue = derive(contactData, (c) => c.email);
    const phoneValue = derive(contactData, (c) => c.phone);
    const websiteValue = derive(contactData, (c) => c.website);

    // Get status display value
    const statusValue = derive(statusData, (s) => s.status);

    // Get address display values
    const streetValue = derive(addressData, (a) => a.street);
    const cityValue = derive(addressData, (a) => a.city);
    const stateValue = derive(addressData, (a) => a.state);
    const zipValue = derive(addressData, (a) => a.zip);

    // Get timeline display values
    const startDateValue = derive(timelineData, (t) => t.startDate);
    const targetDateValue = derive(timelineData, (t) => t.targetDate);
    const completedDateValue = derive(timelineData, (t) => t.completedDate);

    // Get social display values
    const platformValue = derive(socialData, (s) => s.platform);
    const handleValue = derive(socialData, (s) => s.handle);
    const socialUrlValue = derive(socialData, (s) => s.url);

    // Get link display values
    const linkUrlValue = derive(linkData, (l) => l.url);
    const linkTitleValue = derive(linkData, (l) => l.linkTitle);
    const linkDescriptionValue = derive(linkData, (l) => l.description);

    // Get location display values
    const locationNameValue = derive(locationData, (l) => l.locationName);
    const locationAddressValue = derive(locationData, (l) => l.locationAddress);
    const coordinatesValue = derive(locationData, (l) => l.coordinates);

    // Get relationship display values
    const relationTypesValue = derive(relationshipData, (r) => r.relationTypes);
    const closenessValue = derive(relationshipData, (r) => r.closeness);
    const howWeMetValue = derive(relationshipData, (r) => r.howWeMet);
    const innerCircleValue = derive(relationshipData, (r) => r.innerCircle);

    // Get giftprefs display values
    const giftTierValue = derive(giftPrefsData, (g) => g.giftTier);
    const favoritesValue = derive(giftPrefsData, (g) => g.favorites);
    const avoidValue = derive(giftPrefsData, (g) => g.avoid);

    // Get timing display values
    const prepTimeValue = derive(timingData, (t) => t.prepTime);
    const cookTimeValue = derive(timingData, (t) => t.cookTime);
    const restTimeValue = derive(timingData, (t) => t.restTime);
    const totalTimeValue = derive(timingData, (t) => {
      const prep = t.prepTime ?? 0;
      const cook = t.cookTime ?? 0;
      const rest = t.restTime ?? 0;
      const total = prep + cook + rest;
      return total > 0 ? total : null;
    });

    // Available types for [+] dropdown (exclude already-added types)
    const availableToAdd = derive(enabledSubCharms, (current) =>
      getAvailableTypes().filter((def) => !current.includes(def.type))
    );

    // Check if we have types available to add
    const hasTypesToAdd = derive(availableToAdd, (types) => types.length > 0);

    // Get items for the select dropdown
    const addSelectItems = derive(availableToAdd, (types) =>
      types.map((def) => ({
        value: def.type,
        label: `${def.icon} ${def.label}`,
      }))
    );

    // ===== Layout helpers =====
    // All available modules (notes is always available)
    const allModules = derive(enabledSubCharms, (enabled): ModuleType[] => [
      "notes" as ModuleType,
      ...enabled,
    ]);

    // Modules split by pin status
    const pinnedModulesList = derive(
      [allModules, pinnedList] as const,
      ([all, pinned]) => all.filter((m) => pinned.includes(m))
    );
    const unpinnedModulesList = derive(
      [allModules, pinnedList] as const,
      ([all, pinned]) => all.filter((m) => !pinned.includes(m))
    );

    // Helper to render pin button - accepts pre-computed isPinned value and pre-bound handler
    const renderPinButton = (isPinned: typeof isNotesPinned, toggleHandler: typeof toggleNotesPin) => (
      <button
        onClick={toggleHandler}
        style={{
          padding: "4px 8px",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          background: "transparent",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        {ifElse(isPinned, "📌 Pinned", "📍 Pin")}
      </button>
    );

    // Create unified record context for cross-panel data access
    const recordContext = computed((): RecordContext => ({
      title,
      displayName: title.trim() || "(Untitled Record)",
      notes,
      enabledSubCharms,
      birthdayData,
      ratingData,
      tagsData,
      contactData,
      statusData,
      addressData,
      timelineData,
      socialData,
      linkData,
      locationData,
      relationshipData,
      giftPrefsData,
      timingData,
    }));

    return {
      [NAME]: str`\u{1F4CB} ${displayName}`,
      [UI]: (
        <ct-vstack style={{ height: "100%", gap: "0" }}>
          {/* Header toolbar */}
          <ct-hstack
            style={{
              padding: "8px 12px",
              gap: "8px",
              borderBottom: "1px solid #e5e7eb",
              alignItems: "center",
            }}
          >
            <ct-input
              $value={title}
              placeholder="Record title..."
              style={{ flex: "1", fontWeight: "600", fontSize: "16px" }}
            />
            {ifElse(
              hasTypesToAdd,
              <ct-select
                $value={selectedAddType}
                placeholder="+ Add"
                items={addSelectItems}
                onct-change={addSubCharm({
                  enabledSubCharms,
                  activeTab,
                  selectedAddType,
                })}
                style={{ width: "130px" }}
              />,
              null
            )}
          </ct-hstack>

          {/* Adaptive Layout based on pinned modules */}
          {ifElse(
            derive(pinnedCount, (c) => c > 0),
            /* Primary + Rail layout when modules are pinned */
            <ct-hstack style={{ flex: "1", gap: "0", overflow: "hidden" }}>
              {/* Primary area - pinned modules stacked */}
              <ct-vstack style={{ flex: "2", borderRight: "1px solid #e5e7eb", overflow: "auto" }}>
                {/* Pinned Notes */}
                {ifElse(
                  isNotesPinned,
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{"\u{1F4DD}"} Notes</span>
                      <button
                        onClick={toggleNotesPin}
                        style={{
                          padding: "4px 8px",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        {ifElse(isNotesPinned, "📌 Pinned", "📍 Pin")}
                      </button>
                    </ct-hstack>
                    <ct-code-editor
                      $value={notes}
                      language="text/markdown"
                      theme="light"
                      wordWrap
                      placeholder="Add notes here..."
                      style={{ minHeight: "200px" }}
                    />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Tags */}
                {ifElse(
                  derive([hasTags, isTagsPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("tags")?.icon} Tags</span>
                      {renderPinButton(isTagsPinned, toggleTagsPin)}
                    </ct-hstack>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {tagsValue.map((tag: string) => (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "0.25rem",
                          padding: "0.25rem 0.5rem", backgroundColor: "#e0e7ff",
                          color: "#3730a3", borderRadius: "9999px", fontSize: "0.875rem",
                        }}>
                          {tag}
                          <button onClick={removeTag({ tagsData, tag })} style={{
                            border: "none", background: "transparent", color: "#6366f1",
                            cursor: "pointer", padding: "0", fontSize: "1rem",
                          }}>×</button>
                        </span>
                      ))}
                    </div>
                    <ct-autocomplete onct-select={addTag({ tagsData })} placeholder="Add tags..." allowCustom={true} items={[]} />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Rating */}
                {ifElse(
                  derive([hasRating, isRatingPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("rating")?.icon} Rating</span>
                      {renderPinButton(isRatingPinned, toggleRatingPin)}
                    </ct-hstack>
                    <ct-select
                      $value={derive(ratingValue, (r) => r?.toString() ?? "")}
                      onct-change={updateRating({ ratingData })}
                      placeholder="Select rating..."
                      items={[
                        { value: "1", label: "⭐ 1" }, { value: "2", label: "⭐⭐ 2" },
                        { value: "3", label: "⭐⭐⭐ 3" }, { value: "4", label: "⭐⭐⭐⭐ 4" },
                        { value: "5", label: "⭐⭐⭐⭐⭐ 5" },
                      ]}
                      style={{ maxWidth: "200px" }}
                    />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Status */}
                {ifElse(
                  derive([hasStatus, isStatusPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("status")?.icon} Status</span>
                      {renderPinButton(isStatusPinned, toggleStatusPin)}
                    </ct-hstack>
                    <ct-select
                      $value={statusValue}
                      onct-change={updateStatus({ statusData })}
                      placeholder="Select status..."
                      items={[
                        { value: "planned", label: "📋 Planned" }, { value: "active", label: "🚀 Active" },
                        { value: "blocked", label: "🚧 Blocked" }, { value: "done", label: "✅ Done" },
                        { value: "archived", label: "📦 Archived" },
                      ]}
                      style={{ maxWidth: "200px" }}
                    />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Birthday */}
                {ifElse(
                  derive([hasBirthday, isBirthdayPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("birthday")?.icon} Birthday</span>
                      {renderPinButton(isBirthdayPinned, toggleBirthdayPin)}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "12px" }}>
                      <ct-input value={birthDateValue} onct-input={updateBirthDate({ birthdayData })} placeholder="YYYY-MM-DD" style={{ flex: "1" }} />
                      <ct-input type="number" value={birthYearValue ?? ""} onct-input={updateBirthYear({ birthdayData })} placeholder="Year" style={{ width: "80px" }} />
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Contact */}
                {ifElse(
                  derive([hasContact, isContactPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("contact")?.icon} Contact</span>
                      {renderPinButton(isContactPinned, toggleContactPin)}
                    </ct-hstack>
                    <ct-input value={emailValue} onct-input={updateEmail({ contactData })} placeholder="Email" />
                    <ct-input value={phoneValue} onct-input={updatePhone({ contactData })} placeholder="Phone" />
                    <ct-input value={websiteValue} onct-input={updateWebsite({ contactData })} placeholder="Website" />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Address */}
                {ifElse(
                  derive([hasAddress, isAddressPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("address")?.icon} Address</span>
                      {renderPinButton(isAddressPinned, toggleAddressPin)}
                    </ct-hstack>
                    <ct-input value={streetValue} onct-input={updateStreet({ addressData })} placeholder="Street" />
                    <ct-hstack style={{ gap: "8px" }}>
                      <ct-input value={cityValue} onct-input={updateCity({ addressData })} placeholder="City" style={{ flex: "2" }} />
                      <ct-input value={stateValue} onct-input={updateState({ addressData })} placeholder="State" style={{ flex: "1" }} />
                      <ct-input value={zipValue} onct-input={updateZip({ addressData })} placeholder="ZIP" style={{ flex: "1" }} />
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Timeline */}
                {ifElse(
                  derive([hasTimeline, isTimelinePinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("timeline")?.icon} Timeline</span>
                      {renderPinButton(isTimelinePinned, toggleTimelinePin)}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "12px" }}>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Start</span>
                        <ct-input value={startDateValue} onct-input={updateStartDate({ timelineData })} placeholder="YYYY-MM-DD" />
                      </ct-vstack>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Target</span>
                        <ct-input value={targetDateValue} onct-input={updateTargetDate({ timelineData })} placeholder="YYYY-MM-DD" />
                      </ct-vstack>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Done</span>
                        <ct-input value={completedDateValue} onct-input={updateCompletedDate({ timelineData })} placeholder="YYYY-MM-DD" />
                      </ct-vstack>
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Social */}
                {ifElse(
                  derive([hasSocial, isSocialPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("social")?.icon} Social</span>
                      {renderPinButton(isSocialPinned, toggleSocialPin)}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "8px" }}>
                      <ct-select $value={platformValue} onct-change={updatePlatform({ socialData })} placeholder="Platform" items={[
                        { value: "twitter", label: "𝕏 Twitter" }, { value: "linkedin", label: "💼 LinkedIn" },
                        { value: "github", label: "🐙 GitHub" }, { value: "instagram", label: "📷 Instagram" },
                      ]} style={{ flex: "1" }} />
                      <ct-input value={handleValue} onct-input={updateHandle({ socialData })} placeholder="@handle" style={{ flex: "1" }} />
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Link */}
                {ifElse(
                  derive([hasLink, isLinkPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("link")?.icon} Link</span>
                      {renderPinButton(isLinkPinned, toggleLinkPin)}
                    </ct-hstack>
                    <ct-input value={linkUrlValue} onct-input={updateLinkUrl({ linkData })} placeholder="https://..." />
                    <ct-hstack style={{ gap: "8px" }}>
                      <ct-input value={linkTitleValue} onct-input={updateLinkTitle({ linkData })} placeholder="Title" style={{ flex: "1" }} />
                      <ct-input value={linkDescriptionValue} onct-input={updateLinkDescription({ linkData })} placeholder="Description" style={{ flex: "2" }} />
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Location */}
                {ifElse(
                  derive([hasLocation, isLocationPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("location")?.icon} Location</span>
                      {renderPinButton(isLocationPinned, toggleLocationPin)}
                    </ct-hstack>
                    <ct-input value={locationNameValue} onct-input={updateLocationName({ locationData })} placeholder="Location name" />
                    <ct-input value={locationAddressValue} onct-input={updateLocationAddress({ locationData })} placeholder="Full address" />
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Relationship */}
                {ifElse(
                  derive([hasRelationship, isRelationshipPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("relationship")?.icon} Relationship</span>
                      {renderPinButton(isRelationshipPinned, toggleRelationshipPin)}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "8px", flexWrap: "wrap" }}>
                      {relationTypesValue.map((relType: string) => (
                        <span style={{ padding: "2px 8px", backgroundColor: "#fce7f3", color: "#9d174d", borderRadius: "9999px", fontSize: "13px" }}>
                          {relType} <button onClick={removeRelationType({ relationshipData, relType })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>×</button>
                        </span>
                      ))}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "8px" }}>
                      <ct-select $value={closenessValue} onct-change={updateCloseness({ relationshipData })} placeholder="Closeness" items={[
                        { value: "intimate", label: "💜 Intimate" }, { value: "close", label: "💙 Close" },
                        { value: "casual", label: "💚 Casual" }, { value: "distant", label: "🤍 Distant" },
                      ]} style={{ flex: "1" }} />
                      <ct-autocomplete onct-select={addRelationType({ relationshipData })} placeholder="Add type..." allowCustom={true} items={[
                        { value: "friend", label: "Friend" }, { value: "colleague", label: "Colleague" },
                        { value: "family", label: "Family" },
                      ]} style={{ flex: "1" }} />
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned GiftPrefs */}
                {ifElse(
                  derive([hasGiftPrefs, isGiftPrefsPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("giftprefs")?.icon} Gift Preferences</span>
                      {renderPinButton(isGiftPrefsPinned, toggleGiftPrefsPin)}
                    </ct-hstack>
                    <ct-select $value={giftTierValue} onct-change={updateGiftTier({ giftPrefsData })} placeholder="Gift tier" items={[
                      { value: "always", label: "🎁 Always" }, { value: "occasions", label: "🎂 Occasions" },
                      { value: "reciprocal", label: "🔄 Reciprocal" }, { value: "none", label: "❌ None" },
                    ]} style={{ maxWidth: "200px" }} />
                    <ct-hstack style={{ gap: "8px" }}>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#065f46" }}>Favorites</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {favoritesValue.map((fav: string) => (
                            <span style={{ padding: "2px 6px", backgroundColor: "#d1fae5", borderRadius: "9999px", fontSize: "12px" }}>
                              {fav} <button onClick={removeFavorite({ giftPrefsData, fav })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>×</button>
                            </span>
                          ))}
                        </div>
                        <ct-autocomplete onct-select={addFavorite({ giftPrefsData })} placeholder="Add..." allowCustom={true} items={[]} />
                      </ct-vstack>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#991b1b" }}>Avoid</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {avoidValue.map((item: string) => (
                            <span style={{ padding: "2px 6px", backgroundColor: "#fee2e2", borderRadius: "9999px", fontSize: "12px" }}>
                              {item} <button onClick={removeAvoid({ giftPrefsData, item })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>×</button>
                            </span>
                          ))}
                        </div>
                        <ct-autocomplete onct-select={addAvoid({ giftPrefsData })} placeholder="Add..." allowCustom={true} items={[]} />
                      </ct-vstack>
                    </ct-hstack>
                  </ct-vstack>,
                  null
                )}
                {/* Pinned Timing */}
                {ifElse(
                  derive([hasTiming, isTimingPinned] as const, ([has, pinned]) => has && pinned),
                  <ct-vstack style={{ padding: "16px", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
                    <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{getDefinition("timing")?.icon} Timing</span>
                      {renderPinButton(isTimingPinned, toggleTimingPin)}
                    </ct-hstack>
                    <ct-hstack style={{ gap: "12px" }}>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Prep</span>
                        <ct-input type="number" value={prepTimeValue ?? ""} onct-input={updatePrepTime({ timingData })} placeholder="mins" />
                      </ct-vstack>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Cook</span>
                        <ct-input type="number" value={cookTimeValue ?? ""} onct-input={updateCookTime({ timingData })} placeholder="mins" />
                      </ct-vstack>
                      <ct-vstack style={{ gap: "4px", flex: "1" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Rest</span>
                        <ct-input type="number" value={restTimeValue ?? ""} onct-input={updateRestTime({ timingData })} placeholder="mins" />
                      </ct-vstack>
                    </ct-hstack>
                    {ifElse(
                      derive(totalTimeValue, (t) => t !== null),
                      <div style={{ padding: "8px 12px", background: "#f3f4f6", borderRadius: "6px", fontSize: "13px" }}>
                        Total: {totalTimeValue} minutes
                      </div>,
                      null
                    )}
                  </ct-vstack>,
                  null
                )}
              </ct-vstack>
              {/* Rail - tabs for all modules (navigate/edit) */}
              <ct-vstack style={{ flex: "1", overflow: "auto" }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", fontSize: "12px", color: "#6b7280" }}>
                  All Modules
                </div>
                <ct-tabs $value={activeTab} style={{ flex: "1" }}>
                  <ct-tab-list>
                    <ct-tab value="notes">{"\u{1F4DD}"}</ct-tab>
                    {ifElse(hasBirthday, <ct-tab value="birthday">{getDefinition("birthday")?.icon}</ct-tab>, null)}
                    {ifElse(hasRating, <ct-tab value="rating">{getDefinition("rating")?.icon}</ct-tab>, null)}
                    {ifElse(hasTags, <ct-tab value="tags">{getDefinition("tags")?.icon}</ct-tab>, null)}
                    {ifElse(hasContact, <ct-tab value="contact">{getDefinition("contact")?.icon}</ct-tab>, null)}
                    {ifElse(hasStatus, <ct-tab value="status">{getDefinition("status")?.icon}</ct-tab>, null)}
                    {ifElse(hasAddress, <ct-tab value="address">{getDefinition("address")?.icon}</ct-tab>, null)}
                    {ifElse(hasTimeline, <ct-tab value="timeline">{getDefinition("timeline")?.icon}</ct-tab>, null)}
                    {ifElse(hasSocial, <ct-tab value="social">{getDefinition("social")?.icon}</ct-tab>, null)}
                    {ifElse(hasLink, <ct-tab value="link">{getDefinition("link")?.icon}</ct-tab>, null)}
                    {ifElse(hasLocation, <ct-tab value="location">{getDefinition("location")?.icon}</ct-tab>, null)}
                    {ifElse(hasRelationship, <ct-tab value="relationship">{getDefinition("relationship")?.icon}</ct-tab>, null)}
                    {ifElse(hasGiftPrefs, <ct-tab value="giftprefs">{getDefinition("giftprefs")?.icon}</ct-tab>, null)}
                    {ifElse(hasTiming, <ct-tab value="timing">{getDefinition("timing")?.icon}</ct-tab>, null)}
                  </ct-tab-list>
                  {/* Mini tab panels for rail editing - reuse existing panels */}
                  <ct-tab-panel value="notes">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isNotesPinned, toggleNotesPin)}
                      <ct-code-editor $value={notes} language="text/markdown" theme="light" wordWrap style={{ minHeight: "150px" }} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="birthday">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isBirthdayPinned, toggleBirthdayPin)}
                      <ct-input value={birthDateValue} onct-input={updateBirthDate({ birthdayData })} placeholder="YYYY-MM-DD" />
                      <ct-input type="number" value={birthYearValue ?? ""} onct-input={updateBirthYear({ birthdayData })} placeholder="Year" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="rating">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isRatingPinned, toggleRatingPin)}
                      <ct-select $value={derive(ratingValue, (r) => r?.toString() ?? "")} onct-change={updateRating({ ratingData })} items={[
                        { value: "1", label: "⭐ 1" }, { value: "2", label: "⭐⭐ 2" }, { value: "3", label: "⭐⭐⭐ 3" },
                        { value: "4", label: "⭐⭐⭐⭐ 4" }, { value: "5", label: "⭐⭐⭐⭐⭐ 5" },
                      ]} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="tags">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isTagsPinned, toggleTagsPin)}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                        {tagsValue.map((tag: string) => (
                          <span style={{ padding: "2px 6px", backgroundColor: "#e0e7ff", borderRadius: "9999px", fontSize: "12px" }}>
                            {tag} <button onClick={removeTag({ tagsData, tag })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>×</button>
                          </span>
                        ))}
                      </div>
                      <ct-autocomplete onct-select={addTag({ tagsData })} placeholder="Add..." allowCustom={true} items={[]} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="contact">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isContactPinned, toggleContactPin)}
                      <ct-input value={emailValue} onct-input={updateEmail({ contactData })} placeholder="Email" />
                      <ct-input value={phoneValue} onct-input={updatePhone({ contactData })} placeholder="Phone" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="status">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isStatusPinned, toggleStatusPin)}
                      <ct-select $value={statusValue} onct-change={updateStatus({ statusData })} items={[
                        { value: "planned", label: "📋 Planned" }, { value: "active", label: "🚀 Active" },
                        { value: "blocked", label: "🚧 Blocked" }, { value: "done", label: "✅ Done" },
                      ]} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="address">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isAddressPinned, toggleAddressPin)}
                      <ct-input value={streetValue} onct-input={updateStreet({ addressData })} placeholder="Street" />
                      <ct-input value={cityValue} onct-input={updateCity({ addressData })} placeholder="City" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="timeline">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isTimelinePinned, toggleTimelinePin)}
                      <ct-input value={startDateValue} onct-input={updateStartDate({ timelineData })} placeholder="Start" />
                      <ct-input value={targetDateValue} onct-input={updateTargetDate({ timelineData })} placeholder="Target" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="social">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isSocialPinned, toggleSocialPin)}
                      <ct-input value={handleValue} onct-input={updateHandle({ socialData })} placeholder="@handle" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="link">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isLinkPinned, toggleLinkPin)}
                      <ct-input value={linkUrlValue} onct-input={updateLinkUrl({ linkData })} placeholder="URL" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="location">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isLocationPinned, toggleLocationPin)}
                      <ct-input value={locationNameValue} onct-input={updateLocationName({ locationData })} placeholder="Name" />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="relationship">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isRelationshipPinned, toggleRelationshipPin)}
                      <ct-select $value={closenessValue} onct-change={updateCloseness({ relationshipData })} items={[
                        { value: "intimate", label: "💜 Intimate" }, { value: "close", label: "💙 Close" },
                        { value: "casual", label: "💚 Casual" }, { value: "distant", label: "🤍 Distant" },
                      ]} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="giftprefs">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isGiftPrefsPinned, toggleGiftPrefsPin)}
                      <ct-select $value={giftTierValue} onct-change={updateGiftTier({ giftPrefsData })} items={[
                        { value: "always", label: "🎁 Always" }, { value: "occasions", label: "🎂 Occasions" },
                        { value: "reciprocal", label: "🔄 Reciprocal" }, { value: "none", label: "❌ None" },
                      ]} />
                    </ct-vstack>
                  </ct-tab-panel>
                  <ct-tab-panel value="timing">
                    <ct-vstack style={{ padding: "12px", gap: "8px" }}>
                      {renderPinButton(isTimingPinned, toggleTimingPin)}
                      <ct-input type="number" value={prepTimeValue ?? ""} onct-input={updatePrepTime({ timingData })} placeholder="Prep mins" />
                      <ct-input type="number" value={cookTimeValue ?? ""} onct-input={updateCookTime({ timingData })} placeholder="Cook mins" />
                    </ct-vstack>
                  </ct-tab-panel>
                </ct-tabs>
              </ct-vstack>
            </ct-hstack>,
            /* Original tabs layout when nothing is pinned */
            <ct-tabs $value={activeTab} style={{ flex: "1" }}>
              <ct-tab-list>
                {/* Notes tab is always first (built-in) */}
                <ct-tab value="notes">{"\u{1F4DD}"} Notes</ct-tab>
              {/* Birthday tab (shown if enabled) - uses registry metadata */}
              {ifElse(
                hasBirthday,
                <ct-tab value="birthday">
                  {getDefinition("birthday")?.icon} {getDefinition("birthday")?.label}
                </ct-tab>,
                null
              )}
              {/* Rating tab */}
              {ifElse(
                hasRating,
                <ct-tab value="rating">
                  {getDefinition("rating")?.icon} {getDefinition("rating")?.label}
                </ct-tab>,
                null
              )}
              {/* Tags tab */}
              {ifElse(
                hasTags,
                <ct-tab value="tags">
                  {getDefinition("tags")?.icon} {getDefinition("tags")?.label}
                </ct-tab>,
                null
              )}
              {/* Contact tab */}
              {ifElse(
                hasContact,
                <ct-tab value="contact">
                  {getDefinition("contact")?.icon} {getDefinition("contact")?.label}
                </ct-tab>,
                null
              )}
              {/* Status tab */}
              {ifElse(
                hasStatus,
                <ct-tab value="status">
                  {getDefinition("status")?.icon} {getDefinition("status")?.label}
                </ct-tab>,
                null
              )}
              {/* Address tab */}
              {ifElse(
                hasAddress,
                <ct-tab value="address">
                  {getDefinition("address")?.icon} {getDefinition("address")?.label}
                </ct-tab>,
                null
              )}
              {/* Timeline tab */}
              {ifElse(
                hasTimeline,
                <ct-tab value="timeline">
                  {getDefinition("timeline")?.icon} {getDefinition("timeline")?.label}
                </ct-tab>,
                null
              )}
              {/* Social tab */}
              {ifElse(
                hasSocial,
                <ct-tab value="social">
                  {getDefinition("social")?.icon} {getDefinition("social")?.label}
                </ct-tab>,
                null
              )}
              {/* Link tab */}
              {ifElse(
                hasLink,
                <ct-tab value="link">
                  {getDefinition("link")?.icon} {getDefinition("link")?.label}
                </ct-tab>,
                null
              )}
              {/* Location tab */}
              {ifElse(
                hasLocation,
                <ct-tab value="location">
                  {getDefinition("location")?.icon} {getDefinition("location")?.label}
                </ct-tab>,
                null
              )}
              {/* Relationship tab */}
              {ifElse(
                hasRelationship,
                <ct-tab value="relationship">
                  {getDefinition("relationship")?.icon} {getDefinition("relationship")?.label}
                </ct-tab>,
                null
              )}
              {/* Gift Prefs tab */}
              {ifElse(
                hasGiftPrefs,
                <ct-tab value="giftprefs">
                  {getDefinition("giftprefs")?.icon} {getDefinition("giftprefs")?.label}
                </ct-tab>,
                null
              )}
              {/* Timing tab */}
              {ifElse(
                hasTiming,
                <ct-tab value="timing">
                  {getDefinition("timing")?.icon} {getDefinition("timing")?.label}
                </ct-tab>,
                null
              )}
            </ct-tab-list>

            {/* Notes panel (built-in) */}
            <ct-tab-panel value="notes">
              <ct-vstack
                style={{ height: "100%", gap: "8px", padding: "12px" }}
              >
                <ct-hstack style={{ justifyContent: "flex-end", marginBottom: "4px" }}>
                  <button
                    onClick={toggleNotesPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isNotesPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-code-editor
                  $value={notes}
                  language="text/markdown"
                  theme="light"
                  wordWrap
                  placeholder="Add notes here. Start dumping data - structure comes later."
                  style={{ flex: "1", minHeight: "300px" }}
                />
              </ct-vstack>
            </ct-tab-panel>

            {/* Birthday panel (always rendered, tab visibility controlled above) */}
            <ct-tab-panel value="birthday">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleBirthdayPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isBirthdayPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Birth Date
                  </label>
                  <ct-input
                    value={birthDateValue}
                    onct-input={updateBirthDate({ birthdayData })}
                    placeholder="YYYY-MM-DD (e.g., 1990-03-15)"
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Enter the full date if known
                  </span>
                </ct-vstack>

                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Birth Year
                  </label>
                  <ct-input
                    type="number"
                    value={birthYearValue ?? ""}
                    onct-input={updateBirthYear({ birthdayData })}
                    placeholder="1990"
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Used for age calculation
                  </span>
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Rating panel */}
            <ct-tab-panel value="rating">
              <ct-vstack style={{ padding: "16px", gap: "8px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleRatingPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isRatingPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <label style={{ fontWeight: "600", fontSize: "14px" }}>
                  Rating
                </label>
                <ct-select
                  $value={derive(ratingValue, (r) => r?.toString() ?? "")}
                  onct-change={updateRating({ ratingData })}
                  placeholder="Select rating..."
                  items={[
                    { value: "1", label: "⭐ 1 Star" },
                    { value: "2", label: "⭐⭐ 2 Stars" },
                    { value: "3", label: "⭐⭐⭐ 3 Stars" },
                    { value: "4", label: "⭐⭐⭐⭐ 4 Stars" },
                    { value: "5", label: "⭐⭐⭐⭐⭐ 5 Stars" },
                  ]}
                  style={{ maxWidth: "200px" }}
                />
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Rate from 1 to 5 stars
                </span>
              </ct-vstack>
            </ct-tab-panel>

            {/* Tags panel */}
            <ct-tab-panel value="tags">
              <ct-vstack style={{ padding: "16px", gap: "12px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleTagsPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isTagsPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <label style={{ fontWeight: "600", fontSize: "14px" }}>
                  Tags
                </label>
                {/* Display existing tags as chips */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  minHeight: "2rem",
                }}>
                  {tagsValue.map((tag: string) => (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "#e0e7ff",
                        color: "#3730a3",
                        borderRadius: "9999px",
                        fontSize: "0.875rem",
                      }}
                    >
                      {tag}
                      <button
                        onClick={removeTag({ tagsData, tag })}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "1rem",
                          height: "1rem",
                          padding: "0",
                          border: "none",
                          background: "transparent",
                          color: "#6366f1",
                          cursor: "pointer",
                          borderRadius: "50%",
                          fontSize: "1rem",
                          lineHeight: "1",
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {/* Autocomplete for adding new tags */}
                <ct-autocomplete
                  onct-select={addTag({ tagsData })}
                  placeholder="Add tags..."
                  allowCustom={true}
                  items={[]}
                />
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Type and press Enter to add tags
                </span>
              </ct-vstack>
            </ct-tab-panel>

            {/* Contact panel */}
            <ct-tab-panel value="contact">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleContactPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isContactPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Email
                  </label>
                  <ct-input
                    value={emailValue}
                    onct-input={updateEmail({ contactData })}
                    placeholder="email@example.com"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Phone
                  </label>
                  <ct-input
                    value={phoneValue}
                    onct-input={updatePhone({ contactData })}
                    placeholder="+1 (555) 123-4567"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Website
                  </label>
                  <ct-input
                    value={websiteValue}
                    onct-input={updateWebsite({ contactData })}
                    placeholder="https://example.com"
                  />
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Status panel */}
            <ct-tab-panel value="status">
              <ct-vstack style={{ padding: "16px", gap: "8px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleStatusPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isStatusPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <label style={{ fontWeight: "600", fontSize: "14px" }}>
                  Status
                </label>
                <ct-select
                  $value={statusValue}
                  onct-change={updateStatus({ statusData })}
                  placeholder="Select status..."
                  items={[
                    { value: "planned", label: "📋 Planned" },
                    { value: "active", label: "🚀 Active" },
                    { value: "blocked", label: "🚧 Blocked" },
                    { value: "done", label: "✅ Done" },
                    { value: "archived", label: "📦 Archived" },
                  ]}
                  style={{ maxWidth: "200px" }}
                />
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Track project or task status
                </span>
              </ct-vstack>
            </ct-tab-panel>

            {/* Address panel */}
            <ct-tab-panel value="address">
              <ct-vstack style={{ padding: "16px", gap: "12px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleAddressPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isAddressPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Street
                  </label>
                  <ct-input
                    value={streetValue}
                    onct-input={updateStreet({ addressData })}
                    placeholder="123 Main St"
                  />
                </ct-vstack>
                <ct-hstack style={{ gap: "12px" }}>
                  <ct-vstack style={{ gap: "4px", flex: "2" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      City
                    </label>
                    <ct-input
                      value={cityValue}
                      onct-input={updateCity({ addressData })}
                      placeholder="City"
                    />
                  </ct-vstack>
                  <ct-vstack style={{ gap: "4px", flex: "1" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      State
                    </label>
                    <ct-input
                      value={stateValue}
                      onct-input={updateState({ addressData })}
                      placeholder="CA"
                    />
                  </ct-vstack>
                  <ct-vstack style={{ gap: "4px", flex: "1" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      ZIP
                    </label>
                    <ct-input
                      value={zipValue}
                      onct-input={updateZip({ addressData })}
                      placeholder="94102"
                    />
                  </ct-vstack>
                </ct-hstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Timeline panel */}
            <ct-tab-panel value="timeline">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleTimelinePin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isTimelinePinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Start Date
                  </label>
                  <ct-input
                    value={startDateValue}
                    onct-input={updateStartDate({ timelineData })}
                    placeholder="YYYY-MM-DD"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Target Date
                  </label>
                  <ct-input
                    value={targetDateValue}
                    onct-input={updateTargetDate({ timelineData })}
                    placeholder="YYYY-MM-DD"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Completed Date
                  </label>
                  <ct-input
                    value={completedDateValue}
                    onct-input={updateCompletedDate({ timelineData })}
                    placeholder="YYYY-MM-DD"
                  />
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Social panel */}
            <ct-tab-panel value="social">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleSocialPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isSocialPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Platform
                  </label>
                  <ct-select
                    $value={platformValue}
                    onct-change={updatePlatform({ socialData })}
                    placeholder="Select platform..."
                    items={[
                      { value: "twitter", label: "𝕏 Twitter/X" },
                      { value: "linkedin", label: "💼 LinkedIn" },
                      { value: "github", label: "🐙 GitHub" },
                      { value: "instagram", label: "📷 Instagram" },
                      { value: "facebook", label: "👤 Facebook" },
                      { value: "youtube", label: "▶️ YouTube" },
                      { value: "tiktok", label: "🎵 TikTok" },
                      { value: "mastodon", label: "🐘 Mastodon" },
                      { value: "bluesky", label: "🦋 Bluesky" },
                    ]}
                    style={{ maxWidth: "200px" }}
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Handle
                  </label>
                  <ct-input
                    value={handleValue}
                    onct-input={updateHandle({ socialData })}
                    placeholder="@username"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Profile URL
                  </label>
                  <ct-input
                    value={socialUrlValue}
                    onct-input={updateSocialUrl({ socialData })}
                    placeholder="https://..."
                  />
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Link panel */}
            <ct-tab-panel value="link">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleLinkPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isLinkPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    URL
                  </label>
                  <ct-input
                    value={linkUrlValue}
                    onct-input={updateLinkUrl({ linkData })}
                    placeholder="https://..."
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Title
                  </label>
                  <ct-input
                    value={linkTitleValue}
                    onct-input={updateLinkTitle({ linkData })}
                    placeholder="Link title"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Description
                  </label>
                  <ct-input
                    value={linkDescriptionValue}
                    onct-input={updateLinkDescription({ linkData })}
                    placeholder="Brief description..."
                  />
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Location panel */}
            <ct-tab-panel value="location">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleLocationPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isLocationPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Location Name
                  </label>
                  <ct-input
                    value={locationNameValue}
                    onct-input={updateLocationName({ locationData })}
                    placeholder="e.g., Central Park, Home Office"
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Address
                  </label>
                  <ct-input
                    value={locationAddressValue}
                    onct-input={updateLocationAddress({ locationData })}
                    placeholder="Full address..."
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Coordinates
                  </label>
                  <ct-input
                    value={coordinatesValue}
                    onct-input={updateCoordinates({ locationData })}
                    placeholder="lat,lng (optional)"
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Optional GPS coordinates
                  </span>
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Relationship panel */}
            <ct-tab-panel value="relationship">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "#666", fontSize: "13px", margin: "0" }}>
                    Your relationship with {recordContext.displayName}
                  </p>
                  <button
                    onClick={toggleRelationshipPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isRelationshipPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Relationship Types
                  </label>
                  {/* Display existing relationship types as chips */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    minHeight: "2rem",
                  }}>
                    {relationTypesValue.map((relType: string) => (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#fce7f3",
                          color: "#9d174d",
                          borderRadius: "9999px",
                          fontSize: "0.875rem",
                        }}
                      >
                        {relType}
                        <button
                          onClick={removeRelationType({ relationshipData, relType })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1rem",
                            height: "1rem",
                            padding: "0",
                            border: "none",
                            background: "transparent",
                            color: "#ec4899",
                            cursor: "pointer",
                            borderRadius: "50%",
                            fontSize: "1rem",
                            lineHeight: "1",
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <ct-autocomplete
                    onct-select={addRelationType({ relationshipData })}
                    placeholder="friend, colleague, family..."
                    allowCustom={true}
                    items={[
                      { value: "friend", label: "Friend" },
                      { value: "colleague", label: "Colleague" },
                      { value: "family", label: "Family" },
                      { value: "neighbor", label: "Neighbor" },
                      { value: "mentor", label: "Mentor" },
                      { value: "mentee", label: "Mentee" },
                    ]}
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Closeness
                  </label>
                  <ct-select
                    $value={closenessValue}
                    onct-change={updateCloseness({ relationshipData })}
                    placeholder="Select closeness..."
                    items={[
                      { value: "intimate", label: "💜 Intimate" },
                      { value: "close", label: "💙 Close" },
                      { value: "casual", label: "💚 Casual" },
                      { value: "distant", label: "🤍 Distant" },
                    ]}
                    style={{ maxWidth: "200px" }}
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    How We Met
                  </label>
                  <ct-input
                    value={howWeMetValue}
                    onct-input={updateHowWeMet({ relationshipData })}
                    placeholder="e.g., College roommate, Work conference..."
                  />
                </ct-vstack>
                <ct-hstack style={{ gap: "8px", alignItems: "center" }}>
                  <ct-checkbox
                    checked={innerCircleValue}
                    onct-change={toggleInnerCircle({ relationshipData })}
                  />
                  <label style={{ fontSize: "14px" }}>Inner Circle</label>
                </ct-hstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Gift Prefs panel */}
            <ct-tab-panel value="giftprefs">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleGiftPrefsPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isGiftPrefsPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Gift Giving Tier
                  </label>
                  <ct-select
                    $value={giftTierValue}
                    onct-change={updateGiftTier({ giftPrefsData })}
                    placeholder="Select tier..."
                    items={[
                      { value: "always", label: "🎁 Always (close family/friends)" },
                      { value: "occasions", label: "🎂 Occasions (birthdays, holidays)" },
                      { value: "reciprocal", label: "🔄 Reciprocal (if they give)" },
                      { value: "none", label: "❌ None" },
                    ]}
                    style={{ maxWidth: "280px" }}
                  />
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Favorites
                  </label>
                  {/* Display favorites as chips */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    minHeight: "2rem",
                  }}>
                    {favoritesValue.map((fav: string) => (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#d1fae5",
                          color: "#065f46",
                          borderRadius: "9999px",
                          fontSize: "0.875rem",
                        }}
                      >
                        {fav}
                        <button
                          onClick={removeFavorite({ giftPrefsData, fav })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1rem",
                            height: "1rem",
                            padding: "0",
                            border: "none",
                            background: "transparent",
                            color: "#10b981",
                            cursor: "pointer",
                            borderRadius: "50%",
                            fontSize: "1rem",
                            lineHeight: "1",
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <ct-autocomplete
                    onct-select={addFavorite({ giftPrefsData })}
                    placeholder="Things they love..."
                    allowCustom={true}
                    items={[]}
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Items, experiences, or categories they enjoy
                  </span>
                </ct-vstack>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Avoid
                  </label>
                  {/* Display avoid items as chips */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    minHeight: "2rem",
                  }}>
                    {avoidValue.map((item: string) => (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          borderRadius: "9999px",
                          fontSize: "0.875rem",
                        }}
                      >
                        {item}
                        <button
                          onClick={removeAvoid({ giftPrefsData, item })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1rem",
                            height: "1rem",
                            padding: "0",
                            border: "none",
                            background: "transparent",
                            color: "#ef4444",
                            cursor: "pointer",
                            borderRadius: "50%",
                            fontSize: "1rem",
                            lineHeight: "1",
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <ct-autocomplete
                    onct-select={addAvoid({ giftPrefsData })}
                    placeholder="Things to avoid..."
                    allowCustom={true}
                    items={[]}
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Allergies, dislikes, or items they already have
                  </span>
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>

            {/* Timing panel */}
            <ct-tab-panel value="timing">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-hstack style={{ justifyContent: "flex-end" }}>
                  <button
                    onClick={toggleTimingPin}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {ifElse(isTimingPinned, "📌 Pinned", "📍 Pin")}
                  </button>
                </ct-hstack>
                <ct-hstack style={{ gap: "16px" }}>
                  <ct-vstack style={{ gap: "4px", flex: "1" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      Prep Time
                    </label>
                    <ct-input
                      type="number"
                      value={prepTimeValue ?? ""}
                      onct-input={updatePrepTime({ timingData })}
                      placeholder="mins"
                    />
                  </ct-vstack>
                  <ct-vstack style={{ gap: "4px", flex: "1" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      Cook Time
                    </label>
                    <ct-input
                      type="number"
                      value={cookTimeValue ?? ""}
                      onct-input={updateCookTime({ timingData })}
                      placeholder="mins"
                    />
                  </ct-vstack>
                  <ct-vstack style={{ gap: "4px", flex: "1" }}>
                    <label style={{ fontWeight: "600", fontSize: "14px" }}>
                      Rest Time
                    </label>
                    <ct-input
                      type="number"
                      value={restTimeValue ?? ""}
                      onct-input={updateRestTime({ timingData })}
                      placeholder="mins"
                    />
                  </ct-vstack>
                </ct-hstack>
                {ifElse(
                  computed(() => totalTimeValue !== null),
                  <ct-hstack style={{ gap: "8px", padding: "12px", background: "#f3f4f6", borderRadius: "8px" }}>
                    <span style={{ fontWeight: "600" }}>Total Time:</span>
                    <span>{totalTimeValue} minutes</span>
                  </ct-hstack>,
                  null
                )}
              </ct-vstack>
            </ct-tab-panel>
          </ct-tabs>
          )}
        </ct-vstack>
      ),
      title,
      notes,
      enabledSubCharms,
      pinnedModules,
      birthdayData,
      ratingData,
      tagsData,
      contactData,
      // Wave 2
      statusData,
      addressData,
      timelineData,
      socialData,
      linkData,
      // Wave 3
      locationData,
      relationshipData,
      giftPrefsData,
      timingData,
      // Export context for charm linking (future extraction)
      recordContext,
      "#record": true, // Discoverable via wish({ query: "#record" })
    };
  }
);

export default Record;
