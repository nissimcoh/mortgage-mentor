"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import type { AssignableRole, RoleActionError } from "@/lib/admin/roles";
import { overviewLabels } from "@/lib/admin/overview-labels";
import { adminSetUserRole } from "@/lib/admin/role-actions";

export default function AdminUserRoleControl({ id, email, role, locale }: {
  id: string; email: string | null; role: AssignableRole; locale: Locale;
}) {
  const text = overviewLabels[locale];
  const router = useRouter();
  const [selected, setSelected] = useState<AssignableRole>(role);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<RoleActionError | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    if (pending || selected === role) return;
    const confirmation = selected === "admin" ? text.grantConfirm : text.revokeConfirm;
    if (!window.confirm(confirmation.replace("{email}", email ?? "—"))) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await adminSetUserRole(id, selected, role);
        if (!result.ok) { setError(result.error); return; }
        setSaved(true);
        router.refresh();
      } catch {
        setError("database-error");
      }
    });
  }

  return (
    <div className="min-w-40 space-y-2">
      <label className="block">
        <span className="sr-only">{text.role}: {email ?? "—"}</span>
        <select value={selected} disabled={pending} onChange={(event) => {
          setSelected(event.target.value as AssignableRole); setError(null); setSaved(false);
        }} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base disabled:opacity-60">
          <option value="user">{text.roles.user}</option>
          <option value="admin">{text.roles.admin}</option>
        </select>
      </label>
      <button type="button" onClick={save} disabled={pending || selected === role || saved}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? text.savingRole : text.saveRole}
      </button>
      {error && <p role="alert" className="max-w-56 text-xs leading-5 text-red-700">{text.roleErrors[error]}</p>}
      {saved && <p role="status" className="text-xs text-emerald-700">{text.roleSaved}</p>}
    </div>
  );
}
