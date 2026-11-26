// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import he from "@/app/[locale]/dictionaries/he.json";
import { prepareForConfirm, parsePayoffReportFile, simulateExistingMortgage } from "@/lib/payoff-report";
import { fictionalTwoLoanFile } from "@/lib/payoff-report/__tests__/fixtures";
import { buildMortgageSummary } from "@/lib/share-image/summary";
import ComparisonImage from "../share-image/ComparisonImage";
import MortgageSummaryImage from "../share-image/MortgageSummaryImage";
import { mount, unmount } from "./dom-helpers";

const market = { boiRatePercent: 3, nominalZeroYieldsPercent: [], realZeroYieldsPercent: [], expectedCpiIndex: [] };
afterEach(unmount);

it("draws a card per active track and never prints a full loan number", async () => {
  const parsed = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!parsed.ok) throw new Error("fixture must parse");
  const loans = prepareForConfirm(parsed.file).loans;
  const data = buildMortgageSummary(loans, simulateExistingMortgage(loans, market));
  await mount(<MortgageSummaryImage data={data} locale="he" labels={he.shareImage} kindNames={he.payoffPage.forecastKinds} siteName="MortgageMentor" createdOn="נוצר היום" />);
  expect(document.querySelectorAll("article")).toHaveLength(3);
  const text = document.body.textContent ?? "";
  for (const loan of loans) {
    const digits = loan.loanNumber!.replace(/\D/g, "");
    expect(text.replace(/\D/g, "")).not.toContain(digits);
    expect(text).toContain(`…${digits.slice(-4)}`);
  }
  expect(text).toContain(he.shareImage.footerNote);
});

it("lays out a column per option and marks the best value in a row", async () => {
  await mount(<ComparisonImage locale="he" title="השוואה" note="הערה" siteName="MortgageMentor" createdOn="היום"
    columns={[{ name: "א", color: "#000" }, { name: "ב", color: "#111" }]}
    headline={{ label: "החזר ראשון", values: ["1", "2"] }}
    rows={[{ label: "סה״כ", values: ["10", "9"], best: 1 }]}
    takeaways={["ב זול יותר"]} />);
  expect(document.querySelectorAll("article")).toHaveLength(2);
  expect(document.body.textContent).toContain("✓");
  expect(document.body.textContent).toContain("ב זול יותר");
});
