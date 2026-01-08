/// <cts-enable />
/**
 * REPRO: Multiple fetchData with EMPTY URLs inside .map()
 *
 * Hypothesis: The bug triggers when MANY fetchData calls all have empty URLs
 * (like github-momentum-tracker without auth - 12+ empty URLs per item)
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
type Todo = { userId: number; id: number; title: string; completed: boolean };
type Post = { userId: number; id: number; title: string; body: string };

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>; // When false, ALL URLs are empty
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
  // Derive hasAuth-like flag
  const hasAuth = derive(enableFetching, (e) => e === true);

  const results = ids.map((idCell) => {
    // Parse ref (like parsedRef in momentum-tracker)
    const parsedRef = derive(idCell, (id) => ({ userId: id }));

    // ALL URLs depend on hasAuth - EMPTY when false
    // This mirrors github-momentum-tracker exactly

    // URL 1: User data (like metadata)
    const userUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const ref = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && ref ? `https://jsonplaceholder.typicode.com/users/${ref.userId}` : "";
      }
    );

    // URL 2: Todos (like commitActivity)
    const todosUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const ref = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && ref ? `https://jsonplaceholder.typicode.com/todos?userId=${ref.userId}` : "";
      }
    );

    // URL 3: Posts (like another API call)
    const postsUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const ref = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && ref ? `https://jsonplaceholder.typicode.com/posts?userId=${ref.userId}` : "";
      }
    );

    // Create fetchData calls - ALL will be empty when hasAuth is false
    const userData = fetchData<User>({ url: userUrl, mode: "json" });
    const todosData = fetchData<Todo[]>({ url: todosUrl, mode: "json" });
    const postsData = fetchData<Post[]>({ url: postsUrl, mode: "json" });

    // Now create 10 MORE fetchData calls (like starSample0-9)
    // These depend on userData result - so they're also empty when no auth
    const makeSlotUrl = (slotIndex: number) =>
      derive({ hasAuth, userResult: userData }, (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const u = (values.userResult as any)?.get ? (values.userResult as any).get() : values.userResult;
        if (!auth || !u?.result?.id) return "";
        return `https://jsonplaceholder.typicode.com/todos/${(u.result.id - 1) * 10 + slotIndex + 1}`;
      });

    const slot0 = fetchData<Todo>({ url: makeSlotUrl(0), mode: "json" });
    const slot1 = fetchData<Todo>({ url: makeSlotUrl(1), mode: "json" });
    const slot2 = fetchData<Todo>({ url: makeSlotUrl(2), mode: "json" });
    const slot3 = fetchData<Todo>({ url: makeSlotUrl(3), mode: "json" });
    const slot4 = fetchData<Todo>({ url: makeSlotUrl(4), mode: "json" });
    const slot5 = fetchData<Todo>({ url: makeSlotUrl(5), mode: "json" });
    const slot6 = fetchData<Todo>({ url: makeSlotUrl(6), mode: "json" });
    const slot7 = fetchData<Todo>({ url: makeSlotUrl(7), mode: "json" });
    const slot8 = fetchData<Todo>({ url: makeSlotUrl(8), mode: "json" });
    const slot9 = fetchData<Todo>({ url: makeSlotUrl(9), mode: "json" });

    return {
      id: idCell,
      userData,
      todosData,
      postsData,
      slots: [slot0, slot1, slot2, slot3, slot4, slot5, slot6, slot7, slot8, slot9],
    };
  });

  return {
    [NAME]: "Multi-Empty URL Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Multi-Empty URL Repro</h1>

        <p style={{ background: "#fff3cd", padding: "10px", borderRadius: "4px" }}>
          <strong>Hypothesis:</strong> Bug triggers with MULTIPLE fetchData all having empty URLs
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
          <strong>hasAuth:</strong> {derive(hasAuth, h => h ? "YES" : "NO")}
          {" | "}
          <strong>fetchData per item:</strong> 13 (3 main + 10 slots)
        </div>

        <h2>Results:</h2>

        <div>
          {results.map((item) => (
            <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>ID: {item.id}</div>

              <div style={{ marginBottom: "4px" }}>
                <strong>User:</strong>{" "}
                {derive(item.userData, (u) => u?.result?.name || (u?.pending ? "..." : "—"))}
              </div>

              <div style={{ marginBottom: "4px" }}>
                <strong>Todos:</strong>{" "}
                {derive(item.todosData, (t) => t?.result?.length ? `${t.result.length} items` : (t?.pending ? "..." : "—"))}
              </div>

              <div style={{ marginBottom: "4px" }}>
                <strong>Posts:</strong>{" "}
                {derive(item.postsData, (p) => p?.result?.length ? `${p.result.length} items` : (p?.pending ? "..." : "—"))}
              </div>

              <div>
                <strong>10 Slots:</strong>
                <div style={{ fontSize: "11px", display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px" }}>
                  {item.slots.map((s, i) => (
                    <span style={{ padding: "2px 4px", background: "#eee", borderRadius: "2px" }}>
                      #{i}: {derive(s, (r) => r?.result?.id || (r?.pending ? "..." : "—"))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f8d7da", borderRadius: "4px" }}>
          <strong>Steps:</strong>
          <ol>
            <li>Keep "Fetching: OFF" (ALL 13 URLs per item will be empty)</li>
            <li>Click "Add ID 1"</li>
            <li>Check console for Frame mismatch</li>
          </ol>
        </div>
      </div>
    ),
    ids,
    enableFetching,
  };
});
