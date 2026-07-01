/**
 * Repro: Does importing and instantiating another pattern inline
 * interact badly with fetchData inside .map()?
 *
 * github-momentum-tracker does:
 *   import GitHubAuth from "./github-auth.tsx";
 *   const inlineAuth = GitHubAuth({});
 *   // Then uses inlineAuth.token in derives
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
import SimpleConfig from "./simple-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
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
  // INSTANTIATE IMPORTED PATTERN - This is from github-momentum-tracker
  const inlineConfig = SimpleConfig({});

  // Derive a value from the imported pattern's output
  const hasConfig = computed(() => inlineConfig.multiplier > 0);

  // Map over ids using the pattern from github-momentum-tracker
  const results = ids.map((idCell) => {
    // Parse ref
    const ref = computed(() => ({ userId: idCell }));

    // THE PATTERN: derive with object params including imported pattern's value
    const apiUrl = computed(() => {
      const r = ref;
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
        pages: [1, 2, 3, 4, 5].map((i) => (u.result.id - 1) * 5 + i),
      };
    });

    // Create slot URLs (one computed per slot index)
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
    [NAME]: "fetchData + Imported Pattern Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData + Imported Pattern Repro</h1>

        <p>
          Tests if instantiating an imported pattern (<code>
            SimpleConfig({})
          </code>) interacts badly with fetchData inside <code>.map()</code>
        </p>

        <div style={{ marginBottom: "20px" }}>
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
          {computed(() =>
            ids.length === 0 ? "(empty)" : ids.join(", ")
          )}
          {" | "}
          <strong>hasConfig:</strong>{" "}
          {computed(() => hasConfig ? "Yes" : "No")}
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
                <strong>User:</strong> {computed(() => {
                  const u = item.userData;
                  return u?.result ? u.result.name : u?.pending ? "..." : "✗";
                })}
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
          Does imported pattern + fetchData inside .map() trigger Frame
          mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
