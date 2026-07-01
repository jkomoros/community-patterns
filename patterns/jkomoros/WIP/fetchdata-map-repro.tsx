/**
 * Minimal reproduction: fetchData inside .map() causes Frame mismatch
 *
 * Testing: The .get() casting pattern used in github-momentum-tracker
 * This pattern: (values.x as any)?.get ? (values.x as any).get() : values.x
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
type Todo = { userId: number; id: number; title: string; completed: boolean };
type User = { id: number; name: string; email: string };

interface Input {
  ids?: Default<number[], []>;
  // Simulate external dependency like authCharm
  externalFlag?: Default<boolean, true>;
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  ids: number[];
  externalFlag: boolean;
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

// Handler to toggle external flag
const toggleFlag = handler<unknown, { externalFlag: Writable<boolean> }>(
  (_, { externalFlag }) => {
    externalFlag.set(!externalFlag.get());
  },
);

export default pattern<Input, Output>(({ ids, externalFlag }) => {
  // Derive hasFlag similar to github-momentum-tracker's hasAuth pattern
  const hasFlag = computed(() => externalFlag === true);

  // Map over ids with THE EXACT PATTERN from github-momentum-tracker
  const results = ids.map((idCell) => {
    // Parse ref similar to github-momentum-tracker
    const ref = computed(() => ({ userId: idCell }));

    // THE CRITICAL PATTERN: derive with object params and .get() casting
    // This is EXACTLY how github-momentum-tracker does it
    const apiUrl = computed(() => {
      const flag = hasFlag;
      const r = ref;
      return (flag && r)
        ? `https://jsonplaceholder.typicode.com/users/${r.userId}`
        : "";
    });

    // First fetch with conditional URL
    const userData = fetchJson<User>({ url: apiUrl });

    // Derive dependent data from first fetch (like samplePages in github-momentum-tracker)
    const samplePages = computed(() => {
      const flag = hasFlag;
      const r = ref;
      const u = userData;

      if (!flag || !r || !u?.result?.id) {
        return { userId: 0, pages: [] as number[] };
      }

      return {
        userId: u.result.id,
        pages: [1, 2, 3, 4, 5].map((i) => (u.result.id - 1) * 5 + i),
      };
    });

    // Create slot URLs (like makeSlotUrl in github-momentum-tracker).
    // Inlined per-slot because computed() is not allowed inside a standalone
    // helper function in the new pattern context.
    const slotUrl0 = computed(() => {
      const sp = samplePages;
      if (!sp.userId || 0 >= sp.pages.length) return "";
      return `https://jsonplaceholder.typicode.com/todos/${sp.pages[0]}`;
    });
    const slotUrl1 = computed(() => {
      const sp = samplePages;
      if (!sp.userId || 1 >= sp.pages.length) return "";
      return `https://jsonplaceholder.typicode.com/todos/${sp.pages[1]}`;
    });
    const slotUrl2 = computed(() => {
      const sp = samplePages;
      if (!sp.userId || 2 >= sp.pages.length) return "";
      return `https://jsonplaceholder.typicode.com/todos/${sp.pages[2]}`;
    });
    const slotUrl3 = computed(() => {
      const sp = samplePages;
      if (!sp.userId || 3 >= sp.pages.length) return "";
      return `https://jsonplaceholder.typicode.com/todos/${sp.pages[3]}`;
    });
    const slotUrl4 = computed(() => {
      const sp = samplePages;
      if (!sp.userId || 4 >= sp.pages.length) return "";
      return `https://jsonplaceholder.typicode.com/todos/${sp.pages[4]}`;
    });

    // Create 5 fetchData slots (like starSample0-9 in github-momentum-tracker)
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
    [NAME]: "fetchData .map() Repro (.get() pattern)",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData inside .map() - .get() Casting Pattern</h1>

        <p>
          Tests the exact .get() casting pattern from github-momentum-tracker:
          <code style={{ background: "#eee", padding: "2px 4px" }}>
            (values.x as any)?.get ? (values.x as any).get() : values.x
          </code>
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
          <button type="button" onClick={toggleFlag({ externalFlag })}>
            Toggle Flag
          </button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong>{" "}
          {computed(() => ids.length === 0 ? "(empty)" : ids.join(", "))}
          {" | "}
          <strong>Flag:</strong>{" "}
          {computed(() => externalFlag ? "ON" : "OFF")}
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
          Does the .get() casting pattern trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
    externalFlag,
  };
});
