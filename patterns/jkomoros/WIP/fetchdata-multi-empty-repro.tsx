/**
 * REPRO: Multiple fetchData with EMPTY URLs inside .map()
 *
 * Hypothesis: The bug triggers when MANY fetchData calls all have empty URLs
 * (like github-momentum-tracker without auth - 12+ empty URLs per item)
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
type Todo = { userId: number; id: number; title: string; completed: boolean };
type Post = { userId: number; id: number; title: string; body: string };

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>; // When false, ALL URLs are empty
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
  // Derive hasAuth-like flag
  const hasAuth = computed(() => enableFetching === true);

  const results = ids.map((idCell) => {
    // Parse ref (like parsedRef in momentum-tracker)
    const parsedRef = computed(() => ({ userId: idCell }));

    // ALL URLs depend on hasAuth - EMPTY when false
    // This mirrors github-momentum-tracker exactly

    // URL 1: User data (like metadata)
    const userUrl = computed(() =>
      hasAuth && parsedRef
        ? `https://jsonplaceholder.typicode.com/users/${parsedRef.userId}`
        : ""
    );

    // URL 2: Todos (like commitActivity)
    const todosUrl = computed(() =>
      hasAuth && parsedRef
        ? `https://jsonplaceholder.typicode.com/todos?userId=${parsedRef.userId}`
        : ""
    );

    // URL 3: Posts (like another API call)
    const postsUrl = computed(() =>
      hasAuth && parsedRef
        ? `https://jsonplaceholder.typicode.com/posts?userId=${parsedRef.userId}`
        : ""
    );

    // Create fetchData calls - ALL will be empty when hasAuth is false
    const userData = fetchJson<User>({ url: userUrl });
    const todosData = fetchJson<Todo[]>({ url: todosUrl });
    const postsData = fetchJson<Post[]>({ url: postsUrl });

    // Now create 10 MORE fetchData calls (like starSample0-9)
    // These depend on userData result - so they're also empty when no auth
    const slotUrl0 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 0 + 1
        }`
    );
    const slotUrl1 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 1 + 1
        }`
    );
    const slotUrl2 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 2 + 1
        }`
    );
    const slotUrl3 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 3 + 1
        }`
    );
    const slotUrl4 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 4 + 1
        }`
    );
    const slotUrl5 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 5 + 1
        }`
    );
    const slotUrl6 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 6 + 1
        }`
    );
    const slotUrl7 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 7 + 1
        }`
    );
    const slotUrl8 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 8 + 1
        }`
    );
    const slotUrl9 = computed(() =>
      !hasAuth || !userData?.result?.id
        ? ""
        : `https://jsonplaceholder.typicode.com/todos/${
          (userData.result.id - 1) * 10 + 9 + 1
        }`
    );

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

    return {
      id: idCell,
      userData,
      todosData,
      postsData,
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
    };
  });

  return {
    [NAME]: "Multi-Empty URL Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Multi-Empty URL Repro</h1>

        <p
          style={{
            background: "#fff3cd",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          <strong>Hypothesis:</strong>{" "}
          Bug triggers with MULTIPLE fetchData all having empty URLs
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
          <strong>hasAuth:</strong> {computed(() => hasAuth ? "YES" : "NO")}
          {" | "}
          <strong>fetchData per item:</strong> 13 (3 main + 10 slots)
        </div>

        <h2>Results:</h2>

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

              <div style={{ marginBottom: "4px" }}>
                <strong>User:</strong> {computed(() =>
                  item.userData?.result?.name ||
                  (item.userData?.pending ? "..." : "—")
                )}
              </div>

              <div style={{ marginBottom: "4px" }}>
                <strong>Todos:</strong> {computed(() =>
                  item.todosData?.result?.length
                    ? `${item.todosData.result.length} items`
                    : (item.todosData?.pending ? "..." : "—"))}
              </div>

              <div style={{ marginBottom: "4px" }}>
                <strong>Posts:</strong> {computed(() =>
                  item.postsData?.result?.length
                    ? `${item.postsData.result.length} items`
                    : (item.postsData?.pending ? "..." : "—"))}
              </div>

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
                        s?.result?.id || (s?.pending ? "..." : "—")
                      )}
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
            backgroundColor: "#f8d7da",
            borderRadius: "4px",
          }}
        >
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
