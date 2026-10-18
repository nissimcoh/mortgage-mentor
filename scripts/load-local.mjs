/** Bounded, anonymous, loopback-only HTTP diagnostic. Never targets production.
 * Build first; run `node scripts/load-local.mjs`. This is not a user-capacity
 * estimate: no real browsers, signed-in sessions or database mutations. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";

const port = 3202;
const base = `http://127.0.0.1:${port}`;
const maxMix = new URLSearchParams({ trackCount: "5" });
for (let i = 1; i <= 5; i++) {
  for (const [field, value] of Object.entries({ Amount: "200000", Years: "30", Type: "fixedUnlinked", RepaymentMethod: "spitzer", AnnualInterestRatePercent: "4.8" })) maxMix.set(`track${i}${field}`, value);
}
const routes = [
  { name: "home", path: "/he", contains: 'data-forecast-status=' },
  { name: "calculator", path: "/en/calculator", contains: '<h1' },
  { name: "five-track-30-year-share", path: `/he/calculator?${maxMix}`, contains: 'id="results"' },
];
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
let startupOutput = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { startupOutput = (startupOutput + chunk.toString()).slice(-4000); });
function stop() {
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Child already exited. */ }
}
function interrupted() { stop(); process.exit(130); }
process.on("SIGINT", interrupted);
process.on("SIGTERM", interrupted);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const rounded = value => Math.round(value * 100) / 100;

async function request(route) {
  const start = performance.now();
  const response = await fetch(`${base}${route.path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  const headersAt = performance.now();
  const html = await response.text();
  if (response.status !== 200 || !html.includes(route.contains)) throw new Error(`${route.name}: unexpected status/content (${response.status})`);
  return { ttfb: headersAt - start, complete: performance.now() - start, bytes: Buffer.byteLength(html) };
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Local server exited: ${startupOutput}`);
    if (!startupOutput.includes("Ready in")) { await delay(100); continue; }
    try {
      // Static route avoids consuming official sources during startup polling.
      const response = await fetch(`${base}/en/learn`, { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.status === 200) { ready = true; break; }
    } catch { /* Wait for this local child only. */ }
    await delay(100);
  }
  if (!ready) throw new Error(`Local server did not become ready: ${startupOutput}`);

  const warmup = [];
  for (const route of routes) warmup.push({ route: route.name, ...await request(route) });
  const results = [];
  for (const concurrency of [1, 8, 16]) {
    for (const route of routes) {
      let cursor = 0;
      const samples = [];
      const start = performance.now();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (cursor < 24) {
          cursor++;
          samples.push(await request(route));
        }
      }));
      const elapsed = performance.now() - start;
      const result = { route: route.name, concurrency, requests: samples.length, complete_p50_ms: rounded(percentile(samples.map(sample => sample.complete), 0.5)), complete_p95_ms: rounded(percentile(samples.map(sample => sample.complete), 0.95)), headers_p95_ms: rounded(percentile(samples.map(sample => sample.ttfb), 0.95)), requests_per_second: rounded(samples.length * 1000 / elapsed), mean_response_bytes: rounded(samples.reduce((sum, sample) => sum + sample.bytes, 0) / samples.length) };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  writeFileSync("/tmp/mortgage-local-load.json", JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, profile: "single local production process; 216 anonymous HTTP requests after sequential warmup; no production traffic", warmup, results }, null, 2));
  console.log("Report: /tmp/mortgage-local-load.json");
} finally {
  stop();
  process.removeListener("SIGINT", interrupted);
  process.removeListener("SIGTERM", interrupted);
}
