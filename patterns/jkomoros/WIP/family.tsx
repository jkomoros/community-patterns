/// <cts-enable />
/**
 * Family Pattern
 *
 * Represents a family unit for tracking reciprocal hosting.
 * Links to person.tsx charms and stores addresses for location matching.
 *
 * Discoverable via wish("#family") when favorited.
 */
import {
  Cell,
  cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";
import {
  Address,
  FamilyMember,
  FamilyRole,
  generateId,
} from "./util/hosting-types.ts";

// ============================================================================
// HANDLERS
// ============================================================================

// Handler to add a new family member
const addMember = handler<
  { detail: { message: string } },
  { members: Cell<FamilyMember[]> }
>(({ detail }, { members }) => {
  const name = detail?.message?.trim();
  if (!name) return;

  const newMember: FamilyMember = {
    id: generateId(),
    name,
    role: "parent", // Default role
  };

  members.push(newMember);
});

// Handler to remove a family member
const removeMember = handler<
  unknown,
  { members: Cell<FamilyMember[]>; memberId: string }
>((_, { members, memberId }) => {
  const current = members.get();
  const index = current.findIndex((m) => m.id === memberId);
  if (index >= 0) {
    members.set(current.toSpliced(index, 1));
  }
});

// Handler to update member role
const updateMemberRole = handler<
  { target: { value: FamilyRole } },
  { members: Cell<FamilyMember[]>; memberId: string }
>(({ target }, { members, memberId }) => {
  const current = members.get();
  const index = current.findIndex((m) => m.id === memberId);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], role: target.value };
    members.set(updated);
  }
});

// Handler to add a new address
const addAddress = handler<
  { detail: { message: string } },
  { addresses: Cell<Address[]> }
>(({ detail }, { addresses }) => {
  const fullAddress = detail?.message?.trim();
  if (!fullAddress) return;

  const current = addresses.get();
  const newAddress: Address = {
    id: generateId(),
    label: current.length === 0 ? "Home" : `Address ${current.length + 1}`,
    fullAddress,
    isPrimary: current.length === 0, // First address is primary
  };

  addresses.push(newAddress);
});

// Handler to remove an address
const removeAddress = handler<
  unknown,
  { addresses: Cell<Address[]>; addressId: string }
>((_, { addresses, addressId }) => {
  const current = addresses.get();
  const index = current.findIndex((a) => a.id === addressId);
  if (index >= 0) {
    const wasRemoved = current[index];
    const updated = current.toSpliced(index, 1);

    // If we removed the primary, make the first one primary
    if (wasRemoved.isPrimary && updated.length > 0) {
      updated[0] = { ...updated[0], isPrimary: true };
    }

    addresses.set(updated);
  }
});

// Handler to update address label
const updateAddressLabel = handler<
  { target: { value: string } },
  { addresses: Cell<Address[]>; addressId: string }
>(({ target }, { addresses, addressId }) => {
  const current = addresses.get();
  const index = current.findIndex((a) => a.id === addressId);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], label: target.value };
    addresses.set(updated);
  }
});

// Handler to set primary address
const setPrimaryAddress = handler<
  unknown,
  { addresses: Cell<Address[]>; addressId: string }
>((_, { addresses, addressId }) => {
  const current = addresses.get();
  const updated = current.map((addr) => ({
    ...addr,
    isPrimary: addr.id === addressId,
  }));
  addresses.set(updated);
});

// Handler to add a tag
const addTag = handler<
  { detail: { message: string } },
  { tags: Cell<string[]> }
>(({ detail }, { tags }) => {
  const tag = detail?.message?.trim().toLowerCase();
  if (!tag) return;

  const current = tags.get();
  if (!current.includes(tag)) {
    tags.push(tag);
  }
});

// Handler to remove a tag
const removeTag = handler<
  unknown,
  { tags: Cell<string[]>; tag: string }
>((_, { tags, tag }) => {
  const current = tags.get();
  const index = current.indexOf(tag);
  if (index >= 0) {
    tags.set(current.toSpliced(index, 1));
  }
});

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

interface FamilyInput {
  familyName: Default<string, "">;
  members: Default<FamilyMember[], []>;
  addresses: Default<Address[], []>;
  notes: Default<string, "">;
  tags: Default<string[], []>;
  connectionOrigin: Default<string, "">; // "School", "Soccer team", etc.
}

interface FamilyOutput extends FamilyInput {
  primaryAddress: Address | null;
  "#family": true;
}

// ============================================================================
// PATTERN
// ============================================================================

