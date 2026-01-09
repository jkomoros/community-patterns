/// <cts-enable />
/**
 * EXPERIMENT: Test if derive() with array.reduce() unwraps Cell array items
 *
 * Goal: Determine if we even need a new reduce() primitive, or if
 * derive([arrayOfCells], items => items.reduce(...)) already works.
 *
 * Test cases:
 * 1. Simple array reduce (baseline)
 * 2. Array of Cell results from map()
 * 3. Array of LLM results (pending/result pattern)
 */

import {
  computed,
  derive,
  NAME,
  UI,
  pattern,
  Writable,
} from "commontools";

// Utility to check if something is a Cell/proxy
function isProxy(value: any): boolean {
  if (value === null || value === undefined) return false;
  // Check for common proxy indicators
  try {
    const str = Object.prototype.toString.call(value);
    // Proxied cells often have special symbols or behaviors
    return typeof value === "object" && (
      value[Symbol.toStringTag] === "Cell" ||
      typeof value.get === "function" ||
      typeof value.withTx === "function"
    );
  } catch {
    return false;
  }
}

// Type interfaces (can stay at module level)
interface Item {
  id: number;
  value: number;
}

interface DoubledItem {
  id: number;
  doubled: number;
}

interface LLMResult {
  pending: boolean;
  result?: { text: string; score: number };
  error?: string;
}

interface AggAcc {
  completed: number;
  pending: number;
  errors: number;
  totalScore: number;
  debug: string;
}

interface FetchAcc {
  done: number;
  pending: number;
  debug: string;
}

