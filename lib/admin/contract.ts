/**
 * Shared result contract for admin Server Actions. A small, stable,
 * closed set of codes — never a raw database/Postgres error message —
 * mirroring the same convention as lib/scenarios/contract.ts.
 */

export type AdminActionError =
  | "unauthenticated"
  | "forbidden"
  | "invalid-id"
  | "cannot-delete-self"
  | "database-error";

export interface AdminActionFailure {
  ok: false;
  error: AdminActionError;
}
