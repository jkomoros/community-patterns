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
  ({ title, notes, enabledSubCharms, birthdayData, ratingData, tagsData, contactData, statusData, addressData, timelineData, socialData, linkData, locationData, relationshipData, giftPrefsData, timingData }) => {
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

          {/* Tabbed Layout using ct-tabs */}
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
                <p style={{ color: "#666", fontSize: "13px", margin: "0" }}>
                  Your relationship with {recordContext.displayName}
                </p>
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
        </ct-vstack>
      ),
      title,
      notes,
      enabledSubCharms,
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
