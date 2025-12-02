/// <cts-enable />
/**
 * Helper pattern for fetchdata-inline-fetch-repro.tsx
 * Simulates GitHubAuth - a pattern that itself has fetchData calls
 */

import { Cell, Default, derive, fetchData, handler, NAME, pattern, UI } from "commontools";

interface Input {
  token?: Default<string, "">;
}

interface Output {
  token: Cell<string>;
  isValid: Cell<boolean>;
  userData: Cell<{ login: string } | null>;
}

const setToken = handler<unknown, { token: Cell<string>; value: string }>(
  (_, { token, value }) => {
    token.set(value);
  }
);

export default pattern<Input, Output>(({ token }) => {
  // Derive URL that's empty when no token
  const hasToken = derive(token, (t) => !!t && t.length > 0);
  const userUrl = derive(hasToken, (has) => has ? "https://jsonplaceholder.typicode.com/users/1" : "");

  // THIS IS KEY: fetchData inside the auth pattern itself
  const userResponse = fetchData<{ id: number; name: string; email: string }>({
    url: userUrl,
    mode: "json",
    options: {
      method: "GET",
      headers: derive(token, (t) => ({
        "Authorization": `Bearer ${t}`,
      })),
    },
  });

  const isValid = derive(
    { token, userResponse },
    ({ token, userResponse }) => {
      if (!token) return false;
      if (!userResponse) return false;
      return !!userResponse.result?.name;
    }
  );

  const userData = derive(userResponse, (resp) =>
    resp?.result ? { login: resp.result.name } : null
  );

  return {
    [NAME]: "Auth Config",
    [UI]: (
      <div style={{ padding: "16px", backgroundColor: "#f0f0f0", borderRadius: "8px" }}>
        <h3>Auth Config</h3>
        <div>Token: {derive(token, t => t ? "***" : "(none)")}</div>
        <div>Valid: {derive(isValid, v => v ? "Yes" : "No")}</div>
        <div>User: {derive(userData, u => u?.login || "—")}</div>
        <button onClick={setToken({ token, value: "test-token" })}>Set Token</button>
      </div>
    ),
    token,
    isValid,
    userData,
  };
});
