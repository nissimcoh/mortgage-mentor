"use client";

import { useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { AdminUserOverview as UserOverview } from "@/lib/admin/user-overview";
import { overviewLabels } from "@/lib/admin/overview-labels";
import { formatDateOnly, formatDateTimeIsrael } from "@/lib/forms/dates";
import AdminUserRoleControl from "./AdminUserRoleControl";

type Filter = "all" | "recent" | "empty" | "review";

export default function AdminUserOverview({ users, locale, loadedAt, canManageRoles = false }: {
  users: UserOverview[]; locale: Locale; loadedAt: string; canManageRoles?: boolean;
}) {
  const text = overviewLabels[locale];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const totals = useMemo(() => ({
    recent: users.filter((user) => user.status === "recent").length,
    saved: users.reduce((sum, user) => sum + user.savedCount, 0),
    review: users.filter((user) => user.reviewSuggested).length,
  }), [users]);
  const visible = useMemo(() => users.filter((user) => {
    if (search.trim() && !(user.email ?? "").toLowerCase().includes(search.trim().toLowerCase())) return false;
    return filter === "all" || (filter === "recent" && user.status === "recent") ||
      (filter === "empty" && user.savedCount === 0) || (filter === "review" && user.reviewSuggested);
  }), [users, filter, search]);
  const date = (value: string | null) => value ? formatDateTimeIsrael(value, locale) : text.unknown;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[text.users, users.length], [text.recent, totals.recent], [text.saved, totals.saved], [text.review, totals.review]].map(([label, value]) => (
          <div key={label} className="glass-panel rounded-2xl border border-slate-200 p-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-2 text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-600">
        <p>{text.activityHelp}</p>
        <p>{text.roleHelp}</p>
        <p>{text.reviewHelp}</p>
        <p>{text.loaded}{date(loadedAt)}</p>
      </div>
      <section className="glass-panel rounded-2xl border border-slate-200 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap gap-4">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
            {text.search}
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {text.filter}
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base">
              <option value="all">{text.all}</option>
              <option value="recent">{text.recent}</option>
              <option value="empty">{text.emptySaved}</option>
              <option value="review">{text.review}</option>
            </select>
          </label>
        </div>
        <p role="status" className="mb-3 text-sm text-slate-600">{visible.length} {text.shown}</p>
        {visible.length === 0 ? <p className="py-6 text-slate-600">{text.noResults}</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={text.table}>
            <table className="w-full text-start text-sm">
              <caption className="sr-only">{text.table}</caption>
              <thead><tr className="border-b border-slate-200 text-slate-600">
                {[text.email, text.role, text.joined, text.signIn, text.lastSave, text.count, text.status, text.reviewColumn].map((header) => <th key={header} scope="col" className="whitespace-nowrap px-3 py-3 text-start font-medium">{header}</th>)}
              </tr></thead>
              <tbody>{visible.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 align-top">
                  <th scope="row" className="px-3 py-4 text-start font-medium"><span dir="ltr">{user.email ?? "—"}</span>{user.isCurrentUser && <span className="mt-1 block text-xs text-slate-500">{text.you}</span>}</th>
                  <td className="px-3 py-4">{canManageRoles && user.role !== "owner"
                    ? <AdminUserRoleControl key={`${user.id}:${user.role}`} id={user.id} email={user.email} role={user.role} locale={locale} />
                    : <span className="whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1 text-xs">{text.roles[user.role]}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">{formatDateOnly(user.joinedAt, locale)}</td>
                  <td className="whitespace-nowrap px-3 py-4">{date(user.lastSignInAt)}</td>
                  <td className="whitespace-nowrap px-3 py-4">{date(user.lastSaveAt)}</td>
                  <td className="px-3 py-4 font-semibold tabular-nums">{user.savedCount}</td>
                  <td className="min-w-56 px-3 py-4">
                    <span className={`inline-block rounded-lg px-2 py-1 text-xs ${user.status === "recent" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{text.statuses[user.status]}</span>
                    {user.lastRecordedActivityAt && <p className="mt-2 text-xs text-slate-600">{text.activity}: {date(user.lastRecordedActivityAt)}</p>}
                    {user.daysSinceActivity !== null && <p className="mt-1 text-xs text-slate-500">{user.daysSinceActivity} {text.days}</p>}
                  </td>
                  <td className="px-3 py-4">{user.reviewSuggested ? <span className="inline-block whitespace-nowrap rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{text.reviewBadge}</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
