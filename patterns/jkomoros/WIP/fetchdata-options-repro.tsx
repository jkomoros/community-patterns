/// <cts-enable />
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

interface Input {
  ids?: Default<number[], []>;
  enableFetching?: Default<boolean, false>;
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

// Simulate makeGitHubHeaders from github-momentum-tracker
function makeHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export default pattern<Input, Output>(({ ids, enableFetching }) => {
  // Simulate token (always returns a value, like inlineAuth.token)
  const effectiveToken = derive(enableFetching, (e) => e ? "fake-token" : "");

  const hasAuth = derive(effectiveToken, (t) => !!t);

  const results = ids.map((idCell) => {
    const parsedRef = derive(idCell, (id) => ({ userId: id }));

    // URL is empty when hasAuth is false - EXACTLY like github-momentum-tracker
    const apiUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && r ? `https://jsonplaceholder.typicode.com/users/${r.userId}` : "";
      }
    );

    // THE KEY DIFFERENCE: fetchData with options.headers derived from cell
    // This is EXACTLY what github-momentum-tracker does
    const userData = fetchData<User>({
      url: apiUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeHeaders(t)),
      },
    });

    // Add more fetchData with options (like commitActivity in momentum-tracker)
    const todosUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && r ? `https://jsonplaceholder.typicode.com/todos?userId=${r.userId}` : "";
      }
    );

    const todosData = fetchData<{ id: number; title: string }[]>({
      url: todosUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeHeaders(t)),
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

        <p style={{ background: "#fff3cd", padding: "10px", borderRadius: "4px" }}>
          <strong>Hypothesis:</strong> Bug triggers with fetchData + options.headers derived from cell + empty URL
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
        </div>

        <h2>Results:</h2>

        <div>
          {results.map((item) => (
            <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>ID: {item.id}</div>
              <div>
                <strong>User:</strong>{" "}
                {derive(item.userData, (u) => u?.result?.name || (u?.pending ? "..." : "—"))}
              </div>
              <div>
                <strong>Todos:</strong>{" "}
                {derive(item.todosData, (t) => t?.result?.length ? `${t.result.length} items` : (t?.pending ? "..." : "—"))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f8d7da", borderRadius: "4px" }}>
          <strong>Steps:</strong>
          <ol>
            <li>Keep "Fetching: OFF" (URLs empty, but options.headers still evaluated)</li>
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
