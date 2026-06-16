"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { detectStealthV2 } from "@/lib/fingerprint";

interface Check {
  key: string;
  label: string;
  triggered: boolean;
  detail: string;
}

const CATEGORY_META = {
  perf:    { label: "Performance Artifacts", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  proto:   { label: "Prototype Integrity",  color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  env:     { label: "Environment Probing",  color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
  nav:     { label: "Navigator Tampering",  color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  timing:  { label: "Timing Analysis",      color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30" },
};

function categorize(key: string): keyof typeof CATEGORY_META {
  if (key.startsWith("perf") || key === "perf_entries") return "perf";
  if (key.startsWith("plugin") || key.startsWith("nav")) return "proto";
  if (key === "speech_voices" || key === "webgl_extensions" || key === "net_info") return "env";
  if (key.startsWith("timing")) return "timing";
  return "nav";
}

export default function PlaywrightModule() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const result = detectStealthV2();
    setChecks(result.checks);
    setLoading(false);
  }, []);

  const flaggedCount = checks.filter((c) => c.triggered).length;
  const riskPct = checks.length ? Math.round((flaggedCount / checks.length) * 100) : 0;
  const riskColor = riskPct >= 60 ? "text-red-400" : riskPct >= 30 ? "text-amber-400" : "text-emerald-400";
  const barColor = riskPct >= 60 ? "bg-red-500" : riskPct >= 30 ? "bg-amber-500" : "bg-emerald-500";

  const categories = ["perf", "proto", "env", "nav", "timing"] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">← Lab</Link>
        <h1 className="mt-2 text-2xl font-black text-white">🎭 Module 6 — Playwright Stealth Detection</h1>
        <p className="text-sm text-slate-400 mt-1">
          7 deep detection techniques targeting artifacts left by Playwright and its stealth plugins.
          Beyond basic webdriver checks — examines performance entries, prototype chains,
          speech synthesis, navigator descriptors, WebGL, timing resolution, and NetworkInformation API.
        </p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Running Playwright detection checks…
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-300">Playwright Stealth Risk</span>
              <span className={`text-2xl font-black tabular-nums ${riskColor}`}>{riskPct}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-700">
              <div className={`h-3 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${riskPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {flaggedCount} of {checks.length} checks flagged as suspicious
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((cat) => {
                const meta = CATEGORY_META[cat];
                const catChecks = checks.filter((c) => categorize(c.key) === cat);
                const flagged = catChecks.filter((c) => c.triggered).length;
                if (catChecks.length === 0) return null;
                return (
                  <div key={cat} className={`rounded-lg border px-3 py-1.5 text-xs ${meta.border} ${meta.bg}`}>
                    <span className={`font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="ml-2 text-slate-400">{flagged}/{catChecks.length}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checks */}
          <div className="space-y-2">
            {checks.map((check) => (
              <div
                key={check.key}
                className={`rounded-xl border p-4 ${
                  check.triggered ? "border-red-500/40 bg-red-500/5" : "border-slate-700/40 bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-base shrink-0">{check.triggered ? "🚨" : "✅"}</span>
                    <span className="font-mono text-sm font-semibold text-slate-200 truncate">{check.label}</span>
                  </div>
                  <span className={`text-xs font-mono font-bold shrink-0 max-w-[200px] text-right truncate ${
                    check.triggered ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {check.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Educational */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
              How Playwright Stealth Detection Works
            </h2>
            <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
              <p>
                <strong className="text-slate-300">Performance Entry Anomaly:</strong> CDP (Chrome DevTools Protocol)
                leaves evaluation scripts in the performance resource timeline. These entries are not present in
                regular browser usage.
              </p>
              <p>
                <strong className="text-slate-300">Plugin Prototype Chain:</strong> Stealth plugins fake
                navigator.plugins but break the prototype chain. Checking if the PluginArray constructor
                contains <code className="text-amber-400">[native code]</code> reveals the forgery.
              </p>
              <p>
                <strong className="text-slate-300">SpeechSynthesis Voices:</strong> Headless Chrome has 0 speech
                synthesis voices. Real browsers always have at least the default system voice.
              </p>
              <p>
                <strong className="text-slate-300">Navigator Descriptor Integrity:</strong> Stealth patches replace
                the webdriver getter. Inspecting the property descriptor reveals when the getter function
                is not native code.
              </p>
              <p>
                <strong className="text-slate-300">WebGL Extension Count:</strong> Headless Chrome exposes fewer
                WebGL extensions than real browsers with GPU drivers. Fewer than 5 extensions is suspicious.
              </p>
              <p>
                <strong className="text-slate-300">Performance.now() Resolution:</strong> CDP evaluation bridge
                can produce zero-resolution timing, which is impossible in real browsers.
              </p>
              <p>
                <strong className="text-slate-300">NetworkInformation API:</strong> The navigator.connection
                object is present in real browsers but often missing in headless environments.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
