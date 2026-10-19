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
import assert from "node:assert/strict";

const PORT = process.env.SMOKE_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

/** Every route the calculator must keep serving. */
const ROUTES = [
  { path: "/he", expected: 200, content: 'data-forecast-status=' },
  { path: "/en", expected: 200, content: 'data-forecast-status=' },
  { path: "/he/calculator", expected: 200 },
  { path: "/en/calculator", expected: 200 },
  // App-shell surfaces: learn and sign-in are real pages; /saved requires
  // auth and redirects unauthenticated visitors to /signin.
  { path: "/he/learn", expected: 200 },
  { path: "/en/learn", expected: 200 },
  { path: "/he/saved", expected: 307 },
  { path: "/en/saved", expected: 307 },
  // Detail page requires auth too — same redirect-to-signin behavior,
  // before it ever gets a chance to query a row.
  {
    path: "/he/saved/123e4567-e89b-12d3-a456-426614174000",
    expected: 307,
  },
  // A syntactically malformed id is never sent to a uuid-typed column —
  // still gated by the same auth redirect first.
  { path: "/en/saved/not-a-real-id", expected: 307 },
  // Admin dashboard also requires auth — same redirect-to-signin behavior
  // as /saved, before it ever attempts the is_current_user_admin check.
  { path: "/he/admin", expected: 307 },
  { path: "/en/admin", expected: 307 },
  { path: "/he/signin", expected: 200 },
  { path: "/en/signin", expected: 200 },
  // Saved-scenario comparison requires authentication, like /saved.
  { path: "/he/compare", expected: 307, location: "/he/signin?next=%2Fhe%2Fcompare" },
  { path: "/en/compare", expected: 307, location: "/en/signin?next=%2Fen%2Fcompare" },
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
  // Fixed CPI-linked with an inflation-stress scenario
  {
    path: "/he/calculator?trackCount=1&track1Amount=500000&track1Type=fixedLinked&track1RepaymentMethod=spitzer&track1Years=20&track1CurrentRatePercent=4.5&track1ForecastMode=official&track1ForecastCurveId=2026-06-calendar",
    expected: 200,
  },
  // Variable CPI-linked: real curve, CPI indexation and separate stress inputs.
  {
    path: "/he/calculator?trackCount=1&track1Amount=500000&track1Type=variableLinked&track1Years=20&track1ResetPeriodMonths=60&track1CurrentRatePercent=3&track1ForecastMode=official",
    expected: 200,
    content: 'id="results"',
  },
  {
    path: "/en/calculator?trackCount=1&track1Amount=500000&track1Type=variableLinked&track1Years=20&track1ResetPeriodMonths=60&track1CurrentRatePercent=3&track1ForecastMode=stress&track1ForecastStressShift=1&track1InflationStressShift=2",
    expected: 200,
    content: 'id="results"',
  },
  // Legacy single-track format
  {
    path: "/he/calculator?loanAmount=800000&annualInterestRatePercent=4.8&years=25",
    expected: 200,
  },
  // Edit-mode entry from a saved-scenario detail page: savedScenarioId/
  // UpdatedAt/Name are UI-only edit-context hints, never trusted for
  // authorization, so the calculator still renders fine with no matching
  // (or even real) row behind them.
  {
    path: "/he/calculator?trackCount=1&track1Amount=800000&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1Years=25&track1AnnualInterestRatePercent=4.8&savedScenarioId=123e4567-e89b-12d3-a456-426614174000&savedScenarioUpdatedAt=2026-07-01T12%3A00%3A00.000Z&savedScenarioName=%D7%94%D7%A6%D7%A2%D7%AA%20%D7%9C%D7%90%D7%95%D7%9E%D7%99",
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
  for (const { path, expected, content, location } of ROUTES) {
    let status;
    let contentOk = true;
    let locationOk = true;
    try {
      const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
      status = response.status;
      if (location) locationOk = response.headers.get("location") === location;
      if (content) contentOk = (await response.text()).includes(content);
    } catch (error) {
      status = `error: ${error.message}`;
    }
    const ok = status === expected && contentOk && locationOk;
    if (!ok) failures += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${status}  ${path}`);
  }
  // Check the HTML actually sent to Safari and the publicly served PNG, not
  // just layout metadata. Keep old icon URLs working for cached pages too.
  try {
    for (const locale of ["he", "en"]) {
      const response = await fetch(`${BASE}/${locale}`, { headers: { "user-agent": IPHONE_SAFARI } });
      assert.equal(response.status, 200);
      const head = (await response.text()).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
      const name = locale === "he" ? "מנטור משכנתא" : "Mortgage Mentor";
      assert.ok(head.includes(`<meta name="apple-mobile-web-app-title" content="${name}"`), `${locale}: localized home-screen name`);
      assert.ok(head.includes(`<meta name="application-name" content="${name}"`));
      assert.ok(!head.includes('name="mobile-web-app-capable"'), "Setting the shortcut name should not enable standalone mode");
      const icons = [...head.matchAll(/<link\b[^>]*>/gi)]
        .map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])))
        .filter((attributes) => attributes.rel === "apple-touch-icon");
      assert.equal(icons.length, 1, `${locale}: expected one Apple icon in the initial head`);
      assert.equal(icons[0].href, "/apple-touch-icon.png");
      assert.equal(icons[0].sizes, "180x180");
      assert.equal(icons[0].type, "image/png");
    }
    let canonical;
    for (const path of ["/apple-touch-icon.png", "/apple-icon.png?apple-icon.03au4sd3t89f4.png"]) {
      const response = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { "user-agent": IPHONE_SAFARI } });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type") ?? "", /^image\/png\b/);
      const png = Buffer.from(await response.arrayBuffer());
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), 180);
      assert.equal(png.readUInt32BE(20), 180);
      assert.equal(png[25], 2, "Apple icon should be opaque RGB");
      if (canonical) assert.deepEqual(png, canonical);
      else canonical = png;
    }
    console.log("PASS  Safari home-screen icon: he/en head, root fallback and legacy URL");
  } catch (error) {
    failures += 1;
    console.log(`FAIL  Safari home-screen icon: ${error.message}`);
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
