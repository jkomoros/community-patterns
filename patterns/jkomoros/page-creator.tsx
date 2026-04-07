/// <cts-enable />
// STUBBED during the commonfabric port. Owner needs to refactor against
// the new framework. Original preserved as page-creator.tsx.broken.
import { NAME, pattern, UI } from "commonfabric";

// deno-lint-ignore no-explicit-any
const Stub = pattern<any, { [NAME]: string }>(() => ({
  [NAME]: "Page Creator (stub)",
  [UI]: <div>Temporarily stubbed during the commonfabric framework rename.</div>,
}));

export default Stub;
