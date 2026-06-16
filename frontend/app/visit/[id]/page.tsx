"use client";

import { useEffect, useState } from "react";
import { fetchVisit, type Visit } from "@/lib/api";
import InfoRow from "@/components/InfoRow";
import ScoreBar from "@/components/ScoreBar";
import VerdictBadge from "@/components/VerdictBadge";
import Link from "next/link";
import { use } from "react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5 shadow">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div>{children}</div>
    </div>
  );
}

function Bool({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-slate-500 italic">—</span>;
  return value ? (
    <span className="text-red-400 font-semibold">Yes ⚠️</span>
  ) : (
    <span className="text-emerald-400">No ✓</span>
  );
}

export default function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVisit(Number(id))
      .then(setVisit)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        Loading visit #{id}…
      </div>
    );

  if (error || !visit)
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
        {error ?? "Visit not found"}
      </div>
    );

  const verdictEmoji =
    visit.verdict === "BOT" ? "🤖" : visit.verdict === "SUSPICIOUS" ? "⚠️" : "✅";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">
              ← Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span>{verdictEmoji}</span>
            Visit #{visit.id}
            <VerdictBadge verdict={visit.verdict} size="lg" />
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {new Date(visit.created_at).toLocaleString()} · IP: {visit.ip ?? "—"}
          </p>
        </div>

        <div className="text-right">
          <div className="text-4xl font-black tabular-nums text-white">
            {visit.bot_probability?.toFixed(1) ?? "—"}%
          </div>
          <div className="text-xs text-slate-400">bot probability</div>
        </div>
      </div>

      {/* Score breakdown */}
      <Section title="Score Breakdown">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <ScoreBar label="Browser Fingerprint" value={visit.browser_score} />
            <ScoreBar label="Behaviour" value={visit.behavior_score} />
          </div>
          <div className="space-y-3">
            <ScoreBar label="Network" value={visit.network_score} />
            <ScoreBar label="ML Model" value={visit.ml_probability} />
          </div>
        </div>
      </Section>

      {/* 2-column grid for the rest */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Identity */}
        <Section title="Identity">
          <InfoRow label="Name" value={visit.name} />
          <InfoRow label="Email" value={visit.email} />
          <InfoRow label="Reason" value={visit.reason} />
          <InfoRow label="IP Address" value={<span className="font-mono text-xs">{visit.ip}</span>} />
          <InfoRow label="ASN / ISP" value={visit.asn} />
        </Section>

        {/* Bot Signals */}
        <Section title="Bot Signals">
          <InfoRow label="WebDriver flag" value={<Bool value={visit.webdriver} />} />
          <InfoRow label="Plugins count" value={
            visit.plugins_count === 0
              ? <span className="text-amber-400 font-semibold">0 ⚠️</span>
              : visit.plugins_count
          } />
          <InfoRow label="Canvas hash" value={
            visit.canvas_hash
              ? <span className="font-mono text-xs">{visit.canvas_hash}</span>
              : null
          } />
          <InfoRow label="GPU vendor" value={visit.gpu_vendor || <span className="text-amber-400">missing ⚠️</span>} />
          <InfoRow label="GPU renderer" value={visit.gpu_renderer || <span className="text-amber-400">missing ⚠️</span>} />
          <InfoRow label="Audio available" value={<Bool value={visit.audio_available ?? null} />} />
          <InfoRow label="Audio hash" value={
            visit.audio_hash
              ? <span className="font-mono text-xs">{visit.audio_hash}</span>
              : <span className="text-amber-400">unavailable ⚠️</span>
          } />
          <InfoRow label="WebRTC available" value={<Bool value={visit.webrtc_available ?? null} />} />
          <InfoRow label="Font count" value={
            visit.font_count === 0
              ? <span className="text-amber-400 font-semibold">0 ⚠️</span>
              : visit.font_count !== null
              ? <span className={(visit.font_count ?? 0) < 5 ? "text-amber-400" : "text-emerald-400"}>{visit.font_count}</span>
              : null
          } />
          <InfoRow label="chrome obj missing" value={
            visit.chrome_obj_missing
              ? <span className="text-red-400 font-semibold">Yes ⚠️</span>
              : <span className="text-emerald-400">No ✓</span>
          } />
          <InfoRow label="Stealth detected" value={
            visit.stealth_detected
              ? <span className="text-red-400 font-semibold">Yes ⚠️</span>
              : <span className="text-emerald-400">No ✓</span>
          } />
          <InfoRow label="Battery API" value={<Bool value={visit.battery_available ?? null} />} />
          <InfoRow label="GPU consistency" value={
            visit.gpu_consistency === 0
              ? <span className="text-red-400 font-semibold">Mismatch ⚠️</span>
              : <span className="text-emerald-400">OK ✓</span>
          } />
          <InfoRow label="Screen/TZ consistency" value={
            visit.timezone_consistency === 0
              ? <span className="text-red-400 font-semibold">Suspicious ⚠️</span>
              : <span className="text-emerald-400">Normal ✓</span>
          } />
        </Section>

        {/* Browser / Navigator */}
        <Section title="Browser & Navigator">
          <InfoRow label="User-Agent" value={
            <span className="font-mono text-xs break-all">{visit.user_agent}</span>
          } />
          <InfoRow label="Platform" value={visit.platform} />
          <InfoRow label="Language" value={visit.language} />
          <InfoRow label="Timezone" value={visit.timezone} />
          <InfoRow label="Screen" value={
            visit.screen_width && visit.screen_height
              ? `${visit.screen_width} × ${visit.screen_height}`
              : null
          } />
          <InfoRow label="Color depth" value={visit.color_depth != null ? `${visit.color_depth}-bit` : null} />
          <InfoRow label="CPU threads" value={visit.hardware_concurrency} />
          <InfoRow label="Device memory" value={visit.device_memory != null ? `${visit.device_memory} GB` : null} />
          <InfoRow label="Touch support" value={<Bool value={visit.touch_support} />} />
          <InfoRow label="Cookies enabled" value={<Bool value={visit.cookie_enabled} />} />
          <InfoRow label="Do Not Track" value={visit.do_not_track} />
        </Section>

        {/* Behaviour */}
        <Section title="Behavioural Signals">
          <InfoRow label="Mouse entropy" value={
            visit.mouse_entropy != null ? (
              <span className={visit.mouse_entropy < 1.5 ? "text-amber-400" : "text-emerald-400"}>
                {visit.mouse_entropy.toFixed(3)}
                {visit.mouse_entropy < 1.5 && " ⚠️ low"}
              </span>
            ) : null
          } />
          <InfoRow label="Avg typing delay" value={
            visit.typing_delay != null ? (
              <span className={visit.typing_delay < 40 ? "text-amber-400" : "text-emerald-400"}>
                {visit.typing_delay.toFixed(0)} ms
                {visit.typing_delay < 40 && " ⚠️ too fast"}
              </span>
            ) : null
          } />
          <InfoRow label="Scroll events" value={
            visit.scroll_events === 0
              ? <span className="text-amber-400">0 ⚠️ no scrolling</span>
              : visit.scroll_events
          } />
          <InfoRow label="Time on page" value={
            visit.time_on_page != null ? (
              <span className={visit.time_on_page < 3 ? "text-amber-400" : "text-emerald-400"}>
                {visit.time_on_page.toFixed(1)}s
                {visit.time_on_page < 3 && " ⚠️ instant submit"}
              </span>
            ) : null
          } />
        </Section>

      </div>
    </div>
  );
}
