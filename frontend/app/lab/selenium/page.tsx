"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { detectSeleniumV2 } from "@/lib/fingerprint";

interface Check {
  key: string;
  label: string;
  triggered: boolean;
  detail: string;
}

const SEVERITY: Record<string, { label: string; color: string }> = {
  selenium_nav_props: { label: "critical", color: "bg-red-600" },
  cdp_wildcard:       { label: "critical", color: "bg-red-600" },
  chrome_deep:        { label: "high",     color: "bg-orange-500" },
  event_listener_leak:{ label: "medium",   color: "bg-amber-500" },
  iframe_selenium:    { label: "high",     color: "bg-orange-500" },
  ua_platform_consistency: { label: "medium", color: "bg-amber-500" },
  cdp_runtime:        { label: "low",      color: "bg-slate-500" },
};

export default function SeleniumModule() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const result = detectSeleniumV2();
    setChecks(result.checks);
    setLoading(false);
  }, []);

  const flaggedCount = checks.filter((c) => c.triggered).length;
  const riskPct = checks.length ? Math.round((flaggedCount / checks.length) * 100) : 0;
  const riskColor = riskPct >= 60 ? "text-red-400" : riskPct >= 30 ? "text-amber-400" : "text-emerald-400";
  const barColor = riskPct >= 60 ? "bg-red-500" : riskPct >= 30 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">← Lab</Link>
        <h1 className="mt-2 text-2xl font-black text-white">🔧 Module 7 — Selenium Detection</h1>
        <p className="text-sm text-slate-400 mt-1">
          7 detection techniques targeting Selenium, ChromeDriver, and WebDriver-specific artifacts.
          Includes comprehensive navigator injection scanning, CDP variable wildcard detection,
          Chrome object deep inspection, and iframe contentWindow property leak detection.
        </p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Running Selenium detection checks…
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-300">Selenium Risk</span>
              <span className={`text-2xl font-black tabular-nums ${riskColor}`}>{riskPct}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-700">
              <div className={`h-3 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${riskPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {flaggedCount} of {checks.length} checks flagged as bot-like
            </p>
          </div>

          {/* Checks */}
          <div className="space-y-2">
            {checks.map((check) => {
              const sev = SEVERITY[check.key];
              return (
                <div
                  key={check.key}
                  className={`rounded-xl border p-4 ${
                    check.triggered ? "border-red-500/40 bg-red-500/5" : "border-slate-700/40 bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-base shrink-0">{check.triggered ? "🚨" : "✅"}</span>
                      <span className="font-mono text-sm font-semibold text-slate-200 truncate">{check.label}</span>
                      {sev && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${sev.color}`}>
                          {sev.label}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-mono font-bold shrink-0 max-w-[200px] text-right truncate ${
                      check.triggered ? "text-red-400" : "text-emerald-400"
                    }`}>
                      {check.detail}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Educational */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
              How Selenium Detection Works
            </h2>
            <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
              <p>
                <strong className="text-slate-300">Navigator Injection Scan:</strong> Selenium and ChromeDriver
                inject properties like <code className="text-amber-400">__webdriver_evaluate</code>,
                <code className="text-amber-400"> __selenium_evaluate</code>,
                <code className="text-amber-400"> domAutomation</code>, and
                <code className="text-amber-400"> _Selenium_IDE_Recorder</code> into the navigator object.
                These are rarely cleaned up by stealth plugins.
              </p>
              <p>
                <strong className="text-slate-300">CDP Variable Wildcard Scan:</strong> ChromeDriver injects
                variables with <code className="text-amber-400">cdc_</code> and
                <code className="text-amber-400"> $cdc_</code> prefixes. A wildcard scan of window properties
                catches all variants, including those that stealth plugins miss.
              </p>
              <p>
                <strong className="text-slate-300">Chrome Object Deep Inspection:</strong> Real Chrome exposes
                <code className="text-amber-400"> chrome.runtime</code>,
                <code className="text-amber-400"> chrome.app</code>,
                <code className="text-amber-400"> chrome.csi</code>, and
                <code className="text-amber-400"> chrome.loadTimes</code>. Automated environments often
                have a partial or missing chrome object.
              </p>
              <p>
                <strong className="text-slate-300">iframe ContentWindow Leak:</strong> Selenium often
                attaches properties to the top-level window but not to iframes. Checking
                <code className="text-amber-400"> iframe.contentWindow.navigator</code> for injected
                properties reveals the true automation state.
              </p>
              <p>
                <strong className="text-slate-300">UA/Platform Consistency:</strong> A Windows User-Agent
                with a Mac platform (or vice versa) is a strong indicator of UA spoofing by automation tools.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { bot: "Selenium + ChromeDriver", detect: "Navigator props + CDP vars" },
                { bot: "Selenium + stealth", detect: "iframe leak + Chrome deep" },
                { bot: "ChromeDriver CDP", detect: "Wildcard $cdc_ scan" },
              ].map((item) => (
                <div key={item.bot} className="rounded-lg bg-slate-800 p-2">
                  <div className="text-xs font-bold text-red-400 mb-1">{item.bot}</div>
                  <div className="text-xs text-slate-400">Detected by: {item.detect}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
