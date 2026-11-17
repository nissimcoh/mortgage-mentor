/**
 * Early-repayment balance reports: `import { ... } from "@/lib/payoff-report"`.
 *
 * Safe for client and server. The model call (`./extract`) and upload
 * validation (`./upload`) are server-side and imported by path, so the
 * extraction prompt and Node APIs never enter the browser bundle.
 */

export * from "./types";
export * from "./parse";
export * from "./checks";
export * from "./combine";
export * from "./confirm";
export * from "./present";
export * from "./simulate";
