// Total Blocking Time gate for the Lighthouse perf spec (e2e/perf.spec.ts).
//
// One Lighthouse reading of TBT is noisy: on 2026-11-10 a config page that normally reads ~50ms read 621ms in one run,
// and the table pages wander by ±100ms between runs on the same build. A single sample therefore fails the build at
// random. Lighthouse's own guidance is to judge variable metrics on the median of several runs.
//
// So: a first reading under the limit passes as-is (no extra cost). A miss is re-measured twice and judged on the
// median of the three. The limit is unchanged, and a real regression still fails (two of three readings over it).

export type TbtVerdict = { tbt: number; samples: number[] }

export async function gatedTbt(
  first: number,
  limitMs: number,
  remeasure: () => Promise<number>,
): Promise<TbtVerdict> {
  if (first < limitMs) return { tbt: first, samples: [first] }
  const samples = [first, await remeasure(), await remeasure()]
  const sorted = [...samples].sort((a, b) => a - b)
  return { tbt: sorted[1], samples }
}
