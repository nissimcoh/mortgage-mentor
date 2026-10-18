import { PassThrough } from "node:stream";
import { once } from "node:events";
import { renderToPipeableStream } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import Home from "../../app/[locale]/page";
import he from "../../app/[locale]/dictionaries/he.json";
import en from "../../app/[locale]/dictionaries/en.json";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), forecast: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/app/[locale]/dictionaries", () => ({ getDictionary: async (locale: string) => locale === "he" ? he : en }));
vi.mock("@/lib/market-data/get-market-snapshot", () => ({ getMarketSnapshot: mocks.snapshot }));
vi.mock("@/lib/market-data/sources/boi-mortgage-forecast", () => ({ getMortgageForecastData: mocks.forecast }));
vi.mock("@/components/MarketSnapshotCards", () => ({
  default: ({ snapshot, curve }: { snapshot: { checked: string }; curve: { id: string } }) =>
    <div data-testid="resolved-market">{snapshot.checked}:{curve.id}</div>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.clearAllMocks());

it.each(["he", "en"] as const)("streams the %s home and calculator link while official sources are pending", async (locale) => {
  const dict = locale === "he" ? he : en;
  const snapshot = deferred<{ checked: string }>();
  const forecast = deferred<{ curves: { id: string }[] }>();
  mocks.snapshot.mockReturnValue(snapshot.promise);
  mocks.forecast.mockReturnValue(forecast.promise);

  const output = new PassThrough();
  let html = "";
  output.on("data", (chunk) => { html += chunk.toString(); });
  const firstChunk = once(output, "data");
  const finished = once(output, "end");
  const errors: unknown[] = [];
  const stream = renderToPipeableStream(await Home({ params: Promise.resolve({ locale }) }), {
    onShellReady() { stream.pipe(output); },
    onError(error) { errors.push(error); },
  });

  try {
    await firstChunk;
    expect(html).toContain(dict.home.heroPrimaryCta);
    expect(html).toContain(`href="/${locale}/calculator"`);
    expect(html).toContain(dict.home.toolsTitle);
    expect(html).toContain(dict.market.loading);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("resolved-market");

    // The snapshot alone must not expose incomplete forecast data.
    snapshot.resolve({ checked: "actual-source-time" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(html).not.toContain("resolved-market");
    forecast.resolve({ curves: [{ id: "verified-curve" }] });
    await finished;
    expect(html).toContain("resolved-market");
    expect(html).toContain("actual-source-time");
    expect(html).toContain("verified-curve");
    expect(errors).toEqual([]);
  } finally {
    stream.abort();
    output.destroy();
  }
});
