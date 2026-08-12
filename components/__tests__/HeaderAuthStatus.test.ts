import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static source-text assertions, not a render test — this repo's test
 * setup (plain `vitest run`, no jsdom/testing-library) can't mount a
 * React component. These exist to catch a future edit that accidentally
 * starts surfacing technical/sensitive user fields (id, tokens, provider
 * metadata) in the account menu, which no component-rendering test could
 * otherwise catch here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "..", "HeaderAuthStatus.tsx"),
  "utf8",
);

describe("HeaderAuthStatus", () => {
  it("only reads safe, presentation-only user fields", () => {
    expect(source).toMatch(/metadata\?\.full_name/);
    expect(source).toMatch(/metadata\?\.name/);
    expect(source).toMatch(/metadata\?\.avatar_url/);
    expect(source).toMatch(/user\.email/);
  });

  it("never reads or renders technical/sensitive user or session fields", () => {
    const forbiddenPatterns = [
      /user\.id\b/,
      /\.access_token/,
      /\.refresh_token/,
      /\.provider_id/,
      /\.provider_token/,
      /app_metadata/,
      /\.sub\b/,
      /\.aud\b/,
      /\.identities/,
    ];
    for (const pattern of forbiddenPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });

  it("uses the existing signOut server action rather than a new sign-out mechanism", () => {
    expect(source).toMatch(/import \{ signOut \} from "@\/lib\/auth\/actions"/);
    expect(source).toMatch(/signOut\.bind\(null, locale\)/);
  });

  it("treats client auth state as presentation-only, not authorization", () => {
    expect(source).toMatch(/presentation-only/i);
    expect(source).toMatch(/never used for authorization/i);
  });
});
