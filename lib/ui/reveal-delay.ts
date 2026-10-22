import type { CSSProperties } from "react";

/** Staggers the `mm-*` entrance animations defined in globals.css. */
export const revealDelay = (seconds: number) => ({ "--mm-delay": `${seconds}s` }) as CSSProperties;
