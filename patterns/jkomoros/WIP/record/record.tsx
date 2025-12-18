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
  LinkData,
  RatingData,
  RecordInput,
  SocialData,
  StatusData,
  SubCharmType,
  TagsData,
  TimelineData,
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
}

const Record = recipe<RecordInput, RecordOutput>(
  "Record",
  ({ title, notes, enabledSubCharms, birthdayData, ratingData, tagsData, contactData, statusData, addressData, timelineData, socialData, linkData }) => {
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
      { detail: { text: string } },
      { tagsData: Cell<TagsData> }
    >(({ detail }, { tagsData }) => {
      const newTag = detail?.text?.trim();
      if (!newTag) return;
      const current = tagsData.get();
      if (!current.tags.includes(newTag)) {
        tagsData.set({ ...current, tags: [...current.tags, newTag] });
      }
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
                <ct-autocomplete
                  $value={tagsValue}
                  placeholder="Add tags..."
                  multiple
                  allowCustom
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
      "#record": true, // Discoverable via wish({ query: "#record" })
    };
  }
);

export default Record;
