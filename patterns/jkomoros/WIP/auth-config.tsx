/// <cts-enable />
/**
 * Helper pattern for fetchdata-inline-fetch-repro.tsx
 * Simulates GitHubAuth - a pattern that itself has fetchData calls
 */

import { Cell, computed, Default, fetchData, handler, NAME, pattern, UI } from "commontools";

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
  const hasToken = computed(() => !!token && token.length > 0);
  const userUrl = computed(() => hasToken ? "https://jsonplaceholder.typicode.com/users/1" : "");

  // THIS IS KEY: fetchData inside the auth pattern itself
  const userResponse = fetchData<{ id: number; name: string; email: string }>({
    url: userUrl,
    mode: "json",
    options: {
      method: "GET",
      headers: computed(() => ({
        "Authorization": `Bearer ${token}`,
      })),
    },
  });

  const isValid = computed(() => {
      const t = token;
      const resp = userResponse;
      if (!t) return false;
      if (!resp) return false;
      return !!resp.result?.name;
    }
  );

  const userData = computed(() =>
    userResponse?.result ? { login: userResponse.result.name } : null
  );

  return {
    [NAME]: "Auth Config",
    [UI]: (
      <div style={{ padding: "16px", backgroundColor: "#f0f0f0", borderRadius: "8px" }}>
        <h3>Auth Config</h3>
        <div>Token: {computed(() => token ? "***" : "(none)")}</div>
        <div>Valid: {computed(() => isValid ? "Yes" : "No")}</div>
        <div>User: {computed(() => userData?.login || "—")}</div>
        <button onClick={setToken({ token, value: "test-token" })}>Set Token</button>
      </div>
    ),
    token,
    isValid,
    userData,
  };
});
