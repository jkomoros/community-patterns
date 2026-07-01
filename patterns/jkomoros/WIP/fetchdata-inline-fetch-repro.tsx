/**
 * REPRO: Exact github-momentum-tracker structure
 *
 * Key elements:
 * 1. wish() for discovering auth
 * 2. Inline pattern that ITSELF has fetchData (like GitHubAuth)
 * 3. Three-way derive for effective token
 * 4. fetchData inside .map() with options.headers
 * 5. Star sample fetchData that depends on metadata fetchData result
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
  wish,
  Writable,
} from "commonfabric";
import AuthConfig from "./auth-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
  authCharm?: Writable<{ token: string }>;
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  ids: number[];
}

function makeHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
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

export default pattern<Input, Output>(({ ids, authCharm }) => {
  // 1. WISH - try to find existing auth (like discoveredAuth in momentum-tracker)
  const discoveredAuth = wish<{ token: string }>({ query: "#testAuth" });

  // 2. INLINE PATTERN WITH FETCHDATA - like GitHubAuth({}) in momentum-tracker
  const inlineAuth = AuthConfig({});

  // 3. THREE-WAY DERIVE - exactly like effectiveToken in momentum-tracker
  const effectiveToken = computed(() => {
    const discovered = discoveredAuth.result;
    const passed = authCharm?.get();
    const inline = inlineAuth.token;

    if (discovered?.token) return discovered.token;
    if (passed?.token) return passed.token;
    if (inline) return inline;
    return "";
  });

  const hasAuth = computed(() => !!effectiveToken);

  // 4. MAP WITH FETCHDATA - exactly like repos.map() in momentum-tracker
  const results = ids.map((idCell) => {
    const parsedRef = computed(() => ({ userId: idCell }));

    // API URL - empty when no auth
    const apiUrl = computed(() => {
      const auth = hasAuth;
      const r = parsedRef;
      return auth && r
        ? `https://jsonplaceholder.typicode.com/users/${r.userId}`
        : "";
    });

    // Todos URL - empty when no auth
    const todosUrl = computed(() => {
      const auth = hasAuth;
      const r = parsedRef;
      return auth && r
        ? `https://jsonplaceholder.typicode.com/todos?userId=${r.userId}`
        : "";
    });

    // FETCHDATA WITH OPTIONS - like metadata in momentum-tracker
    const userData = fetchJson<User>({
      url: apiUrl,
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });

    // SECOND FETCHDATA WITH OPTIONS - like commitActivity
    const todosData = fetchJson<Todo[]>({
      url: todosUrl,
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });

    // 5. SAMPLE PAGES DERIVED FROM METADATA - like stargazerPages in momentum-tracker
    const samplePages = computed(() => {
      const auth = hasAuth;
      const r = parsedRef;
      const m = userData;

      if (!auth || !r || !m?.result?.id) {
        return { userId: 0, pages: [] as number[] };
      }

      return {
        userId: m.result.id,
        pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
          (m.result!.id - 1) * 10 + i
        ),
      };
    });

    // STAR SAMPLE URLS - like makeSlotUrl in momentum-tracker
    // (inlined per slot: computed() must be authored directly in pattern context)

    // 10 EXPLICIT FETCHDATA SLOTS - like starSample0-9
    const slot0 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 0 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[0]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot1 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 1 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[1]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot2 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 2 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[2]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot3 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 3 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[3]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot4 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 4 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[4]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot5 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 5 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[5]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot6 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 6 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[6]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot7 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 7 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[7]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot8 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 8 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[8]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });
    const slot9 = fetchJson<Todo>({
      url: computed(() => {
        const sp = samplePages;
        if (!sp.userId || 9 >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[9]}`;
      }),
      options: {
        method: "GET",
        headers: computed(() => makeHeaders(effectiveToken)),
      },
    });

    return {
      id: idCell,
      userData,
      todosData,
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
    [NAME]: "Inline Fetch Pattern Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Inline Fetch Pattern Repro</h1>

        <p
          style={{
            background: "#fff3cd",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          <strong>Hypothesis:</strong>{" "}
          Bug triggered by inline pattern with fetchData + fetchData inside
          .map()
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button type="button" onClick={addId({ ids, newId: 1 })}>
            Add ID 1
          </button>{" "}
          <button type="button" onClick={addId({ ids, newId: 2 })}>
            Add ID 2
          </button>{" "}
          <button type="button" onClick={clearAll({ ids })}>Clear All</button>
        </div>

        <div
          style={{
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "#f8f9fa",
            borderRadius: "4px",
          }}
        >
          <strong>Inline Auth Config:</strong>
          <div>{inlineAuth}</div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong>{" "}
          {computed(() =>
            ids.length === 0 ? "(empty)" : ids.join(", "))}
          {" | "}
          <strong>hasAuth:</strong> {computed(() => hasAuth ? "YES" : "NO")}
          {" | "}
          <strong>effectiveToken:</strong>{" "}
          {computed(() => effectiveToken ? "***" : "(none)")}
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
                  (item.userData?.pending ? "..." : "—"))}
              </div>
              <div>
                <strong>Todos:</strong> {computed(() =>
                  item.todosData?.result?.length
                    ? `${item.todosData.result.length} items`
                    : (item.todosData?.pending ? "..." : "—"))}
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
                        s?.result?.id || (s?.pending ? "..." : "—"))}
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
          <strong>This matches github-momentum-tracker EXACTLY:</strong>
          <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
            <li>wish() for auth discovery</li>
            <li>Inline pattern (AuthConfig) with its own fetchData</li>
            <li>Three-way derive for effectiveToken</li>
            <li>fetchData inside .map() with options.headers</li>
            <li>10 slot fetchData depending on metadata result</li>
          </ul>
        </div>
      </div>
    ),
    ids,
  };
});
