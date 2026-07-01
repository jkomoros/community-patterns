/**
 * Combined repro: ALL patterns from github-momentum-tracker together
 *
 * Combines:
 * - wish() primitive
 * - Imported pattern instantiation
 * - Writable<object> input parameter
 * - ifElse conditional rendering
 * - 10 fetchData slots per item (like starSample0-9)
 * - Three-way derive combining multiple sources
 */

import {
  computed,
  Default,
  fetchJson,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  type VNode,
  wish,
  Writable,
} from "commonfabric";
import SimpleConfig from "./simple-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
  linkedConfig?: Writable<{ multiplier: number }>;
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

export default pattern<Input, Output>(({ ids, linkedConfig }) => {
  // 1. WISH - discover existing config
  const discoveredConfig = wish<{ multiplier: number }>({
    query: "#testConfig",
  });

  // 2. IMPORTED PATTERN - instantiate inline
  const inlineConfig = SimpleConfig({});

  // 3. THREE-WAY DERIVE - combine all sources (like effectiveToken in momentum tracker)
  const effectiveMultiplier = computed(() => {
    const discovered = discoveredConfig?.result;
    const passed = linkedConfig?.get();
    const inline = inlineConfig.multiplier;

    if (discovered?.multiplier) return discovered.multiplier;
    if (passed?.multiplier) return passed.multiplier;
    if (typeof inline === "number") return inline;
    return 1;
  });

  const hasConfig = computed(() => effectiveMultiplier > 0);

  // Map over ids using the EXACT PATTERN from github-momentum-tracker
  const results = ids.map((idCell) => {
    const ref = computed(() => ({ userId: idCell }));

    // THE PATTERN: derive combining hasConfig and ref
    const apiUrl = computed(() => {
      const config = hasConfig;
      const r = ref;
      return (config && r)
        ? `https://jsonplaceholder.typicode.com/users/${r.userId}`
        : "";
    });

    // First fetch
    const userData = fetchJson<User>({ url: apiUrl });

    // Derive samplePages from userData (like in momentum tracker)
    const samplePages = computed(() => {
      const config = hasConfig;
      const r = ref;
      const u = userData;

      if (!config || !r || !u?.result?.id) {
        return { userId: 0, pages: [] as number[] };
      }

      return {
        userId: u.result.id,
        pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
          (u.result!.id - 1) * 10 + i
        ),
      };
    });

    // Create 10 explicit slot URLs (one computed per slot; computed() must be
    // authored in an allowed context, so inline them rather than via a factory)
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
    const slotUrl5 = computed(() =>
      !samplePages.userId || 5 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[5]}`
    );
    const slotUrl6 = computed(() =>
      !samplePages.userId || 6 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[6]}`
    );
    const slotUrl7 = computed(() =>
      !samplePages.userId || 7 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[7]}`
    );
    const slotUrl8 = computed(() =>
      !samplePages.userId || 8 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[8]}`
    );
    const slotUrl9 = computed(() =>
      !samplePages.userId || 9 >= samplePages.pages.length
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${samplePages.pages[9]}`
    );

    // Create 10 explicit fetchData slots (like starSample0-9)
    const slot0 = fetchJson<Todo>({ url: slotUrl0 });
    const slot1 = fetchJson<Todo>({ url: slotUrl1 });
    const slot2 = fetchJson<Todo>({ url: slotUrl2 });
    const slot3 = fetchJson<Todo>({ url: slotUrl3 });
    const slot4 = fetchJson<Todo>({ url: slotUrl4 });
    const slot5 = fetchJson<Todo>({ url: slotUrl5 });
    const slot6 = fetchJson<Todo>({ url: slotUrl6 });
    const slot7 = fetchJson<Todo>({ url: slotUrl7 });
    const slot8 = fetchJson<Todo>({ url: slotUrl8 });
    const slot9 = fetchJson<Todo>({ url: slotUrl9 });

    // Aggregate (like starHistory in momentum tracker)
    const aggregated = computed(() => {
      const sp = samplePages;
      if (!sp.pages || sp.pages.length === 0) {
        return { loading: false, data: [] as string[] };
      }

      const samples = [
        slot0,
        slot1,
        slot2,
        slot3,
        slot4,
        slot5,
        slot6,
        slot7,
        slot8,
        slot9,
      ];

      const pending = samples.some((sample, i) => {
        if (i >= sp.pages.length) return false;
        return sample?.pending === true;
      });

      if (pending) return { loading: true, data: [] as string[] };

      const data: string[] = [];
      for (let i = 0; i < sp.pages.length && i < 10; i++) {
        const sample = samples[i];
        if (sample?.result?.title) {
          data.push(sample.result.title.substring(0, 15));
        }
      }

      return { loading: false, data };
    });

    return {
      id: idCell,
      userData,
      slots: [
        slot0,
        slot1,
        slot2,
        slot3,
        slot4,
        slot5,
        slot6,
        slot7,
        slot8,
        slot9,
      ],
      aggregated,
    };
  });

  const itemCount = computed(() => ids.length);

  return {
    [NAME]: "Combined fetchData Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Combined fetchData Repro</h1>

        <p>Combines ALL patterns from github-momentum-tracker:</p>
        <ul style={{ fontSize: "14px" }}>
          <li>wish() primitive</li>
          <li>Imported pattern (SimpleConfig)</li>
          <li>Cell&lt;object&gt; input</li>
          <li>Three-way derive</li>
          <li>10 fetchData slots per item</li>
          <li>ifElse conditional rendering</li>
        </ul>

        <div
          style={{
            marginBottom: "10px",
            padding: "10px",
            background: "#f0f0f0",
            borderRadius: "4px",
          }}
        >
          <strong>Inline Config:</strong> {inlineConfig}
        </div>

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
          {computed(() => ids.length === 0 ? "(empty)" : ids.join(", "))}
          {" | "}
          <strong>effectiveMultiplier:</strong> {effectiveMultiplier}
          {" | "}
          <strong>hasConfig:</strong>{" "}
          {computed(() => hasConfig ? "Yes" : "No")}
        </div>

        <h2>Results:</h2>

        {ifElse(
          computed(() => itemCount === 0),
          <div
            style={{
              padding: "20px",
              background: "#f8f9fa",
              borderRadius: "4px",
              textAlign: "center",
            }}
          >
            No items. Click "Add ID" to start.
          </div>,
          <div>
            {results.map((item) => {
              const isLoading = computed(() =>
                item.userData?.pending === true
              );
              const hasError = computed(() => !!item.userData?.error);
              const data = computed(() => item.userData?.result);

              return (
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

                  {ifElse(
                    isLoading,
                    <div>Loading...</div>,
                    ifElse(
                      hasError,
                      <div style={{ color: "red" }}>Error loading data</div>,
                      <div style={{ marginBottom: "8px" }}>
                        <strong>User:</strong>{" "}
                        {computed(() => data?.name || "—")}
                      </div>,
                    ),
                  )}

                  <div>
                    <strong>10 Slots:</strong>
                    <div
                      style={{
                        fontSize: "11px",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "3px",
                        marginTop: "4px",
                      }}
                    >
                      {item.slots.map((s, i) => (
                        <span
                          style={{
                            padding: "2px 4px",
                            background: "#eee",
                            borderRadius: "2px",
                          }}
                        >
                          #{i}: {computed(() =>
                            s?.result?.title?.substring(0, 6) ||
                            (s?.pending ? "..." : "✗"))}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    <strong>Aggregated:</strong> {computed(() =>
                      item.aggregated.loading
                        ? "Loading..."
                        : `${item.aggregated.data.length} items`)}
                  </div>
                </div>
              );
            })}
          </div>,
        )}

        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "#fff3cd",
            borderRadius: "4px",
          }}
        >
          <strong>Test:</strong> Does the COMBINATION trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
