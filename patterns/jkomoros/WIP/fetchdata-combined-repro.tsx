/// <cts-enable />
/**
 * Combined repro: ALL patterns from github-momentum-tracker together
 *
 * Combines:
 * - wish() primitive
 * - Imported pattern instantiation
 * - Writable<object> input parameter
 * - ifElse conditional rendering
 * - 10 fetchData slots per item (like starSample0-9)
 * - Three-way derive combining multiple sources
 */

import {
  Writable,
  Default,
  derive,
  fetchData,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";
import SimpleConfig from "./simple-config.tsx";

// Types
type User = { id: number; name: string; email: string };
type Todo = { userId: number; id: number; title: string; completed: boolean };

interface Input {
  ids?: Default<number[], []>;
  linkedConfig?: Writable<{ multiplier: number }>;
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

export default pattern<Input, Output>(({ ids, linkedConfig }) => {
  // 1. WISH - discover existing config
  const discoveredConfig = wish<{ multiplier: number }>("#testConfig");

  // 2. IMPORTED PATTERN - instantiate inline
  const inlineConfig = SimpleConfig({});

  // 3. THREE-WAY DERIVE - combine all sources (like effectiveToken in momentum tracker)
  const effectiveMultiplier = derive(
    { discovered: discoveredConfig, passed: linkedConfig, inline: inlineConfig.multiplier },
    (values) => {
      const discovered = (values.discovered as any)?.get ? (values.discovered as any).get() : values.discovered;
      const passed = (values.passed as any)?.get ? (values.passed as any).get() : values.passed;
      const inline = (values.inline as any)?.get ? (values.inline as any).get() : values.inline;

      if (discovered?.multiplier) return discovered.multiplier;
      if (passed?.multiplier) return passed.multiplier;
      if (typeof inline === 'number') return inline;
      return 1;
    }
  );

  const hasConfig = derive(effectiveMultiplier, (m: number) => m > 0);

  // Map over ids using the EXACT PATTERN from github-momentum-tracker
  const results = ids.map((idCell) => {
    const ref = derive(idCell, (id) => ({ userId: id }));

    // THE PATTERN: derive with object params including hasConfig
    const apiUrl = derive(
      { hasConfig, ref },
      (values) => {
        const config = (values.hasConfig as any)?.get ? (values.hasConfig as any).get() : values.hasConfig;
        const r = (values.ref as any)?.get ? (values.ref as any).get() : values.ref;
        return (config && r) ? `https://jsonplaceholder.typicode.com/users/${r.userId}` : "";
      }
    );

    // First fetch
    const userData = fetchData<User>({ url: apiUrl, mode: "json" });

    // Derive samplePages from userData (like in momentum tracker)
    const samplePages = derive(
      { hasConfig, parsedRef: ref, userData },
      (values) => {
        const config = (values.hasConfig as any)?.get ? (values.hasConfig as any).get() : values.hasConfig;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        const u = (values.userData as any)?.get ? (values.userData as any).get() : values.userData;

        if (!config || !r || !u?.result?.id) {
          return { userId: 0, pages: [] as number[] };
        }

        return {
          userId: u.result.id,
          pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (u.result.id - 1) * 10 + i),
        };
      }
    );

    // Create slot URL factory
    const makeSlotUrl = (slotIndex: number) =>
      derive(samplePages, (sp) => {
        if (!sp.userId || slotIndex >= sp.pages.length) return "";
        return `https://jsonplaceholder.typicode.com/todos/${sp.pages[slotIndex]}`;
      });

    // Create 10 explicit fetchData slots (like starSample0-9)
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

    // Aggregate (like starHistory in momentum tracker)
    const aggregated = derive(
      { samplePages, s0: slot0, s1: slot1, s2: slot2, s3: slot3, s4: slot4, s5: slot5, s6: slot6, s7: slot7, s8: slot8, s9: slot9 },
      (values) => {
        const sp = (values.samplePages as any)?.get ? (values.samplePages as any).get() : values.samplePages;
        if (!sp.pages || sp.pages.length === 0) return { loading: false, data: [] as string[] };

        const samples = [values.s0, values.s1, values.s2, values.s3, values.s4, values.s5, values.s6, values.s7, values.s8, values.s9];

        const pending = samples.some((s, i) => {
          if (i >= sp.pages.length) return false;
          const sample = (s as any)?.get ? (s as any).get() : s;
          return sample?.pending === true;
        });

        if (pending) return { loading: true, data: [] as string[] };

        const data: string[] = [];
        for (let i = 0; i < sp.pages.length && i < 10; i++) {
          const sample = (samples[i] as any)?.get ? (samples[i] as any).get() : samples[i];
          if (sample?.result?.title) {
            data.push(sample.result.title.substring(0, 15));
          }
        }

        return { loading: false, data };
      }
    );

    return {
      id: idCell,
      userData,
      slots: [slot0, slot1, slot2, slot3, slot4, slot5, slot6, slot7, slot8, slot9],
      aggregated,
    };
  });

  const itemCount = derive(ids, (arr) => arr.length);

  return {
    [NAME]: "Combined fetchData Repro",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "system-ui" }}>
        <h1>Combined fetchData Repro</h1>

        <p>Combines ALL patterns from github-momentum-tracker:</p>
        <ul style={{ fontSize: "14px" }}>
          <li>wish() primitive</li>
          <li>Imported pattern (SimpleConfig)</li>
          <li>Cell&lt;object&gt; input</li>
          <li>Three-way derive</li>
          <li>10 fetchData slots per item</li>
          <li>ifElse conditional rendering</li>
        </ul>

        <div style={{ marginBottom: "10px", padding: "10px", background: "#f0f0f0", borderRadius: "4px" }}>
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
          <strong>effectiveMultiplier:</strong> {effectiveMultiplier}
          {" | "}
          <strong>hasConfig:</strong> {derive(hasConfig, (c) => c ? "Yes" : "No")}
        </div>

        <h2>Results:</h2>

        {ifElse(
          derive(itemCount, (c) => c === 0),
          <div style={{ padding: "20px", background: "#f8f9fa", borderRadius: "4px", textAlign: "center" }}>
            No items. Click "Add ID" to start.
          </div>,
          <div>
            {results.map((item) => {
              const isLoading = derive(item.userData, (u) => u?.pending === true);
              const hasError = derive(item.userData, (u) => !!u?.error);
              const data = derive(item.userData, (u) => u?.result);

              return (
                <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "8px" }}>ID: {item.id}</div>

                  {ifElse(
                    isLoading,
                    <div>Loading...</div>,
                    ifElse(
                      hasError,
                      <div style={{ color: "red" }}>Error loading data</div>,
                      <div style={{ marginBottom: "8px" }}>
                        <strong>User:</strong>{" "}
                        {derive(data, (d) => d?.name || "—")}
                      </div>
                    )
                  )}

                  <div>
                    <strong>10 Slots:</strong>
                    <div style={{ fontSize: "11px", display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px" }}>
                      {item.slots.map((s, i) => (
                        <span style={{ padding: "2px 4px", background: "#eee", borderRadius: "2px" }}>
                          #{i}: {derive(s, (r) => r?.result?.title?.substring(0, 6) || (r?.pending ? "..." : "✗"))}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                    <strong>Aggregated:</strong>{" "}
                    {derive(item.aggregated, (a) => a.loading ? "Loading..." : `${a.data.length} items`)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
          <strong>Test:</strong> Does the COMBINATION trigger Frame mismatch?
        </div>
      </div>
    ),
    ids,
  };
});
