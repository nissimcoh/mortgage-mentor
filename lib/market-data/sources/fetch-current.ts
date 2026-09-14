/** Upstream transport, invoked only by the daily parsed-data cache on refresh.
 * Bypass the raw-response cache to avoid two independent lifetimes.
 * Successful parsing is required before replacing saved data. */
export async function fetchCurrent<T>(url: string, parse: (response: Response) => Promise<T>): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Official source responded with status ${response.status}`);
      return await parse(response);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}
