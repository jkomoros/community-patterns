/// <cts-enable />
/**
 * Minimal reproduction: fetchData inside .map() causes Frame mismatch
 *
 * Testing: The .get() casting pattern used in github-momentum-tracker
 * This pattern: (values.x as any)?.get ? (values.x as any).get() : values.x
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
type Todo = { userId: number; id: number; title: string; completed: boolean };
type User = { id: number; name: string; email: string };

interface Input {
  ids?: Default<number[], []>;
  // Simulate external dependency like authCharm
  externalFlag?: Default<boolean, true>;
}

interface Output {
  ids: Writable<number[]>;
  externalFlag: Writable<boolean>;
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

// Handler to toggle external flag
const toggleFlag = handler<unknown, { externalFlag: Writable<boolean> }>(
  (_, { externalFlag }) => {
    externalFlag.set(!externalFlag.get());
  }
);

export default pattern<Input, Output>(({ ids, externalFlag }) => {
  // Derive hasFlag similar to github-momentum-tracker's hasAuth pattern
  const hasFlag = derive(externalFlag, (f) => f === true);

  // Map over ids with THE EXACT PATTERN from github-momentum-tracker
  const results = ids.map((idCell) => {
    // Parse ref similar to github-momentum-tracker
    const ref = derive(idCell, (id) => ({ userId: id }));

    // THE CRITICAL PATTERN: derive with object params and .get() casting
    // This is EXACTLY how github-momentum-tracker does it
    const apiUrl = derive(
      { hasFlag, ref },
      (values) => {
        // This casting pattern is used in github-momentum-tracker
        const flag = (values.hasFlag as any)?.get ? (values.hasFlag as any).get() : values.hasFlag;
        const r = (values.ref as any)?.get ? (values.ref as any).get() : values.ref;
        return (flag && r) ? `https://jsonplaceholder.typicode.com/users/${r.userId}` : "";
      }
    );

    // First fetch with conditional URL
    const userData = fetchData<User>({ url: apiUrl, mode: "json" });

    // Derive dependent data from first fetch (like samplePages in github-momentum-tracker)
    const samplePages = derive(
      { hasFlag, parsedRef: ref, userData },
      (values) => {
        const flag = (values.hasFlag as any)?.get ? (values.hasFlag as any).get() : values.hasFlag;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        const u = (values.userData as any)?.get ? (values.userData as any).get() : values.userData;

        if (!flag || !r || !u?.result?.id) {
          return { userId: 0, pages: [] as number[] };
        }

        return {
          userId: u.result.id,
          pages: [1, 2, 3, 4, 5].map(i => (u.result.id - 1) * 5 + i),
        };
      }
    );

    // Create slot URL factory (like makeSlotUrl in github-momentum-tracker)
    const makeSlotUrl = (slotIndex: number) =>
      derive(samplePages, (sp) => {
        if (!sp.userId || slotIndex >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[slotIndex]}`;
      });

    // Create 5 fetchData slots (like starSample0-9 in github-momentum-tracker)
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
          <button onClick={addId({ ids, newId: 1 })}>Add ID 1</button>{" "}
          <button onClick={addId({ ids, newId: 2 })}>Add ID 2</button>{" "}
          <button onClick={clearAll({ ids })}>Clear All</button>{" "}
          <button onClick={toggleFlag({ externalFlag })}>Toggle Flag</button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong> {derive(ids, (arr) => arr.length === 0 ? "(empty)" : arr.join(", "))}
          {" | "}
          <strong>Flag:</strong> {derive(externalFlag, (f) => f ? "ON" : "OFF")}
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
          <strong>Test:</strong> Does the .get() casting pattern trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
    externalFlag,
  };
});
