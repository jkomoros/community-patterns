/// <cts-enable />
// Stub: the original store-mapper pattern was deleted in an earlier commit
// but space-setup.tsx and page-creator.tsx still import it. This stub keeps
// those files type-checking until they drop the dead references.
import { NAME, pattern, UI } from "commonfabric";

// deno-lint-ignore no-explicit-any
const StoreMapper = pattern<any, { [NAME]: string }>(() => ({
  [NAME]: "Store Mapper (stub)",
  [UI]: <div>Store Mapper has been removed.</div>,
}));

export default StoreMapper;
export const createStoreMapper = StoreMapper;