const Family = pattern<FamilyInput, FamilyOutput>(
  ({
    familyName,
    members,
    addresses,
    notes,
    tags,
    connectionOrigin,
  }) => {
    // Compute primary address
    const primaryAddress = derive(addresses, (addrs) =>
      addrs.find((a) => a.isPrimary) || addrs[0] || null
    );

    // Compute display name
    const displayName = derive(familyName, (name) =>
      name.trim() || "(Untitled Family)"
    );

    // Count children for display
    const childCount = derive(members, (m) =>
      m.filter((mem) => mem.role === "child").length
    );

    return {
      [NAME]: str`Family: ${displayName}`,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2>Family</h2>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 16px; gap: 20px;">
              {/* Basic Info Section */}
              <ct-vstack style="gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">
                  Basic Information
                </h3>

                <label>
                  Family Name
                  <ct-input
                    $value={familyName}
                    placeholder="e.g., The Smiths"
                  />
                </label>

                <label>
                  Connection Origin
                  <ct-input
                    $value={connectionOrigin}
                    placeholder="How you met (School, Sports team, etc.)"
                  />
                </label>
              </ct-vstack>

              {/* Members Section */}
              <ct-vstack style="gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">
                  Family Members
                </h3>

                {ifElse(
                  derive(members, (m) => m.length === 0),
                  <div style="color: #666; font-size: 13px; padding: 8px 0;">
                    No members added yet
                  </div>,
                  <ct-vstack style="gap: 6px;">
                    {members.map((member) => (
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          padding: "8px 12px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "6px",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <span style={{ flex: 1, fontWeight: 500 }}>
                          {member.name}
                        </span>
                        <select
                          value={member.role}
                          onChange={updateMemberRole({
                            members,
                            memberId: member.id,
                          })}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid #d1d5db",
                            fontSize: "13px",
                          }}
                        >
                          <option value="parent">Parent</option>
                          <option value="child">Child</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          onClick={removeMember({
                            members,
                            memberId: member.id,
                          })}
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            color: "#dc2626",
                            fontSize: "18px",
                            padding: "0 4px",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </ct-vstack>
                )}

                <ct-message-input
                  placeholder="Add family member..."
                  onct-send={addMember({ members })}
                />
              </ct-vstack>

              {/* Addresses Section */}
              <ct-vstack style="gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">
                  Addresses
                </h3>
                <p style="margin: 0; font-size: 12px; color: #666;">
                  Used for location matching in hosting tracker
                </p>

                {ifElse(
                  derive(addresses, (a) => a.length === 0),
                  <div style="color: #666; font-size: 13px; padding: 8px 0;">
                    No addresses added yet
                  </div>,
                  <ct-vstack style="gap: 6px;">
                    {addresses.map((addr) => (
                      <div
                        style={{
                          padding: "10px 12px",
                          backgroundColor: addr.isPrimary ? "#ecfdf5" : "#f9fafb",
                          borderRadius: "6px",
                          border: addr.isPrimary
                            ? "1px solid #22c55e"
                            : "1px solid #e5e7eb",
                        }}
                      >
                        <ct-hstack style="gap: 8px; align-items: center;">
                          <input
                            type="text"
                            value={addr.label}
                            onChange={updateAddressLabel({
                              addresses,
                              addressId: addr.id,
                            })}
                            style={{
                              width: "80px",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid #d1d5db",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          />
                          <span style={{ flex: 1, fontSize: "13px" }}>
                            {addr.fullAddress}
                          </span>
                          {ifElse(
                            addr.isPrimary,
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#16a34a",
                                fontWeight: 600,
                              }}
                            >
                              Primary
                            </span>,
                            <button
                              onClick={setPrimaryAddress({
                                addresses,
                                addressId: addr.id,
                              })}
                              style={{
                                padding: "2px 8px",
                                fontSize: "11px",
                                border: "1px solid #d1d5db",
                                borderRadius: "4px",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              Set Primary
                            </button>
                          )}
                          <button
                            onClick={removeAddress({
                              addresses,
                              addressId: addr.id,
                            })}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: "#dc2626",
                              fontSize: "18px",
                              padding: "0 4px",
                            }}
                          >
                            ×
                          </button>
                        </ct-hstack>
                      </div>
                    ))}
                  </ct-vstack>
                )}

                <ct-message-input
                  placeholder="Add address..."
                  onct-send={addAddress({ addresses })}
                />
              </ct-vstack>

              {/* Tags Section */}
              <ct-vstack style="gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">
                  Tags
                </h3>

                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  {tags.map((tag) => (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        backgroundColor: "#e0e7ff",
                        color: "#3730a3",
                        borderRadius: "9999px",
                        fontSize: "12px",
                      }}
                    >
                      {tag}
                      <button
                        onClick={removeTag({ tags, tag })}
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          color: "#6366f1",
                          fontSize: "14px",
                          padding: "0",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <ct-message-input
                  placeholder="Add tag..."
                  onct-send={addTag({ tags })}
                />
              </ct-vstack>

              {/* Notes Section */}
              <ct-vstack style="gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 600;">
                  Notes
                </h3>
                <ct-code-editor
                  $value={notes}
                  language="text/markdown"
                  theme="light"
                  wordWrap
                  placeholder="Any notes about this family..."
                  style="min-height: 120px;"
                />
              </ct-vstack>

              {/* Summary Section */}
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#f0f9ff",
                  borderRadius: "6px",
                  border: "1px solid #0ea5e9",
                  fontSize: "13px",
                }}
              >
                <strong>Summary:</strong>{" "}
                {derive(
                  { displayName, members, childCount, primaryAddress },
                  ({ displayName, members, childCount, primaryAddress }) => {
                    const parts: string[] = [];
                    parts.push(displayName);
                    if (members.length > 0) {
                      parts.push(
                        `${members.length} member${members.length === 1 ? "" : "s"}`
                      );
                      if (childCount > 0) {
                        parts.push(`(${childCount} ${childCount === 1 ? "child" : "children"})`);
                      }
                    }
                    if (primaryAddress) {
                      parts.push(`at ${primaryAddress.fullAddress}`);
                    }
                    return parts.join(" - ");
                  }
                )}
              </div>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),

      // Make discoverable via wish("#family")
      "#family": true,

      // Output all fields
      familyName,
      members,
      addresses,
      notes,
      tags,
      connectionOrigin,
      primaryAddress,
    };
  }
);

export default Family;