export default pattern<{}, { experiments: any }>(({}) => {
  // =============================================================================
  // EXPERIMENT 1: Simple array with derive + reduce
  // =============================================================================

  const simpleNumbers = Writable.of([1, 2, 3, 4, 5]);

  // NOTE: derive() may not fully unwrap Cell arrays - use 'any' to test runtime behavior
  const simpleSum = derive([simpleNumbers], (nums: any) => {
    console.log("[Exp1] nums type:", typeof nums);
    console.log("[Exp1] nums isArray:", Array.isArray(nums));
    console.log("[Exp1] nums[0] type:", typeof nums[0]);
    console.log("[Exp1] nums[0] isProxy:", isProxy(nums[0]));

    return nums.reduce((acc: number, n: any) => {
      console.log("[Exp1] n type:", typeof n, "value:", n);
      return acc + n;
    }, 0);
  });

  // =============================================================================
  // EXPERIMENT 2: Array of objects processed by map, then reduce
  // =============================================================================

  const items = Writable.of<Item[]>([
    { id: 1, value: 10 },
    { id: 2, value: 20 },
    { id: 3, value: 30 },
  ]);

  // Map to transform items - items.map() returns Cell-wrapped items
  // NOTE: The callback receives Cell-wrapped items at runtime, use 'any'
  // Wrap in computed() to handle reactive property access
  const doubled = items.map((item: any) => computed(() => ({
    id: item.id,
    doubled: item.value * 2,
  })));

  // Try to reduce the mapped results
  // NOTE: derive() receives Cell-wrapped array, items inside are also Cell-wrapped
  // We use 'any' to bypass TypeScript since this is an experiment to test runtime behavior
  const mapThenReduce = derive([doubled], (results: any) => {
    console.log("[Exp2] results type:", typeof results);
    console.log("[Exp2] results isArray:", Array.isArray(results));
    console.log("[Exp2] results.length:", results?.length);

    if (!results || !Array.isArray(results)) {
      return { sum: 0, debug: "results not array" };
    }

    const first = results[0];
    console.log("[Exp2] first type:", typeof first);
    console.log("[Exp2] first isProxy:", isProxy(first));
    console.log("[Exp2] first.doubled type:", typeof first?.doubled);
    console.log("[Exp2] first.doubled value:", first?.doubled);

    try {
      const sum = results.reduce((acc: number, item: any) => {
        console.log("[Exp2] item:", item, "doubled:", item?.doubled);
        return acc + (item?.doubled ?? 0);
      }, 0);
      return { sum, debug: "success" };
    } catch (e) {
      return { sum: 0, debug: `error: ${e}` };
    }
  });

  // =============================================================================
  // EXPERIMENT 3: Simulated LLM-like results with pending state
  // =============================================================================

  // Simulate what map() with generateObject would produce
  const mockLLMResults = Writable.of<LLMResult[]>([
    { pending: false, result: { text: "hello", score: 10 } },
    { pending: true },
    { pending: false, result: { text: "world", score: 20 } },
    { pending: false, error: "failed" },
  ]);

  // NOTE: derive() may not fully unwrap Cell arrays - use 'any' to test runtime behavior
  const aggregatedResults = derive([mockLLMResults], (results: any) => {
    console.log("[Exp3] results type:", typeof results);
    console.log("[Exp3] results isArray:", Array.isArray(results));

    if (!results || !Array.isArray(results)) {
      return {
        completed: 0,
        pending: 0,
        errors: 0,
        totalScore: 0,
        debug: "not array",
      };
    }

    const first = results[0];
    console.log("[Exp3] first:", first);
    console.log("[Exp3] first.pending type:", typeof first?.pending);
    console.log("[Exp3] first.pending value:", first?.pending);
    console.log("[Exp3] first.pending === false:", first?.pending === false);

    return results.reduce(
      (acc: AggAcc, item: any) => {
        console.log(
          "[Exp3] reduce item.pending:",
          item?.pending,
          "type:",
          typeof item?.pending
        );

        if (item.pending) {
          return { ...acc, pending: acc.pending + 1 };
        }
        if (item.error) {
          return { ...acc, errors: acc.errors + 1 };
        }
        return {
          ...acc,
          completed: acc.completed + 1,
          totalScore: acc.totalScore + (item.result?.score ?? 0),
        };
      },
      { completed: 0, pending: 0, errors: 0, totalScore: 0, debug: "success" }
    );
  });

  // =============================================================================
  // EXPERIMENT 4: Real map() output with derive reduce
  // =============================================================================

  const urls = Writable.of(["url1", "url2", "url3"]);

  // This creates Cell references in the array
  // NOTE: urls.map() callback receives Cell-wrapped items at runtime
  // Wrap in computed() to handle reactive property access
  const fetched = urls.map((url: any) => computed(() => ({
    url,
    status: url === "url2" ? "pending" : "done",
    data: url === "url2" ? null : `data for ${url}`,
  })));

  // NOTE: derive() may not fully unwrap Cell arrays - use 'any' to test runtime behavior
  const fetchAggregated = derive([fetched], (results: any) => {
    console.log("[Exp4] results:", results);
    console.log("[Exp4] results isArray:", Array.isArray(results));

    if (!results || !Array.isArray(results)) {
      return { done: 0, pending: 0, debug: "not array" };
    }

    const first = results[0];
    console.log("[Exp4] first:", first);
    console.log("[Exp4] first.status:", first?.status);
    console.log("[Exp4] typeof first.status:", typeof first?.status);

    return results.reduce(
      (acc: FetchAcc, item: any) => {
        if (item?.status === "pending") {
          return { ...acc, pending: acc.pending + 1 };
        }
        return { ...acc, done: acc.done + 1 };
      },
      { done: 0, pending: 0, debug: "success" }
    );
  });

  // =============================================================================
  // UI
  // =============================================================================

  return {
    [NAME]: "Reduce Experiments",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h1>Reduce Experiments</h1>
        <p>Check browser console for detailed logs!</p>

        <h2>Experiment 1: Simple Array Reduce</h2>
        <pre>{JSON.stringify(simpleSum, null, 2)}</pre>

        <h2>Experiment 2: Map Then Reduce</h2>
        <pre>{JSON.stringify(mapThenReduce, null, 2)}</pre>

        <h2>Experiment 3: Mock LLM Results</h2>
        <pre>{JSON.stringify(aggregatedResults, null, 2)}</pre>

        <h2>Experiment 4: Real Map Output</h2>
        <pre>{JSON.stringify(fetchAggregated, null, 2)}</pre>
      </div>
    ),
    experiments: {
      exp1_simpleSum: simpleSum,
      exp2_mapThenReduce: mapThenReduce,
      exp3_aggregatedResults: aggregatedResults,
      exp4_fetchAggregated: fetchAggregated,
    },
  };
});
