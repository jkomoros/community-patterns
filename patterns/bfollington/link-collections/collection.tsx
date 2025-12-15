/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  str,
  UI,
} from "commontools";
import type {
  Collection,
  CollectionDetailInput,
  CollectionDetailOutput,
  Link,
} from "./schemas.tsx";

/**
 * Collection Detail - View/edit a single collection's links
 *
 * Features:
 * - Display links in this collection
 * - Add new links
 * - Remove links from collection
 * - Edit link details
 */

// Handler to add a new link to this collection
const addLink = handler<
  unknown,
  {
    collection: Cell<Collection>;
    allLinks: Cell<Link[]>;
    titleInput: Cell<string>;
    urlInput: Cell<string>;
    descInput: Cell<string>;
  }
>((_event, { collection, allLinks, titleInput, urlInput, descInput }) => {
  const title = titleInput.get().trim();
  const url = urlInput.get().trim();
  if (!title || !url) return;

  const newLink: Link = {
    title,
    url,
    description: descInput.get(),
    relatedLinks: [],
    createdAt: Date.now(),
  };

  // Add to global links
  allLinks.push(newLink);

  // Add to this collection's links
  const col = collection.get();
  const currentLinks = col.links || [];
  collection.set({
    ...col,
    links: [...currentLinks, newLink],
  });

  // Clear inputs
  titleInput.set("");
  urlInput.set("");
  descInput.set("");
});

// Handler to remove a link from this collection
const removeLink = handler<
  unknown,
  { collection: Cell<Collection>; linkToRemove: Link }
>((_event, { collection, linkToRemove }) => {
  const col = collection.get();
  const currentLinks = col.links || [];
  const index = currentLinks.findIndex((l) => l.url === linkToRemove.url);
  if (index >= 0) {
    collection.set({
      ...col,
      links: currentLinks.toSpliced(index, 1),
    });
  }
});

// Handler to add a bidirectional relationship between two links
const addRelationship = handler<
  unknown,
  {
    collection: Cell<Collection>;
    linkA: Link;
    linkB: Link;
  }
>((_event, { collection, linkA, linkB }) => {
  const a = linkA;
  const b = linkB;

  // Prevent self-relation
  if (a.url === b.url) return;

  // Check if relationship already exists
  const aRelated = a.relatedLinks || [];
  if (aRelated.some((l) => l.url === b.url)) return;

  // Update both links (bidirectional)
  const col = collection.get();
  const updatedLinks = (col.links || []).map((link) => {
    if (link.url === a.url) {
      return {
        ...link,
        relatedLinks: [...(link.relatedLinks || []), b],
      };
    }
    if (link.url === b.url) {
      return {
        ...link,
        relatedLinks: [...(link.relatedLinks || []), a],
      };
    }
    return link;
  });

  collection.set({
    ...col,
    links: updatedLinks as Link[],
  });
});

// Handler to remove a relationship between two links
const _removeRelationship = handler<
  unknown,
  {
    collection: Cell<Collection>;
    linkA: Link;
    linkB: Link;
  }
>((_event, { collection, linkA, linkB }) => {
  const a = linkA;
  const b = linkB;

  const col = collection.get();
  const updatedLinks = (col.links || []).map((link) => {
    if (link.url === a.url) {
      return {
        ...link,
        relatedLinks: (link.relatedLinks || []).filter((l) => l.url !== b.url),
      };
    }
    if (link.url === b.url) {
      return {
        ...link,
        relatedLinks: (link.relatedLinks || []).filter((l) => l.url !== a.url),
      };
    }
    return link;
  });

  collection.set({
    ...col,
    links: updatedLinks as Link[],
  });
});

// Handler to start editing a link
const startEditing = handler<
  unknown,
  {
    editingLinkUrl: Cell<string>;
    editTitle: Cell<string>;
    editUrl: Cell<string>;
    editDesc: Cell<string>;
    link: Link;
  }
