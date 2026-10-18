import { createTrackDraft, LEGACY_TRACK_PARAM_KEYS, MAX_TRACKS, MIN_TRACKS, type TrackDraft } from "../mortgage/scenario-form";

export const CALCULATOR_DRAFT_KEY = "mortgagementor:calculator-draft:v1";
const CHANGE_EVENT = "mortgagementor:draft-changed";
const fields = ["amount", "ratePercent", "years", "trackType", "repaymentMethod", "currentRatePercent", "resetPeriodMonths", "forecastMode", "stressShift", "inflationStressShift", "forecastCurveId", "makamSnapshotId"] as const;

export function draftValues(tracks: TrackDraft[]) {
  return tracks.map(track => Object.fromEntries(fields.map(field => [field, track[field]])));
}

/** Only calculator inputs identify a source; locale and edit metadata do not. */
export function draftSource(query: { toString(): string }): string {
  const source = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query.toString())) {
    if (/^track(?:Count|\d+[A-Za-z]+)$/.test(key) || LEGACY_TRACK_PARAM_KEYS.includes(key)) source.append(key, value);
  }
  source.sort();
  return source.toString();
}

export function parseCalculatorDraft(raw: string | null): { scope: string; source: string; tracks: TrackDraft[] } | null {
  if (!raw || raw.length > 64_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.scope !== "string" || typeof value.source !== "string" || !Array.isArray(value.tracks) || value.tracks.length < MIN_TRACKS || value.tracks.length > MAX_TRACKS) return null;
    const tracks: TrackDraft[] = [];
    for (const track of value.tracks) {
      if (!track || !fields.every(field => typeof track[field] === "string" && track[field].length <= 200)) return null;
      // Preserve incomplete strings; normal form validation still runs on Calculate.
      const seed = Object.fromEntries(fields.map(field => [field, track[field]]));
      tracks.push(createTrackDraft(seed));
    }
    return { scope: value.scope, source: value.source, tracks };
  } catch { return null; }
}

export function readDraftSnapshot(): string | null {
  try { return window.sessionStorage.getItem(CALCULATOR_DRAFT_KEY); }
  catch { return null; }
}

export function subscribeDraft(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function rememberCalculatorDraft(scope: string, source: string, tracks: TrackDraft[]): boolean {
  try {
    window.sessionStorage.setItem(CALCULATOR_DRAFT_KEY, JSON.stringify({ version: 1, scope, source, tracks: draftValues(tracks) }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch { return false; }
}

export function forgetCalculatorDraft() {
  try {
    window.sessionStorage.removeItem(CALCULATOR_DRAFT_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* Storage may be disabled; the calculator must remain usable. */ }
}
