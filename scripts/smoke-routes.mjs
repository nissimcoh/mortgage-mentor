/**
 * Route smoke check: boots a production server from the current build,
 * verifies every expected calculator route, and always tears the server
 * down — the child runs in its own process group so it can never linger
 * as an orphaned next-server (rebuilding .next underneath an orphaned
 * server is exactly what produces phantom 404s).
 *
 * Usage: npm run build && npm run smoke
 */

import { spawn } from "node:child_process";

const PORT = process.env.SMOKE_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;

/** Every route the calculator must keep serving. */
const ROUTES = [
  { path: "/he", expected: 200 },
  { path: "/en", expected: 200 },
  { path: "/he/calculator", expected: 200 },
  { path: "/en/calculator", expected: 200 },
  // Fixed-unlinked track
  {
    path: "/he/calculator?trackCount=1&track1Amount=800000&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1Years=25&track1AnnualInterestRatePercent=4.8",
    expected: 200,
  },
  // Prime with a pinned curve
  {
    path: "/he/calculator?trackCount=1&track1Amount=500000&track1Type=prime&track1RepaymentMethod=spitzer&track1Years=25&track1CurrentRatePercent=4.5&track1ForecastMode=official&track1ForecastCurveId=2026-06-calendar",
    expected: 200,
  },
  // Government-bond with a half-year term
  {
    path: "/en/calculator?trackCount=1&track1Amount=300000&track1Type=variableGovernmentBond&track1RepaymentMethod=spitzer&track1ResetPeriodMonths=30&track1Years=7.5&track1CurrentRatePercent=4.2&track1ForecastMode=official",
    expected: 200,
  },
  // Annual Makam with a pinned anchor snapshot
  {
    path: "/en/calculator?trackCount=1&track1Amount=150000&track1Type=variableMakam&track1RepaymentMethod=spitzer&track1Years=12&track1CurrentRatePercent=4.1&track1ForecastMode=official&track1MakamSnapshotId=2026-06",
    expected: 200,
  },
  // Legacy generic variable track (migrates; never becomes Makam — the
  // migration semantics themselves are unit-tested in scenario-form tests)
  {
    path: "/he/calculator?trackCount=1&track1Amount=200000&track1Type=variableUnlinked&track1Years=15&track1CurrentRatePercent=4&track1ResetPeriodMonths=12",
    expected: 200,
  },
  // Legacy single-track format
  {
    path: "/he/calculator?loanAmount=800000&annualInterestRatePercent=4.8&years=25",
    expected: 200,
  },
  // Locale-less path redirects via the proxy
  { path: "/calculator", expected: 307 },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/he`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // still booting
    }
    await wait(300);
  }
  throw new Error(`Server did not become ready on ${BASE}`);
}

const server = spawn("npx", ["next", "start", "-p", PORT], {
  detached: true, // own process group → we can kill the whole tree
  stdio: "ignore",
});

let failures = 0;
try {
  await waitForServer();
  for (const { path, expected } of ROUTES) {
    let status;
    try {
      const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
      status = response.status;
    } catch (error) {
      status = `error: ${error.message}`;
    }
    const ok = status === expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${status}  ${path}`);
  }
} finally {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

console.log(
  failures === 0 ? "\nALL ROUTES OK" : `\n${failures} ROUTE(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
