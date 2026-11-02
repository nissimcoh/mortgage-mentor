import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ComparisonPaymentCharts from "../../../components/ComparisonPaymentCharts";
import SavedScenarioComparison from "../../../components/SavedScenarioComparison";
import he from "../../../app/[locale]/dictionaries/he.json";
import en from "../../../app/[locale]/dictionaries/en.json";
import type { ComparisonScenario } from "../comparison";

vi.mock("@/lib/scenarios/comparison-actions", () => ({ loadComparisonPayments: vi.fn() }));

const base: ComparisonScenario = {
  id: "11111111-1111-4111-8111-111111111111", name: "Synthetic A", calculatedAt: "2026-10-06T12:00:00Z",
  result: { schemaVersion: 1, totalPrincipal: 180000, firstPayment: 1200, highestPayment: 1600, highestPaymentMonth: 180, forecastTotalPaid: 240000, totalInterestOrFinancingCost: 60000, stabilityScore: 50, trackCount: 1 },
  years: 15, rateExposure: 1, cpiExposure: 0, fixedShare: 0, forecastSignature: "synthetic", customForecast: false, payments: Array(180).fill(1200),
};
const second = { ...base, id: "22222222-2222-4222-8222-222222222222", name: "Synthetic B", years: 20, payments: Array(240).fill(1000) };

it.each(["he", "en"] as const)("renders both charts with one accessible shared month selector in %s", locale => {
  const labels = locale === "he" ? he.savedComparison : en.savedComparison;
  const html = renderToStaticMarkup(<SavedScenarioComparison scenarios={[base, second]} locale={locale} labels={labels} />);
  expect(html).toContain(labels.monthlyChartTitle);
  expect(html).toContain(labels.cumulativeChartTitle);
  expect((html.match(/<polyline /g) ?? []).length).toBe(4);
  expect((html.match(/type="range"/g) ?? []).length).toBe(1);
  expect(html).toContain('min="1" max="240" step="1"');
  expect(html).toContain("aria-valuetext=");
  expect(html).toContain('stroke="#00897b"');
  expect(html).toContain('stroke="#6250d6" stroke-dasharray="8 4"');
  expect(html).toContain("background-color:#6250d6");
  expect(html).toContain(labels.metric);
  expect(html).not.toContain(labels.chartUnavailable);
  expect(html).not.toContain("NaN");
});

it("keeps three lines distinguishable by number and dash pattern in both charts", () => {
  const third = { ...base, id: "33333333-3333-4333-8333-333333333333", name: "Synthetic C" };
  const html = renderToStaticMarkup(<ComparisonPaymentCharts scenarios={[base, second, third]} locale="en" labels={en.savedComparison} />);
  expect((html.match(/<polyline /g) ?? []).length).toBe(6);
  expect(html).toContain('stroke="#b8862e" stroke-dasharray="2 4"');
  expect(html).toContain("3. Synthetic C");
});

it("names a mix without history once, after the results, with no invented line or empty chart row", () => {
  const html = renderToStaticMarkup(<SavedScenarioComparison scenarios={[base, { ...second, payments: null }]} locale="he" labels={he.savedComparison} />);
  expect((html.match(/<polyline /g) ?? []).length).toBe(2);
  expect((html.match(new RegExp(he.savedComparison.chartUnavailable, "g")) ?? []).length).toBe(1);
  // The note follows the comparison table instead of preceding the charts.
  expect(html.indexOf(he.savedComparison.chartsMissingLead)).toBeGreaterThan(html.indexOf("</table>"));
  expect(html).toContain(`/he/saved/${second.id}`);
  expect(html).not.toContain("amber");
  // A missing longer mix still defines the common time axis.
  expect(html).toContain('max="240"');
});

it("retains the summary table when neither historical chart can be reconstructed", () => {
  const html = renderToStaticMarkup(<SavedScenarioComparison scenarios={[{ ...base, payments: null }, { ...second, payments: null }]} locale="en" labels={en.savedComparison} />);
  expect(html).not.toContain("<polyline");
  expect(html).not.toContain('type="range"');
  // No empty chart panels: the charts section is omitted entirely.
  expect(html).not.toContain(en.savedComparison.monthlyChartTitle);
  expect(html).toContain(en.savedComparison.chartUnavailable.replaceAll("'", "&#x27;"));
  expect(html).toContain(en.savedComparison.total);
  expect(html).toContain("240,000");
});
