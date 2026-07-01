/**
 * REPRO: fetchData with `options` containing derived headers + empty URL
 *
 * Hypothesis: Bug triggers when fetchData has:
 * 1. Empty URL (conditional fetch)
 * 2. options.headers derived from a cell
 *
 * This is EXACTLY what github-momentum-tracker does.
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

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>;
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

// Simulate makeGitHubHeaders from github-momentum-tracker
function makeHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export default pattern<Input, Output>(({ ids, enableFetching }) => {
  // Simulate token (always returns a value, like inlineAuth.token)
  const effectiveToken = computed(() => enableFetching ? "fake-token" : "");

  const hasAuth = computed(() => !!effectiveToken);

  const results = ids.map((idCell) => {
    const parsedRef = computed(() => ({ userId: idCell }));

    // URL is empty when hasAuth is false - EXACTLY like github-momentum-tracker
    const apiUrl = computed(() => {
      const auth = hasAuth;
      const r = parsedRef;
      return auth && r
        ? `https://jsonplaceholder.typicode.com/users/${r.userId}`
        : "";
    });

    // THE KEY DIFFERENCE: fetchData with options.headers derived from cell
    // This is EXACTLY what github-momentum-tracker does
    const userData = fetchJson<User>({
      url: apiUrl,
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });

    // Add more fetchData with options (like commitActivity in momentum-tracker)
    const todosUrl = computed(() => {
      const auth = hasAuth;
      const r = parsedRef;
      return auth && r
        ? `https://jsonplaceholder.typicode.com/todos?userId=${r.userId}`
        : "";
    });

    const todosData = fetchJson<{ id: number; title: string }[]>({
      url: todosUrl,
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });

    return {
      id: idCell,
      userData,
      todosData,
    };
  });

  return {
    [NAME]: "fetchData Options Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>fetchData Options Repro</h1>

        <p
          style={{
            background: "#fff3cd",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          <strong>Hypothesis:</strong>{" "}
          Bug triggers with fetchData + options.headers derived from cell +
          empty URL
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
              <div>
                <strong>User:</strong> {computed(() =>
                  item.userData?.result?.name ||
                  (item.userData?.pending ? "..." : "—")
                )}
              </div>
              <div>
                <strong>Todos:</strong> {computed(() =>
                  item.todosData?.result?.length
                    ? `${item.todosData.result.length} items`
                    : (item.todosData?.pending ? "..." : "—")
                )}
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
            <li>
              Keep "Fetching: OFF" (URLs empty, but options.headers still
              evaluated)
            </li>
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
