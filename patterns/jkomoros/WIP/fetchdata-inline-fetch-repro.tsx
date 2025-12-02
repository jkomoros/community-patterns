/// <cts-enable />
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
  Cell,
  Default,
  derive,
  fetchData,
  handler,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";
import AuthConfig from "./auth-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
  authCharm?: Cell<{ token: string }>;
}

interface Output {
  ids: Cell<number[]>;
}

function makeHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

const addId = handler<unknown, { ids: Cell<number[]>; newId: number }>(
  (_, { ids, newId }) => {
    const current = ids.get();
    if (!current.includes(newId)) {
      ids.set([...current, newId]);
    }
  }
);

const clearAll = handler<unknown, { ids: Cell<number[]> }>((_, { ids }) => {
  ids.set([]);
});

export default pattern<Input, Output>(({ ids, authCharm }) => {
  // 1. WISH - try to find existing auth (like discoveredAuth in momentum-tracker)
  const discoveredAuth = wish<{ token: string }>("#testAuth");

  // 2. INLINE PATTERN WITH FETCHDATA - like GitHubAuth({}) in momentum-tracker
  const inlineAuth = AuthConfig({});

  // 3. THREE-WAY DERIVE - exactly like effectiveToken in momentum-tracker
  const effectiveToken = derive(
    { discovered: discoveredAuth, passed: authCharm, inline: inlineAuth.token },
    (values) => {
      const discovered = (values.discovered as any)?.get
        ? (values.discovered as any).get()
        : values.discovered;
      const passed = (values.passed as any)?.get
        ? (values.passed as any).get()
        : values.passed;
      const inline = (values.inline as any)?.get
        ? (values.inline as any).get()
        : values.inline;

      if (discovered?.token) return discovered.token;
      if (passed?.token) return passed.token;
      if (inline) return inline;
      return "";
    }
  );

  const hasAuth = derive(effectiveToken, (t) => !!t);

  // 4. MAP WITH FETCHDATA - exactly like repos.map() in momentum-tracker
  const results = ids.map((idCell) => {
    const parsedRef = derive(idCell, (id) => ({ userId: id }));

    // API URL - empty when no auth
    const apiUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && r ? `https://jsonplaceholder.typicode.com/users/${r.userId}` : "";
      }
    );

    // Todos URL - empty when no auth
    const todosUrl = derive(
      { hasAuth, parsedRef },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        return auth && r ? `https://jsonplaceholder.typicode.com/todos?userId=${r.userId}` : "";
      }
    );

    // FETCHDATA WITH OPTIONS - like metadata in momentum-tracker
    const userData = fetchData<User>({
      url: apiUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeHeaders(t)),
      },
    });

    // SECOND FETCHDATA WITH OPTIONS - like commitActivity
    const todosData = fetchData<Todo[]>({
      url: todosUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeHeaders(t)),
      },
    });

    // 5. SAMPLE PAGES DERIVED FROM METADATA - like stargazerPages in momentum-tracker
    const samplePages = derive(
      { hasAuth, parsedRef, userData },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        const m = (values.userData as any)?.get ? (values.userData as any).get() : values.userData;

        if (!auth || !r || !m?.result?.id) {
          return { userId: 0, pages: [] as number[] };
        }

        return {
          userId: m.result.id,
          pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (m.result.id - 1) * 10 + i),
        };
      }
    );

    // STAR SAMPLE URLS - like makeSlotUrl in momentum-tracker
    const makeSlotUrl = (slotIndex: number) =>
      derive(samplePages, (sp) => {
        if (!sp.userId || slotIndex >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[slotIndex]}`;
      });

    // 10 EXPLICIT FETCHDATA SLOTS - like starSample0-9
    const slot0 = fetchData<Todo>({ url: makeSlotUrl(0), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot1 = fetchData<Todo>({ url: makeSlotUrl(1), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot2 = fetchData<Todo>({ url: makeSlotUrl(2), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot3 = fetchData<Todo>({ url: makeSlotUrl(3), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot4 = fetchData<Todo>({ url: makeSlotUrl(4), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot5 = fetchData<Todo>({ url: makeSlotUrl(5), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot6 = fetchData<Todo>({ url: makeSlotUrl(6), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot7 = fetchData<Todo>({ url: makeSlotUrl(7), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot8 = fetchData<Todo>({ url: makeSlotUrl(8), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });
    const slot9 = fetchData<Todo>({ url: makeSlotUrl(9), mode: "json", options: { method: "GET", headers: derive(effectiveToken, (t) => makeHeaders(t)) } });

    return {
      id: idCell,
      userData,
      todosData,
      slots: [slot0, slot1, slot2, slot3, slot4, slot5, slot6, slot7, slot8, slot9],
    };
  });

  return {
    [NAME]: "Inline Fetch Pattern Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Inline Fetch Pattern Repro</h1>

        <p style={{ background: "#fff3cd", padding: "10px", borderRadius: "4px" }}>
          <strong>Hypothesis:</strong> Bug triggered by inline pattern with fetchData + fetchData inside .map()
        </p>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={addId({ ids, newId: 1 })}>Add ID 1</button>{" "}
          <button onClick={addId({ ids, newId: 2 })}>Add ID 2</button>{" "}
          <button onClick={clearAll({ ids })}>Clear All</button>
        </div>

        <div style={{ marginBottom: "10px", padding: "10px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
          <strong>Inline Auth Config:</strong>
          <div>{inlineAuth}</div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <strong>IDs:</strong> {derive(ids, (arr) => arr.length === 0 ? "(empty)" : arr.join(", "))}
          {" | "}
          <strong>hasAuth:</strong> {derive(hasAuth, h => h ? "YES" : "NO")}
          {" | "}
          <strong>effectiveToken:</strong> {derive(effectiveToken, t => t ? "***" : "(none)")}
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