>((_event, { editingLinkUrl, editTitle, editUrl, editDesc, link }) => {
  console.log("[startEditing] link:", link);
  editingLinkUrl.set(link.url);
  editTitle.set(link.title);
  editUrl.set(link.url);
  editDesc.set(link.description || "");
});

// Handler to save edits to a link
const saveEdit = handler<
  unknown,
  {
    collection: Cell<Collection>;
    editingLinkUrl: Cell<string>;
    editTitle: Cell<string>;
    editUrl: Cell<string>;
    editDesc: Cell<string>;
  }
>((_event, { collection, editingLinkUrl, editTitle, editUrl, editDesc }) => {
  const originalUrl = editingLinkUrl.get();
  const newTitle = editTitle.get().trim();
  const newUrl = editUrl.get().trim();
  const newDesc = editDesc.get();

  if (!newTitle || !newUrl) return;

  const col = collection.get();
  const updatedLinks = (col.links || []).map((link) => {
    if (link.url === originalUrl) {
      return {
        ...link,
        title: newTitle,
        url: newUrl,
        description: newDesc,
      };
    }
    return link;
  });

  collection.set({
    ...col,
    links: updatedLinks as Link[],
  });

  // Clear editing state
  editingLinkUrl.set("");
});

// Handler to cancel editing
const cancelEdit = handler<
  unknown,
  { editingLinkUrl: Cell<string> }
>((_event, { editingLinkUrl }) => {
  editingLinkUrl.set("");
});

// Handler to export collection as JSON
const exportToJson = handler<
  unknown,
  { collection: Cell<Collection>; exportOutput: Cell<string> }
>((_event, { collection, exportOutput }) => {
  const col = collection.get();
  const exportData = {
    name: col.name,
    description: col.description,
    links: (col.links || []).map((link) => ({
      title: link.title,
      url: link.url,
      description: link.description,
      relatedLinks: (link.relatedLinks || []).map((r) => ({
        title: r.title,
        url: r.url,
      })),
    })),
  };
  exportOutput.set(JSON.stringify(exportData, null, 2));
});

// Handler to import links from JSON
const importFromJson = handler<
  unknown,
  {
    collection: Cell<Collection>;
    allLinks: Cell<Link[]>;
    importInput: Cell<string>;
  }
>((_event, { collection, allLinks, importInput }) => {
  const jsonStr = importInput.get().trim();
  if (!jsonStr) return;

  try {
    const data = JSON.parse(jsonStr);
    if (!data.links || !Array.isArray(data.links)) {
      console.error("Invalid import format: missing links array");
      return;
    }

    const col = collection.get();
    const existingUrls = new Set((col.links || []).map((l) => l.url));
    const newLinks: Link[] = [];

    for (const link of data.links) {
      if (!link.title || !link.url) continue;
      if (existingUrls.has(link.url)) continue; // Skip duplicates

      const newLink: Link = {
        title: link.title,
        url: link.url,
        description: link.description || "",
        relatedLinks: [], // Relationships need to be rebuilt after import
        createdAt: Date.now(),
      };
      newLinks.push(newLink);
      allLinks.push(newLink);
    }

    if (newLinks.length > 0) {
      collection.set({
        ...col,
        links: [...(col.links || []), ...newLinks],
      });
    }

    importInput.set("");
  } catch (e) {
    console.error("Failed to parse JSON:", e);
  }
});

