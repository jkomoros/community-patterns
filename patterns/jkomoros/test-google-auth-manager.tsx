/// <cts-enable />
/**
 * Test pattern for google-auth-manager utility
 */
import { NAME, pattern, UI } from "commontools";
import { useGoogleAuth } from "./util/google-auth-manager.tsx";

interface Input {}
interface Output {}

export default pattern<Input, Output>(() => {
  const { auth, authInfo, fullUI, isReady, state } = useGoogleAuth({
    requiredScopes: ["gmail"],
  });

  return {
    [NAME]: "Test Google Auth Manager",
    [UI]: (
      <div style={{ padding: "20px" }}>
        <h2>Google Auth Manager Test</h2>
        {fullUI}
        <hr />
        <pre>
          State: {state}
          {"\n"}
          Is Ready: {isReady}
          {"\n"}
          Auth Email: {authInfo.email}
        </pre>
      </div>
    ),
  };
});
