/// <cts-enable />
import {
  derive,
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
  Writable,
  writable,
} from "commontools";
import type {
  Collection,
  Link,
  LinkCollectionsInput,
  LinkCollectionsOutput,
} from "./schemas.ts";
import CollectionDetail from "./collection.tsx";

/**
 * Link Collections - Main Pattern
 *
 * Lists all collections, allows creating new ones.
 * Entry point for the link collection system.
 */

// Handler to create a new collection
const createCollection = handler<
  unknown,
  {
    collections: Writable<Collection[]>;
    nameInput: Writable<string>;
    descInput: Writable<string>;
  }
>((_event, { collections, nameInput, descInput }) => {
  const name = nameInput.get().trim();
  if (!name) return;

  const newCollection: Collection = {
    name,
    description: descInput.get(),
    links: [],
    createdAt: Date.now(),
  };

  collections.push(newCollection);
  nameInput.set("");
  descInput.set("");
});

// Handler to delete a collection
const deleteCollection = handler<
  unknown,
  { collections: Writable<Collection[]>; collection: Collection }
>((_event, { collections, collection }) => {
  const current = collections.get();
  const index = current.findIndex((c) => c.name === collection.name);
  if (index >= 0) {
    collections.set(current.toSpliced(index, 1));
  }
});

// Handler to navigate to a collection detail view
const goToCollection = handler<
  unknown,
  {
    collection: Writable<Collection>;
    allLinks: Writable<Link[]>;
    allCollections: Writable<Collection[]>;
  }
>((_event, { collection, allLinks, allCollections }) => {
  const detailInstance = CollectionDetail({
    collection,
    allLinks,
    allCollections,
  });
  return navigateTo(detailInstance);
});

export default pattern<LinkCollectionsInput, LinkCollectionsOutput>(
  ({ collections, allLinks }) => {
    // Form inputs
    const nameInput = writable("");
    const descInput = writable("");

    // Derived count for each collection
    const collectionList = derive(collections, (cols) => cols || []);

    return {
      [NAME]: "Link Collections",
      [UI]: (
        <div
          style={{
            padding: "1.5rem",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            maxWidth: "800px",
          }}
        >
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: "600",
              marginBottom: "1.5rem",
              color: "#1c1c1e",
            }}
          >
            Link Collections
          </h1>

          {/* Create new collection form */}
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
              New Collection
            </div>
            <ct-input
              $value={nameInput}
              placeholder="Collection name"
              style="width: 100%; margin-bottom: 0.5rem;"
            />
            <ct-input
              $value={descInput}
              placeholder="Description (optional)"
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
              onClick={createCollection({ collections, nameInput, descInput })}
            >
              Create Collection
            </button>
          </div>

          {/* Collection list */}
          <div>
            {collectionList.map((col) => (
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "white",
                  border: "1px solid #e5e5e7",
                  borderRadius: "10px",
                  marginBottom: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "600",
                      color: "#1c1c1e",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {col.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "#666",
                    }}
                  >
                    {col.description}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#999",
                      marginTop: "0.25rem",
                    }}
                  >
                    {derive(col, (c) => (c.links || []).length)} links
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
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
                    }}
                    onClick={goToCollection({
                      collection: col,
                      allLinks,
                      allCollections: collections,
                    })}
                  >
                    View →
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
                    onClick={deleteCollection({ collections, collection: col })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {derive(collectionList, (cols: Collection[]) =>
            cols.length === 0
              ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No collections yet. Create one above!
                </div>
              )
              : null)}
        </div>
      ),
      collections,
      allLinks,
    };
  },
);
