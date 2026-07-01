/**
 * Repro: Does `wish` primitive interact badly with fetchData inside .map()?
 *
 * github-momentum-tracker uses:
 *   const discoveredAuth = wish<{ token: string }>("#githubAuth");
 *
 * Then uses that in derive() inside the .map() callback.
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
  wish,
  Writable,
} from "commonfabric";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Writable<Default<number[], []>>;
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  ids: number[];
}

// Handler to add a new ID
const addId = handler<unknown, { ids: Writable<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  },
);

// Handler to clear all
const clearAll = handler<unknown, { ids: Writable<number[]> }>((_, { ids }) => {
  ids.set([]);
});

export default pattern<Input, Output>(({ ids }) => {
  // USE WISH - This is from github-momentum-tracker
  // Even if nothing is discovered, the wish() call itself might be the trigger
  const discoveredConfig = wish<{ multiplier: number }>({
    query: "#testConfig",
  });

  // Derive a boolean from the wish result (like hasAuth in momentum tracker)
  const hasConfig = computed(() => !!discoveredConfig?.result?.multiplier);

  // Map over ids using the EXACT PATTERN from github-momentum-tracker
  const results = ids.map((idCell) => {
    // Parse ref similar to github-momentum-tracker
    const ref = computed(() => ({ userId: idCell }));

    // THE PATTERN: derive with object params including wish-derived value
    const apiUrl = computed(() => {
      const r = ref;
      // Always fetch (config doesn't actually gate this in test)
      return r
        ? `https://jsonplaceholder.typicode.com/users/${r.userId}`
        : "";
    });

    // First fetch
    const userData = fetchJson<User>({ url: apiUrl });

    // Derive dependent data
    const samplePages = computed(() => {
      const r = ref;
      const u = userData;

      if (!r || !u?.result?.id) {
        return { userId: 0, pages: [] as number[] };
      }

      return {
        userId: u.result.id,
        pages: [1, 2, 3, 4, 5].map((i) => (u.result!.id - 1) * 5 + i),
      };
    });

    // Create slot URLs (one computed per slot; computed() must be authored in
    // an allowed context, so inline them rather than via a factory function)
    const slotUrl0 = computed(() =>
      !samplePages.userId || 0 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[0]}`
    );
    const slotUrl1 = computed(() =>
      !samplePages.userId || 1 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[1]}`
    );
    const slotUrl2 = computed(() =>
      !samplePages.userId || 2 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[2]}`
    );
    const slotUrl3 = computed(() =>
      !samplePages.userId || 3 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[3]}`
    );
    const slotUrl4 = computed(() =>
      !samplePages.userId || 4 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[4]}`
    );

    // Create 5 fetchData slots
    const slot0 = fetchJson<Todo>({ url: slotUrl0 });
    const slot1 = fetchJson<Todo>({ url: slotUrl1 });
    const slot2 = fetchJson<Todo>({ url: slotUrl2 });
    const slot3 = fetchJson<Todo>({ url: slotUrl3 });
    const slot4 = fetchJson<Todo>({ url: slotUrl4 });

    return {
      id: idCell,
      userData,
      slots: [slot0, slot1, slot2, slot3, slot4],
    };
  });

  return {
    [NAME]: "fetchData + wish() Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData + wish() Repro</h1>

        <p>
          Tests if <code>wish()</code>{" "}
          primitive interacts badly with fetchData inside <code>.map()</code>
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button type="button" onClick={addId({ ids, newId: 1 })}>
            Add ID 1
          </button>{" "}
          <button type="button" onClick={addId({ ids, newId: 2 })}>
            Add ID 2
          </button>{" "}
          <button type="button" onClick={clearAll({ ids })}>Clear All</button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong>{" "}
          {computed(() => {
            const arr = ids.get();
            return arr.length === 0 ? "(empty)" : arr.join(", ");
          })}
          {" | "}
          <strong>wish() found:</strong>{" "}
          {computed(() => discoveredConfig?.result?.multiplier ? "Yes" : "No")}
        </div>

        <h2>Results (check console for errors):</h2>

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

              <div style={{ marginBottom: "8px" }}>
                <strong>User:</strong> {computed(() =>
                  item.userData?.result
                    ? item.userData.result.name
                    : item.userData?.pending
                    ? "..."
                    : "✗"
                )}
              </div>

              <div>
                <strong>Dependent slots:</strong>
                <div
                  style={{
                    fontSize: "12px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px",
                    marginTop: "4px",
                  }}
                >
                  {item.slots.map((s, i) => (
                    <span
                      style={{
                        padding: "2px 6px",
                        background: "#eee",
                        borderRadius: "3px",
                      }}
                    >
                      #{i}: {computed(() =>
                        s?.result?.title?.substring(0, 8) ||
                        (s?.pending ? "..." : "✗"))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "#fff3cd",
            borderRadius: "4px",
          }}
        >
          <strong>Test:</strong>{" "}
          Does wish() + fetchData inside .map() trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