export default pattern<CollectionDetailInput, CollectionDetailOutput>(
  ({ collection, allLinks, allCollections: _allCollections }) => {
    // Form inputs for adding new links
    const titleInput = cell("");
    const urlInput = cell("");
    const descInput = cell("");

    // Edit mode state
    const editingLinkUrl = cell(""); // URL of link being edited (empty = none)
    const editTitle = cell("");
    const editUrl = cell("");
    const editDesc = cell("");

    // Export/Import state
    const exportOutput = cell("");
    const importInput = cell("");

    // Derive the links list
    const links = derive(
      collection,
      (col: Collection) => col.links || [],
    );

    return {
      [NAME]: str`${derive(collection, (c: Collection) => c.name)}`,
      [UI]: (
        <div
          style={{
            padding: "1.5rem",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            maxWidth: "800px",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: "600",
                marginBottom: "0.5rem",
                color: "#1c1c1e",
              }}
            >
              {derive(collection, (c: Collection) => c.name)}
            </h1>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#666",
              }}
            >
              {derive(collection, (c: Collection) => c.description)}
            </p>
          </div>

          {/* Export/Import section */}
          <details style={{ marginBottom: "1.5rem" }}>
            <summary
              style={{
                fontSize: "0.875rem",
                color: "#007AFF",
                cursor: "pointer",
                marginBottom: "0.5rem",
              }}
            >
              Export / Import JSON
            </summary>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fafafa",
                borderRadius: "8px",
                marginTop: "0.5rem",
              }}
            >
              {/* Export */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "500",
                    color: "#666",
                    marginBottom: "0.5rem",
                  }}
                >
                  Export
                </div>
                <button
                  type="button"
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#007AFF",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    marginBottom: "0.5rem",
                  }}
                  onClick={exportToJson({ collection, exportOutput })}
                >
                  Generate JSON
                </button>
                {ifElse(
                  derive(exportOutput, (o: string) => o.length > 0),
                  <ct-textarea
                    $value={exportOutput}
                    style="width: 100%; min-height: 100px; font-family: monospace; font-size: 0.75rem;"
                  />,
                  <></>,
                )}
              </div>

              {/* Import */}
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "500",
                    color: "#666",
                    marginBottom: "0.5rem",
                  }}
                >
                  Import (paste JSON)
                </div>
                <ct-textarea
                  $value={importInput}
                  placeholder='{"links": [{"title": "...", "url": "..."}]}'
                  style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.75rem; margin-bottom: 0.5rem;"
                />
                <button
                  type="button"
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#34C759",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                  onClick={importFromJson({
                    collection,
                    allLinks,
                    importInput,
                  })}
                >
                  Import Links
                </button>
              </div>
            </div>
          </details>

          {/* Add new link form */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#f5f5f7",
              borderRadius: "12px",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#666",
                marginBottom: "0.75rem",
              }}
            >
              Add Link
            </div>
            <ct-input
              $value={titleInput}
              placeholder="Title"
              style="width: 100%; margin-bottom: 0.5rem;"
            />
            <ct-input
              $value={urlInput}
              placeholder="URL (https://...)"
              style="width: 100%; margin-bottom: 0.5rem;"
            />
            <ct-input
              $value={descInput}
              placeholder="Notes (optional)"
              style="width: 100%; margin-bottom: 0.75rem;"
            />
            <button
              type="button"
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#007AFF",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontWeight: "500",
                cursor: "pointer",
              }}
              onClick={addLink({
                collection,
                allLinks,
                titleInput,
                urlInput,
                descInput,
              })}
            >
              Add Link
            </button>
          </div>

          {/* Links list */}
          <div>
            {links.map((link) => (
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "white",
                  border: "1px solid #e5e5e7",
                  borderRadius: "10px",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {/* View/Edit mode for link content */}
                    {ifElse(
                      computed(() =>
                        editingLinkUrl.get() !== "" &&
                        editingLinkUrl.get() === (link as unknown as Link).url
                      ),
                      // Edit mode
                      <div>
                        <ct-input
                          $value={editTitle}
                          placeholder="Title"
                          style="width: 100%; margin-bottom: 0.5rem;"
                        />
                        <ct-input
                          $value={editUrl}
                          placeholder="URL"
                          style="width: 100%; margin-bottom: 0.5rem;"
                        />
                        <ct-textarea
                          $value={editDesc}
                          placeholder="Notes..."
                          style="width: 100%; margin-bottom: 0.5rem; min-height: 60px;"
                        />
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            style={{
                              padding: "0.375rem 0.75rem",
                              backgroundColor: "#34C759",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.875rem",
                              cursor: "pointer",
                            }}
                            onClick={saveEdit({
                              collection,
                              editingLinkUrl,
                              editTitle,
                              editUrl,
                              editDesc,
                            })}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            style={{
                              padding: "0.375rem 0.75rem",
                              backgroundColor: "#f5f5f7",
                              color: "#666",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.875rem",
                              cursor: "pointer",
                            }}
                            onClick={cancelEdit({ editingLinkUrl })}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>,
                      // View mode
                      <div>
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: "600",
                            color: "#1c1c1e",
                            marginBottom: "0.25rem",
                          }}
                        >
                          {link.title}
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "0.8rem",
                            color: "#007AFF",
                            textDecoration: "none",
                          }}
                        >
                          {link.url}
                        </a>
                        <div
                          style={{
                            fontSize: "0.875rem",
                            color: "#666",
                            marginTop: "0.5rem",
                          }}
                        >
                          {link.description}
                        </div>
                      </div>,
                    )}

                    {/* Related Links Section */}
                    <div
                      style={{
                        marginTop: "0.75rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid #eee",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          color: "#999",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Related Links
                      </div>

                      {/* Show existing related links */}
                      {derive(link, (l: Link) => {
                        const related = l.relatedLinks || [];
                        if (related.length === 0) {
                          return (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#bbb",
                                fontStyle: "italic",
                              }}
                            >
                              No related links
                            </div>
                          );
                        }
                        return (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.25rem",
                            }}
                          >
                            {related.map((relatedLink: Link) => (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  padding: "0.125rem 0.5rem",
                                  backgroundColor: "#e8f4ff",
                                  color: "#007AFF",
                                  borderRadius: "12px",
                                  fontSize: "0.75rem",
                                }}
                              >
                                {relatedLink.title}
                              </span>
                            ))}
                          </div>
                        );
                      })}

                      {/* Add relationship dropdown */}
                      <div style={{ marginTop: "0.5rem" }}>
                        <details>
                          <summary
                            style={{
                              fontSize: "0.75rem",
                              color: "#007AFF",
                              cursor: "pointer",
                            }}
                          >
                            + Link to another item
                          </summary>
                          <div
                            style={{
                              marginTop: "0.5rem",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.25rem",
                            }}
                          >
                            {derive(links, (allLinksInCollection: Link[]) =>
                              allLinksInCollection
                                .filter((other) => {
                                  const currentUrl =
                                    (link as unknown as { url: string }).url;
                                  const relatedUrls = (
                                    (link as unknown as {
                                      relatedLinks?: Link[];
                                    })
                                      .relatedLinks || []
                                  ).map((r) => r.url);
                                  return (
                                    other.url !== currentUrl &&
                                    !relatedUrls.includes(other.url)
                                  );
                                })
                                .map((otherLink) => (
                                  <button
                                    type="button"
                                    style={{
                                      padding: "0.25rem 0.5rem",
                                      backgroundColor: "#f0f0f0",
                                      color: "#333",
                                      border: "none",
                                      borderRadius: "6px",
                                      fontSize: "0.7rem",
                                      cursor: "pointer",
                                    }}
                                    onClick={addRelationship({
                                      collection,
                                      linkA: link,
                                      linkB: otherLink,
                                    })}
                                  >
                                    {otherLink.title}
                                  </button>
                                )))}
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "#007AFF",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                      onClick={startEditing({
                        editingLinkUrl,
                        editTitle,
                        editUrl,
                        editDesc,
                        link,
                      })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "#f5f5f7",
                        color: "#666",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                      onClick={removeLink({ collection, linkToRemove: link })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {derive(links, (l: Link[]) =>
            l.length === 0
              ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No links yet. Add one above!
                </div>
              )
              : null)}
        </div>
      ),
      collection,
    };
  },
);
