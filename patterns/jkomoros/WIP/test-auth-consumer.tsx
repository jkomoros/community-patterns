/// <cts-enable />
/**
 * Test Auth Consumer
 *
 * A minimal pattern for testing cross-charm token refresh.
 *
 * PURPOSE: Isolate and debug the cross-charm refresh mechanism.
 *
 * Tests:
 * 1. Can we wish() for the auth charm?
 * 2. Can we access the refreshToken stream?
 * 3. Does stream.send() work?
 * 4. Does the token actually refresh?
 */
import {
  writable,
  Writable,
  Default,
  derive,
  handler,
  NAME,
  pattern,
  Stream,
  UI,
  wish,
} from "commontools";

// Auth type (inline to avoid import issues)
type Auth = {
  token: string;
  tokenType: string;
  scope: string[];
  expiresIn: number;
  expiresAt: number;
  refreshToken: string;
  user: {
    email: string;
    name: string;
    picture: string;
  };
};

// What we expect from the google-auth charm via wish
// Using Stream<T> type as Berni suggested
type GoogleAuthCharm = {
  auth: Auth;
  scopes?: string[];
  refreshToken?: Stream<Record<string, never>>;
  timeRemaining?: number;
  isExpired?: boolean;
};

interface Input {
  testLog: Default<string[], []>;
}

interface Output {
  testLog: string[];
}

// Handler to log a message
const logMessage = handler<
  Record<string, never>,
  { testLog: Writable<string[]>; message: string }
>((_event, { testLog, message }) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
  const logs = testLog.get() || [];
  testLog.set([...logs, `[${timestamp}] ${message}`]);
  console.log(`[TEST-CONSUMER] ${message}`);
});

// Handler to clear log
const clearLog = handler<
  Record<string, never>,
  { testLog: Writable<string[]> }
>((_event, { testLog }) => {
  testLog.set([]);
});

