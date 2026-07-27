/**
 * Pure copy-result logic for the "copy scenario link" button: given a copy
 * implementation (real clipboard API in the browser, a stub in tests),
 * resolves to whether it actually succeeded — so the UI can show success
 * or a graceful fallback message without ever throwing.
 */
export type CopyLinkResult = "success" | "fallback";

export async function copyScenarioLink(
  copyToClipboard: (text: string) => Promise<void>,
  url: string,
): Promise<CopyLinkResult> {
  try {
    await copyToClipboard(url);
    return "success";
  } catch {
    return "fallback";
  }
}
