/// <cts-enable />
/**
 * Minimal reproduction: fetchData inside .map() causes Frame mismatch
 *
 * Finding: 12 simple fetchData per item works!
 * Testing: Dependency chains where fetchData URL depends on another fetchData result
 * (This matches github-momentum-tracker where starSample URLs depend on metadata.result)
 */

import {
  Cell,
  Default,
  derive,
  fetchData,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// Types
type Todo = { userId: number; id: number; title: string; completed: boolean };
type User = { id: number; name: string; email: string };

interface Input {
  ids?: Default<number[], []>;
}

interface Output {
  ids: Cell<number[]>;
}

// Handler to add a new ID
const addId = handler<unknown, { ids: Cell<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  }
);

// Handler to clear all
const clearAll = handler<unknown, { ids: Cell<number[]> }>((_, { ids }) => {
  ids.set([]);
});

export default pattern<Input, Output>(({ ids }) => {
  // Map over ids with DEPENDENCY CHAIN pattern (like github-momentum-tracker)
  const results = ids.map((idCell) => {
    // First fetch: Get user data (like metadata in github-momentum-tracker)
    const userUrl = derive(idCell, (id) => `https://jsonplaceholder.typicode.com/users/${id}`);
    const userData = fetchData<User>({ url: userUrl, mode: "json" });

    // Derive dependent data from first fetch result (like samplePages from metadata)
    // This creates the dependency chain that might trigger the bug
    const dependentData = derive(userData, (u) => {
      if (!u?.result?.id) return { userId: 0, todoIds: [] as number[] };
      return {
        userId: u.result.id,
        // Get 5 todo IDs based on the user's id
        todoIds: [1, 2, 3, 4, 5].map(i => (u.result.id - 1) * 5 + i),
      };
    });

    // Create URLs that depend on the first fetch's result (like makeSlotUrl in github-momentum-tracker)
    const makeDepUrl = (slot: number) =>
      derive(dependentData, (dep) => {
        if (!dep.userId || slot >= dep.todoIds.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${dep.todoIds[slot]}`;
      });

    // Create 5 fetchData slots whose URLs depend on first fetch's result
    const depFetch0 = fetchData<Todo>({ url: makeDepUrl(0), mode: "json" });
    const depFetch1 = fetchData<Todo>({ url: makeDepUrl(1), mode: "json" });
    const depFetch2 = fetchData<Todo>({ url: makeDepUrl(2), mode: "json" });
    const depFetch3 = fetchData<Todo>({ url: makeDepUrl(3), mode: "json" });
    const depFetch4 = fetchData<Todo>({ url: makeDepUrl(4), mode: "json" });

    return {
      id: idCell,
      userData,
      dependentFetches: [depFetch0, depFetch1, depFetch2, depFetch3, depFetch4],
    };
  });

  return {
    [NAME]: "fetchData .map() Repro (Dep Chain)",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData inside .map() - Dependency Chain</h1>

        <p>
          Tests fetchData URLs that depend on another fetchData result
          (matching github-momentum-tracker's starSample pattern).
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={addId({ ids, newId: 1 })}>Add ID 1</button>{" "}
          <button onClick={addId({ ids, newId: 2 })}>Add ID 2</button>{" "}
          <button onClick={clearAll({ ids })}>Clear All</button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs in array:</strong>{" "}
          {derive(ids, (arr) => (arr.length === 0 ? "(empty)" : arr.join(", ")))}
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
                <strong>User (primary fetch):</strong>{" "}
                {derive(item.userData, (u) =>
                  u?.result ? u.result.name : u?.pending ? "Loading..." : "✗"
                )}
              </div>

              <div>
                <strong>Dependent fetches (URLs derived from user data):</strong>
                <div style={{ fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {item.dependentFetches.map((f, i) => (
                    <span style={{ padding: "2px 6px", background: "#eee", borderRadius: "3px" }}>
                      #{i}: {derive(f, (r) => r?.result?.title?.substring(0, 10) || (r?.pending ? "..." : "✗"))}
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
          <strong>Test:</strong> Does dependency chain (fetchData URL depending on another fetchData result) cause Frame mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
