/// <cts-enable />
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
  Writable,
  Default,
  derive,
  fetchData,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";
import SimpleConfig from "./simple-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
}

interface Output {
  ids: Writable<number[]>;
}

// Handler to add a new ID
const addId = handler<unknown, { ids: Writable<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  }
);

// Handler to clear all
const clearAll = handler<unknown, { ids: Writable<number[]> }>((_, { ids }) => {
  ids.set([]);
});

export default pattern<Input, Output>(({ ids }) => {
  // INSTANTIATE IMPORTED PATTERN - This is from github-momentum-tracker
  const inlineConfig = SimpleConfig({});

  // Derive a value from the imported pattern's output
  const hasConfig = derive(inlineConfig.multiplier, (m: number) => m > 0);

  // Map over ids using the pattern from github-momentum-tracker
  const results = ids.map((idCell) => {
    // Parse ref
    const ref = derive(idCell, (id) => ({ userId: id }));

    // THE PATTERN: derive with object params including imported pattern's value
    const apiUrl = derive(
      { hasConfig, ref },
      (values) => {
        const config = (values.hasConfig as any)?.get ? (values.hasConfig as any).get() : values.hasConfig;
        const r = (values.ref as any)?.get ? (values.ref as any).get() : values.ref;
        return r ? `https://jsonplaceholder.typicode.com/users/${r.userId}` : "";
      }
    );

    // First fetch
    const userData = fetchData<User>({ url: apiUrl, mode: "json" });

    // Derive dependent data
    const samplePages = derive(
      { hasConfig, parsedRef: ref, userData },
      (values) => {
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        const u = (values.userData as any)?.get ? (values.userData as any).get() : values.userData;

        if (!r || !u?.result?.id) {
          return { userId: 0, pages: [] as number[] };
        }

        return {
          userId: u.result.id,
          pages: [1, 2, 3, 4, 5].map(i => (u.result.id - 1) * 5 + i),
        };
      }
    );

    // Create slot URL factory
    const makeSlotUrl = (slotIndex: number) =>
      derive(samplePages, (sp) => {
        if (!sp.userId || slotIndex >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[slotIndex]}`;
      });

    // Create 5 fetchData slots
    const slot0 = fetchData<Todo>({ url: makeSlotUrl(0), mode: "json" });
    const slot1 = fetchData<Todo>({ url: makeSlotUrl(1), mode: "json" });
    const slot2 = fetchData<Todo>({ url: makeSlotUrl(2), mode: "json" });
    const slot3 = fetchData<Todo>({ url: makeSlotUrl(3), mode: "json" });
    const slot4 = fetchData<Todo>({ url: makeSlotUrl(4), mode: "json" });

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
          Tests if instantiating an imported pattern (<code>SimpleConfig({})</code>)
          interacts badly with fetchData inside <code>.map()</code>
        </p>

        <div style={{ marginBottom: "20px" }}>
          <strong>Inline Config:</strong> {inlineConfig}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={addId({ ids, newId: 1 })}>Add ID 1</button>{" "}
          <button onClick={addId({ ids, newId: 2 })}>Add ID 2</button>{" "}
          <button onClick={clearAll({ ids })}>Clear All</button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong> {derive(ids, (arr) => arr.length === 0 ? "(empty)" : arr.join(", "))}
          {" | "}
          <strong>hasConfig:</strong> {derive(hasConfig, (c) => c ? "Yes" : "No")}
        </div>

        <h2>Results (check console for errors):</h2>

        <div>
          {results.map((item) => (
            <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>ID: {item.id}</div>

              <div style={{ marginBottom: "8px" }}>
                <strong>User:</strong>{" "}
                {derive(item.userData, (u) => u?.result ? u.result.name : u?.pending ? "..." : "✗")}
              </div>

              <div>
                <strong>Dependent slots:</strong>
                <div style={{ fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {item.slots.map((s, i) => (
                    <span style={{ padding: "2px 6px", background: "#eee", borderRadius: "3px" }}>
                      #{i}: {derive(s, (r) => r?.result?.title?.substring(0, 8) || (r?.pending ? "..." : "✗"))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
          <strong>Test:</strong> Does imported pattern + fetchData inside .map() trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
