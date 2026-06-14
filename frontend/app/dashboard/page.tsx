"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVisits, type Visit } from "@/lib/api";
import VerdictBadge from "@/components/VerdictBadge";
import Link from "next/link";

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [verdictFilter, setVerdictFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVisits(page, PAGE_SIZE, verdictFilter || undefined);
      setVisits(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, verdictFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Detection Dashboard</h1>
          <p className="text-sm text-slate-400">
            {total.toLocaleString()} total visits recorded
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="filter" className="text-sm text-slate-400">
            Filter:
          </label>
          <select
            id="filter"
            value={verdictFilter}
            onChange={(e) => {
              setVerdictFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="HUMAN">Human</option>
            <option value="SUSPICIOUS">Suspicious</option>
            <option value="BOT">Bot</option>
          </select>
          <button
            onClick={load}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-700/60 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Probability</th>
              <th className="px-4 py-3">Verdict</th>
              <th className="px-4 py-3">Browser</th>
              <th className="px-4 py-3">Behaviour</th>
              <th className="px-4 py-3">Network</th>
              <th className="px-4 py-3">ML</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : visits.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                  No visits found
                </td>
              </tr>
            ) : (
              visits.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-400 tabular-nums">#{v.id}</td>
                  <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">
                    {new Date(v.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {v.ip ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-[180px] truncate">
                    {v.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold">
                    <span
                      className={
                        (v.bot_probability ?? 0) >= 65
                          ? "text-red-400"
                          : (v.bot_probability ?? 0) >= 40
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }
                    >
                      {v.bot_probability?.toFixed(1) ?? "—"}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={v.verdict} size="sm" />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">
                    {v.browser_score?.toFixed(0) ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">
                    {v.behavior_score?.toFixed(0) ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">
                    {v.network_score?.toFixed(0) ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">
                    {v.ml_probability?.toFixed(0) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/visit/${v.id}`}
                      className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                    >
                      Details →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-40 hover:text-white transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-400 tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-40 hover:text-white transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
