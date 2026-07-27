"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { CalculatorMarketData } from "@/lib/market-data/build-calculator-market-data";
import {
  isPinnedCurveMissing,
  isPinnedMakamSnapshotMissing,
  parseAllTrackDrafts,
  parseTracksFromQuery,
  type MarketContextForParsing,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import {
  buildScenarioQueryString,
  extractScenarioQueryParams,
  parsePastedCalculatorLink,
  type ScenarioSide,
} from "@/lib/mortgage/scenario-url";
import {
  tryCalculateScenario,
  type ScenarioForCompare,
} from "@/lib/mortgage/scenario-compare";
import ScenarioLinkInput from "./ScenarioLinkInput";
import ScenarioComparisonResults from "./ScenarioComparisonResults";

type ComparePageLabels = Dictionary["comparePage"];

interface ScenarioCompareProps {
  locale: Locale;
  labels: ComparePageLabels;
  marketData: CalculatorMarketData;
  calculatorHref: string;
}

interface ScenarioSideState {
  name: string;
  rawLink: string;
  drafts: TrackDraft[] | null;
  /** Set only by an explicit "Load scenario" click that failed. */
  loadError: string | null;
}

function emptySideState(name: string): ScenarioSideState {
  return { name, rawLink: "", drafts: null, loadError: null };
}

/** Reads one side's drafts from the compare page's OWN URL (a/b-prefixed),
 * for restoring a previously shared comparison link. */
function loadSideFromQuery(
  searchParams: URLSearchParams,
  side: ScenarioSide,
): ScenarioSideState {
  const scoped = extractScenarioQueryParams(searchParams, side);
  const drafts = parseTracksFromQuery(scoped);
  const name = searchParams.get(`${side}Name`) ?? "";
  return { name, rawLink: "", drafts, loadError: null };
}

interface ScenarioComputeResult {
  scenario: ScenarioForCompare | null;
  /** Structurally parsed but a pinned curve/Makam snapshot it needs is
   * unavailable — a more specific message than a generic invalid link. */
  missingPinnedData: boolean;
}

function computeScenario(
  state: ScenarioSideState,
  fallbackName: string,
  market: MarketContextForParsing,
): ScenarioComputeResult {
  if (!state.drafts) return { scenario: null, missingPinnedData: false };
  const missingPinnedData = state.drafts.some(
    (draft) =>
      isPinnedCurveMissing(draft, market) ||
      isPinnedMakamSnapshotMissing(draft, market),
  );
  const inputs = parseAllTrackDrafts(state.drafts, market);
  if (!inputs) return { scenario: null, missingPinnedData };
  const summary = tryCalculateScenario(inputs);
  if (!summary) return { scenario: null, missingPinnedData };
  return {
    scenario: { name: state.name.trim() || fallbackName, inputs, summary },
    missingPinnedData,
  };
}

export default function ScenarioCompare({
  locale,
  labels,
  marketData,
  calculatorHref,
}: ScenarioCompareProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const market: MarketContextForParsing = {
    boiRatePercent: marketData.boiRatePercent,
    curves: marketData.curves,
    makamSnapshots: marketData.makamSnapshots,
  };

  const [initial] = useState(() => ({
    a: loadSideFromQuery(searchParams, "a"),
    b: loadSideFromQuery(searchParams, "b"),
  }));
  const [a, setA] = useState<ScenarioSideState>(initial.a);
  const [b, setB] = useState<ScenarioSideState>(initial.b);

  function stateFor(side: ScenarioSide) {
    return side === "a" ? a : b;
  }
  function setStateFor(side: ScenarioSide) {
    return side === "a" ? setA : setB;
  }

  function handleLoad(side: ScenarioSide) {
    const state = stateFor(side);
    const setState = setStateFor(side);
    const params = parsePastedCalculatorLink(state.rawLink);
    if (params === null) {
      setState({ ...state, drafts: null, loadError: labels.linkMissingError });
      return;
    }
    const drafts = parseTracksFromQuery(params);
    if (drafts === null) {
      setState({ ...state, drafts: null, loadError: labels.linkInvalidError });
      return;
    }
    setState({ ...state, drafts, loadError: null });
  }

  function handleCompare() {
    if (!a.drafts || !b.drafts) return;
    const query = new URLSearchParams();
    for (const [key, value] of new URLSearchParams(
      buildScenarioQueryString(a.drafts, "a"),
    )) {
      query.set(key, value);
    }
    for (const [key, value] of new URLSearchParams(
      buildScenarioQueryString(b.drafts, "b"),
    )) {
      query.set(key, value);
    }
    if (a.name.trim()) query.set("aName", a.name.trim());
    if (b.name.trim()) query.set("bName", b.name.trim());
    router.push(`${pathname}?${query.toString()}`);
  }

  const resultA = computeScenario(a, labels.scenarioALabel, market);
  const resultB = computeScenario(b, labels.scenarioBLabel, market);

  function errorFor(
    side: ScenarioSide,
    state: ScenarioSideState,
    result: ScenarioComputeResult,
  ): string | null {
    if (state.loadError) return state.loadError;
    if (state.drafts && !result.scenario) {
      return result.missingPinnedData
        ? labels.pinnedDataMissingNote
        : labels.linkInvalidError;
    }
    return null;
  }

  const showResults = resultA.scenario !== null && resultB.scenario !== null;

  return (
    <div className="w-full">
      <div className="grid gap-4 sm:grid-cols-2">
        <ScenarioLinkInput
          labels={labels}
          scenarioLabel={labels.scenarioALabel}
          name={a.name}
          onNameChange={(value) => setA({ ...a, name: value })}
          rawLink={a.rawLink}
          onRawLinkChange={(value) => setA({ ...a, rawLink: value })}
          onLoad={() => handleLoad("a")}
          loaded={a.drafts !== null && resultA.scenario !== null}
          loadedTrackCount={a.drafts?.length ?? 0}
          error={errorFor("a", a, resultA)}
          calculatorHref={calculatorHref}
        />
        <ScenarioLinkInput
          labels={labels}
          scenarioLabel={labels.scenarioBLabel}
          name={b.name}
          onNameChange={(value) => setB({ ...b, name: value })}
          rawLink={b.rawLink}
          onRawLinkChange={(value) => setB({ ...b, rawLink: value })}
          onLoad={() => handleLoad("b")}
          loaded={b.drafts !== null && resultB.scenario !== null}
          loadedTrackCount={b.drafts?.length ?? 0}
          error={errorFor("b", b, resultB)}
          calculatorHref={calculatorHref}
        />
      </div>

      <div className="mt-4">
        <button
          type="button"
          disabled={!a.drafts || !b.drafts}
          onClick={handleCompare}
          className="rounded-xl bg-slate-900 px-6 py-2.5 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {labels.compareButton}
        </button>
      </div>

      {showResults && resultA.scenario && resultB.scenario && (
        <ScenarioComparisonResults
          locale={locale}
          labels={labels}
          scenarioA={resultA.scenario}
          scenarioB={resultB.scenario}
        />
      )}
    </div>
  );
}
