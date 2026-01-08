/// <cts-enable />
/**
 * MINIMAL REPRO: fetchData with EMPTY URL inside .map() causes Frame mismatch
 *
 * Key insight: The bug only triggers when fetchData URLs are empty strings.
 * When URLs have data (like JSONPlaceholder), everything works fine.
 * When URLs are empty (conditional fetch that should be skipped), crash!
 */

import {
  Writable,
  Default,
  derive,
  fetchData,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// Types
type User = { id: number; name: string; email: string };

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>; // When false, URLs are empty
}

interface Output {
  ids: Writable<number[]>;
  enableFetching: Writable<boolean>;
}

const addId = handler<unknown, { ids: Writable<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  }
);

const clearAll = handler<unknown, { ids: Writable<number[]> }>((_, { ids }) => {
  ids.set([]);
});

const toggleFetching = handler<unknown, { enableFetching: Writable<boolean> }>(
  (_, { enableFetching }) => {
    enableFetching.set(!enableFetching.get());
  }
);

export default pattern<Input, Output>(({ ids, enableFetching }) => {
  // This is the KEY: URLs return empty string when fetching is disabled
  // EXACTLY like github-momentum-tracker when hasAuth is false

  const results = ids.map((idCell) => {
    // URL is EMPTY when enableFetching is false
    const apiUrl = derive(
      { enableFetching, idCell },
      (values) => {
        const enabled = (values.enableFetching as any)?.get
          ? (values.enableFetching as any).get()
          : values.enableFetching;
        const id = (values.idCell as any)?.get
          ? (values.idCell as any).get()
          : values.idCell;

        // THE BUG TRIGGER: Return empty string when not enabled
        return enabled ? `https://jsonplaceholder.typicode.com/users/${id}` : "";
      }
    );

    // fetchData with potentially empty URL
    const userData = fetchData<User>({ url: apiUrl, mode: "json" });

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

        <p style={{ background: "#fff3cd", padding: "10px", borderRadius: "4px" }}>
          <strong>BUG:</strong> fetchData inside .map() with empty URL causes Frame mismatch
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={addId({ ids, newId: 1 })}>Add ID 1</button>{" "}
          <button onClick={addId({ ids, newId: 2 })}>Add ID 2</button>{" "}
          <button onClick={clearAll({ ids })}>Clear All</button>{" "}
          <button
            onClick={toggleFetching({ enableFetching })}
            style={{
              background: derive(enableFetching, e => e ? "#28a745" : "#dc3545"),
              color: "white",
              border: "none",
              padding: "5px 10px",
              borderRadius: "4px"
            }}
          >
            Fetching: {derive(enableFetching, e => e ? "ON" : "OFF")}
          </button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong> {derive(ids, (arr) => arr.length === 0 ? "(empty)" : arr.join(", "))}
          {" | "}
          <strong>Fetching Enabled:</strong> {derive(enableFetching, e => e ? "YES (URLs have data)" : "NO (URLs are empty)")}
        </div>

        <h2>Results (check console for Frame mismatch errors):</h2>

        <div>
          {results.map((item) => (
            <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>ID: {item.id}</div>
              <div>
                <strong>User:</strong>{" "}
                {derive(item.userData, (u) => u?.result ? u.result.name : u?.pending ? "..." : "—")}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f8d7da", borderRadius: "4px" }}>
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
