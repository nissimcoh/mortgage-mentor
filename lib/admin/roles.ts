export type UserRole = "user" | "admin" | "owner";
export type AssignableRole = Exclude<UserRole, "owner">;

export function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin" || value === "owner";
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === "user" || value === "admin";
}

export type RoleActionError = "unauthenticated" | "forbidden" | "invalid-id" |
  "invalid-role" | "owner-protected" | "user-not-found" | "role-changed" | "database-error";
export type RoleActionResult = { ok: true } | { ok: false; error: RoleActionError };
