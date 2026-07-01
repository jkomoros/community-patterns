/**
 * MINIMAL REPRO: fetchData with EMPTY URL inside .map() causes Frame mismatch
 *
 * Key insight: The bug only triggers when fetchData URLs are empty strings.
 * When URLs have data (like JSONPlaceholder), everything works fine.
 * When URLs are empty (conditional fetch that should be skipped), crash!
 */

import {
  computed,
  Default,
  fetchJson,
  handler,
  NAME,
  pattern,
  UI,
  type VNode,
  Writable,
} from "commonfabric";

// Types
type User = { id: number; name: string; email: string };

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>; // When false, URLs are empty
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  ids: number[];
  enableFetching: boolean;
}

const addId = handler<unknown, { ids: Writable<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  },
);

const clearAll = handler<unknown, { ids: Writable<number[]> }>((_, { ids }) => {
  ids.set([]);
});

const toggleFetching = handler<unknown, { enableFetching: Writable<boolean> }>(
  (_, { enableFetching }) => {
    enableFetching.set(!enableFetching.get());
  },
);

export default pattern<Input, Output>(({ ids, enableFetching }) => {
  // This is the KEY: URLs return empty string when fetching is disabled
  // EXACTLY like github-momentum-tracker when hasAuth is false

  const results = ids.map((idCell) => {
    // URL is EMPTY when enableFetching is false
    const apiUrl = computed(() =>
      // THE BUG TRIGGER: Return empty string when not enabled
      enableFetching
        ? `https://jsonplaceholder.typicode.com/users/${idCell}`
        : ""
    );

    // fetchData with potentially empty URL
    const userData = fetchJson<User>({ url: apiUrl });

    return {
      id: idCell,
      userData,
    };
  });

  return {
    [NAME]: "fetchData Empty URL Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData Empty URL Repro</h1>

        <p
          style={{
            background: "#fff3cd",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          <strong>BUG:</strong>{" "}
          fetchData inside .map() with empty URL causes Frame mismatch
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button type="button" onClick={addId({ ids, newId: 1 })}>
            Add ID 1
          </button>{" "}
          <button type="button" onClick={addId({ ids, newId: 2 })}>
            Add ID 2
          </button>{" "}
          <button type="button" onClick={clearAll({ ids })}>Clear All</button>
          {" "}
          <button
            type="button"
            onClick={toggleFetching({ enableFetching })}
            style={{
              background: computed(() =>
                enableFetching ? "#28a745" : "#dc3545"
              ),
              color: "white",
              border: "none",
              padding: "5px 10px",
              borderRadius: "4px",
            }}
          >
            Fetching: {computed(() => enableFetching ? "ON" : "OFF")}
          </button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong>{" "}
          {computed(() =>
            ids.length === 0 ? "(empty)" : ids.join(", ")
          )}
          {" | "}
          <strong>Fetching Enabled:</strong> {computed(() =>
            enableFetching
              ? "YES (URLs have data)"
              : "NO (URLs are empty)"
          )}
        </div>

        <h2>Results (check console for Frame mismatch errors):</h2>

        <div>
          {results.map((item) => (
            <div
              style={{
                border: "1px solid #ccc",
                padding: "10px",
                marginBottom: "10px",
                borderRadius: "4px",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                ID: {item.id}
              </div>
              <div>
                <strong>User:</strong> {computed(() =>
                  item.userData.result
                    ? item.userData.result.name
                    : item.userData.pending
                    ? "..."
                    : "—"
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "#f8d7da",
            borderRadius: "4px",
          }}
        >
          <strong>Steps to reproduce:</strong>
          <ol>
            <li>Keep "Fetching: OFF" (default)</li>
            <li>Click "Add ID 1"</li>
            <li>Check console for "Frame mismatch" error</li>
          </ol>
        </div>
      </div>
    ),
    ids,
    enableFetching,
  };
});