export default pattern<Input, Output>(
  ({ testLog }) => {
    // Wish for the short-TTL auth charm
    const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuthShortTTL" });

    // Extract wish state
    const wishState = derive(wishResult, (wr: any) => {
      if (wr?.result?.auth?.user?.email) return "authenticated";
      if (wr?.result) return "found-not-authenticated";
      if (wr?.error) return "error";
      return "loading";
    });

    const wishedCharm = derive(wishResult, (wr: any) => wr?.result || null);
    const wishError = derive(wishResult, (wr: any) => wr?.error || null);

    // Extract the refreshToken stream from the wished charm
    // Per Berni: Pass this directly to handlers with Stream<T> type in handler signature
    const refreshTokenStream = derive(wishedCharm, (charm: any) => charm?.refreshToken || null);

    // Get auth data (if available)
    const auth = derive(wishedCharm, (charm: any) => charm?.auth || null);
    const isAuthenticated = derive(auth, (a: any) => !!(a?.token && a?.user?.email));

    // Token status
    const tokenStatus = derive(auth, (a: any) => {
      if (!a?.token) return "no-token";
      if (!a?.expiresAt) return "no-expiry";
      const remaining = a.expiresAt - Date.now();
      if (remaining <= 0) return "expired";
      return "valid";
    });

    const timeRemaining = derive(auth, (a: any) => {
      if (!a?.expiresAt) return 0;
      return Math.max(0, Math.floor((a.expiresAt - Date.now()) / 1000));
    });

    // Check if refresh stream is accessible
    const refreshStreamInfo = derive(wishedCharm, (charm: any) => {
      if (!charm) return { available: false, reason: "no charm" };
      const stream = charm.refreshToken;
      if (!stream) return { available: false, reason: "no refreshToken property" };
      if (typeof stream.send === "function") return { available: true, reason: "has .send()" };
      if (typeof stream.get === "function") {
        try {
          const val = stream.get();
          if (typeof val?.send === "function") return { available: true, reason: "has .get().send()" };
          return { available: false, reason: `.get() returned ${typeof val}, no .send()` };
        } catch (e) {
          return { available: false, reason: `.get() threw: ${e}` };
        }
      }
      return { available: false, reason: `stream is ${typeof stream}, no .send() or .get()` };
    });

    // Handler to test stream access - defined inside pattern to access wishedCharm
    const testStreamAccess = handler<
      Record<string, never>,
      { testLog: Writable<string[]> }
    >((_event, { testLog: logCell }) => {
      const logs = logCell.get() || [];
      const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);

      const results: string[] = [];
      results.push(`[${timestamp}] === STREAM ACCESS TEST ===`);

      // Get the current charm value
      const charm = wishedCharm.get ? wishedCharm.get() : wishedCharm;

      results.push(`  charm type: ${typeof charm}`);
      results.push(`  charm is null: ${charm === null}`);

      if (charm) {
        results.push(`  charm keys: ${Object.keys(charm).join(", ")}`);
        results.push(`  charm.refreshToken type: ${typeof charm.refreshToken}`);

        if (charm.refreshToken) {
          const rt = charm.refreshToken;
          results.push(`  refreshToken keys: ${Object.keys(rt).join(", ")}`);
          results.push(`  typeof .send: ${typeof rt.send}`);
          results.push(`  typeof .get: ${typeof rt.get}`);

          if (typeof rt.get === "function") {
            try {
              const streamVal = rt.get();
              results.push(`  .get() result type: ${typeof streamVal}`);
              results.push(`  .get() result: ${JSON.stringify(streamVal)?.slice(0, 100)}`);
              if (streamVal) {
                results.push(`  .get().send type: ${typeof streamVal.send}`);
              }
            } catch (e) {
              results.push(`  .get() ERROR: ${e}`);
            }
          }
        }
      }

      console.log(results.join("\n"));
      logCell.set([...logs, ...results]);
    });

    // Handler to attempt refresh via stream
    // KEY INSIGHT from Berni: Pass the stream directly to the handler with Stream<T> type
    // in the handler signature. The framework will give you a callable stream if you
    // declare it properly, analogous to how handlers declare Writable<T> for what they write to.
    const attemptRefresh = handler<
      Record<string, never>,
      { testLog: Writable<string[]>; refreshStream: Stream<Record<string, never>> }
    >(async (_event, { testLog: logCell, refreshStream }) => {
      const logs = logCell.get() || [];
      const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);

      const results: string[] = [];
      results.push(`[${timestamp}] === ATTEMPTING REFRESH ===`);
      results.push(`  refreshStream type: ${typeof refreshStream}`);
      results.push(`  refreshStream keys: ${refreshStream ? Object.keys(refreshStream).join(", ") : "null"}`);
      results.push(`  typeof refreshStream.send: ${typeof (refreshStream as any)?.send}`);

      if (!refreshStream) {
        results.push(`  ERROR: No stream provided`);
        logCell.set([...logs, ...results]);
        return;
      }

      if (typeof refreshStream.send !== "function") {
        results.push(`  ERROR: refreshStream.send is not a function`);
        results.push(`  stream value: ${JSON.stringify(refreshStream)?.slice(0, 200)}`);
        logCell.set([...logs, ...results]);
        return;
      }

      results.push(`  Found stream with .send() - calling it...`);
      logCell.set([...logs, ...results]);

      // Attempt to call the stream
      // Note: Stream.send() only takes event, no onCommit callback
      try {
        refreshStream.send({});
        const successLog = [`[${new Date().toISOString().split("T")[1].slice(0, 12)}] refreshStream.send({}) called successfully`];
        logCell.set([...logCell.get(), ...successLog]);
      } catch (e) {
        const errorLog = [`[${new Date().toISOString().split("T")[1].slice(0, 12)}] Refresh ERROR: ${e}`];
        console.error("[TEST-CONSUMER] Refresh error:", e);
        logCell.set([...logCell.get(), ...errorLog]);
      }
    });

    return {
      [NAME]: "Test Auth Consumer",
      [UI]: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            padding: "20px",
            maxWidth: "700px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ margin: "0" }}>Test Auth Consumer</h2>

          <div
            style={{
              padding: "12px",
              backgroundColor: "#e0f2fe",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            Testing cross-charm token refresh with <code>#googleAuthShortTTL</code>
          </div>

          {/* Wish Status */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f8fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Wish Status</h3>
            <div style={{ fontFamily: "monospace", fontSize: "13px" }}>
              <div>State: <strong>{wishState}</strong></div>
              <div>Has charm: {derive(wishedCharm, (c: any) => c ? "YES" : "NO")}</div>
              <div>Error: {wishError}</div>
            </div>
          </div>

          {/* Auth Status */}
          <div
            style={{
              padding: "16px",
              backgroundColor: derive(tokenStatus, (s: string) => {
                if (s === "expired") return "#fee2e2";
                if (s === "valid") return "#dcfce7";
                return "#f3f4f6";
              }),
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Auth Status</h3>
            <div style={{ fontFamily: "monospace", fontSize: "13px" }}>
              <div>Authenticated: {derive(isAuthenticated, (a: boolean) => a ? "YES" : "NO")}</div>
              <div>Email: {derive(auth, (a: any) => a?.user?.email || "N/A")}</div>
              <div>Token status: <strong>{tokenStatus}</strong></div>
              <div>Time remaining: {timeRemaining}s</div>
              <div>expiresAt: {derive(auth, (a: any) => a?.expiresAt || "N/A")}</div>
            </div>
          </div>

          {/* Stream Access Status */}
          <div
            style={{
              padding: "16px",
              backgroundColor: derive(refreshStreamInfo, (info: any) => info?.available ? "#dcfce7" : "#fef3c7"),
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Refresh Stream Access</h3>
            <div style={{ fontFamily: "monospace", fontSize: "13px" }}>
              <div>Available: <strong>{derive(refreshStreamInfo, (info: any) => info?.available ? "YES" : "NO")}</strong></div>
              <div>Reason: {derive(refreshStreamInfo, (info: any) => info?.reason || "unknown")}</div>
            </div>
          </div>

          {/* Test Buttons */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={testStreamAccess({ testLog })}
              style={{
                padding: "10px 16px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Test Stream Access
            </button>

            <button
              onClick={attemptRefresh({ testLog, refreshStream: refreshTokenStream })}
              style={{
                padding: "10px 16px",
                backgroundColor: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Attempt Refresh
            </button>

            <button
              onClick={logMessage({ message: "Manual log entry", testLog })}
              style={{
                padding: "10px 16px",
                backgroundColor: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Add Log Entry
            </button>

            <button
              onClick={clearLog({ testLog })}
              style={{
                padding: "10px 16px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Clear Log
            </button>
          </div>

          {/* Test Log */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "#1e293b",
              borderRadius: "8px",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: "12px",
              maxHeight: "400px",
              overflow: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#94a3b8" }}>Test Log</h3>
            {derive(testLog, (logs: string[]) => {
              if (!logs || logs.length === 0) {
                return <div style={{ color: "#64748b" }}>No log entries yet. Click "Test Stream Access" to start.</div>;
              }
              return logs.map((log: string, i: number) => (
                <div key={i} style={{ marginBottom: "4px", whiteSpace: "pre-wrap" }}>{log}</div>
              ));
            })}
          </div>

          {/* Debug: Raw charm data */}
          <details style={{ fontSize: "12px" }}>
            <summary style={{ cursor: "pointer", color: "#6b7280" }}>Raw Charm Data</summary>
            <pre
              style={{
                background: "#f3f4f6",
                padding: "12px",
                borderRadius: "4px",
                overflow: "auto",
                fontSize: "11px",
              }}
            >
              {derive(wishedCharm, (charm: any) => {
                if (!charm) return "No charm";
                try {
                  return JSON.stringify({
                    keys: Object.keys(charm),
                    authKeys: charm.auth ? Object.keys(charm.auth) : null,
                    refreshTokenType: typeof charm.refreshToken,
                    refreshTokenKeys: charm.refreshToken ? Object.keys(charm.refreshToken) : null,
                  }, null, 2);
                } catch (e) {
                  return `Error: ${e}`;
                }
              })}
            </pre>
          </details>
        </div>
      ),
      testLog,
    };
  },
);
