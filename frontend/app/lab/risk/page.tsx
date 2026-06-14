"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MouseTracker,
  TypingTracker,
  canvasFingerprint,
  gpuInfo,
  staticSignals,
} from "@/lib/fingerprint";
import { analyze, type AnalyzeResult } from "@/lib/api";

// ── Signal definition ────────────────────────────────────────────────────────
interface Signal {
  key: string;
  label: string;
  category: "browser" | "behavior" | "network" | "ml";
  points: number;
  maxPoints: number;
  triggered: boolean;
  explanation: string;
  value: string;
}

const CATEGORY_COLORS = {
  browser: { bg: "bg-blue-500", text: "text-blue-400", border: "border-blue-500/30" },
  behavior: { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30" },
  network: { bg: "bg-purple-500", text: "text-purple-400", border: "border-purple-500/30" },
  ml: { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/30" },
};

const CATEGORY_WEIGHTS = { browser: 35, behavior: 25, network: 15, ml: 25 };

type PageState = "idle" | "collecting" | "done" | "error";

export default function RiskModule() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name] = useState("Lab Visitor");
  const [email] = useState("lab@botdetector.test");

  const mouseRef = useRef(new MouseTracker());
  const typingRef = useRef(new TypingTracker());
  const startTime = useRef(Date.now());

  useEffect(() => {
    mouseRef.current.start();
    typingRef.current.start();
    return () => {
      mouseRef.current.stop();
      typingRef.current.stop();
    };
  }, []);

  async function runAnalysis() {
    setPageState("collecting");
    setError(null);

    try {
      const gpu = gpuInfo();
      const statics = staticSignals();
      const canvasHash = await canvasFingerprint();
      const timeOnPage = (Date.now() - startTime.current) / 1000;
      const mouseEntropy = mouseRef.current.entropy();
      const typingDelay = typingRef.current.avgDelay();
      const scrollEvents = mouseRef.current.scrollEvents();

      const payload = {
        name,
        email,
        reason: "research" as const,
        ...statics,
        gpu_vendor: gpu.gpu_vendor,
        gpu_renderer: gpu.gpu_renderer,
        canvas_hash: canvasHash,
        mouse_entropy: mouseEntropy,
        typing_delay: typingDelay,
        scroll_events: scrollEvents,
        time_on_page: timeOnPage,
      };

      const data = await analyze(payload);
      setResult(data);

      // Build per-signal breakdown
      const ua = statics.user_agent.toLowerCase();
      const built: Signal[] = [
        // ── Browser signals ──
        {
          key: "webdriver", category: "browser",
          label: "WebDriver Flag",
          points: statics.webdriver ? 45 : 0, maxPoints: 45,
          triggered: statics.webdriver,
          value: String(statics.webdriver),
          explanation: "navigator.webdriver is true — this browser is controlled by automation.",
        },
        {
          key: "headless_ua", category: "browser",
          label: "Headless UA Keyword",
          points: /headless|selenium|playwright|puppeteer|phantom/.test(ua) ? 30 : 0,
          maxPoints: 30,
          triggered: /headless|selenium|playwright|puppeteer|phantom/.test(ua),
          value: statics.user_agent.slice(0, 60) + "…",
          explanation: "The User-Agent contains a keyword associated with headless browsers.",
        },
        {
          key: "plugins", category: "browser",
          label: "Zero Plugins",
          points: statics.plugins_count === 0 ? 10 : 0, maxPoints: 10,
          triggered: statics.plugins_count === 0,
          value: `${statics.plugins_count} plugins`,
          explanation: "Headless Chrome has 0 plugins. Real browsers have at least some.",
        },
        {
          key: "gpu_vendor", category: "browser",
          label: "Missing GPU Vendor",
          points: !gpu.gpu_vendor ? 5 : 0, maxPoints: 5,
          triggered: !gpu.gpu_vendor,
          value: gpu.gpu_vendor || "empty",
          explanation: "No WebGL vendor — headless environments often lack real GPU support.",
        },
        {
          key: "gpu_renderer", category: "browser",
          label: "Missing GPU Renderer",
          points: !gpu.gpu_renderer ? 5 : 0, maxPoints: 5,
          triggered: !gpu.gpu_renderer,
          value: gpu.gpu_renderer || "empty",
          explanation: "No WebGL renderer — another GPU/headless indicator.",
        },
        {
          key: "canvas", category: "browser",
          label: "No Canvas Hash",
          points: !canvasHash ? 5 : 0, maxPoints: 5,
          triggered: !canvasHash,
          value: canvasHash || "empty",
          explanation: "Canvas fingerprint failed — may indicate a sandboxed or headless environment.",
        },
        // ── Behavior signals ──
        {
          key: "mouse_entropy", category: "behavior",
          label: "Low Mouse Entropy",
          points: mouseEntropy < 1.5 ? 30 : 0, maxPoints: 30,
          triggered: mouseEntropy < 1.5,
          value: mouseEntropy.toFixed(3),
          explanation: "Very little mouse movement — bots don't move the mouse or move it in straight lines.",
        },
        {
          key: "typing_delay", category: "behavior",
          label: "Fast Typing (<40ms)",
          points: typingDelay < 40 ? 30 : 0, maxPoints: 30,
          triggered: typingDelay < 40,
          value: typingDelay > 0 ? `${typingDelay.toFixed(0)}ms avg` : "no input",
          explanation: "Typing faster than 40ms per keystroke is impossible for humans.",
        },
        {
          key: "scroll", category: "behavior",
          label: "No Scroll Events",
          points: scrollEvents === 0 ? 20 : 0, maxPoints: 20,
          triggered: scrollEvents === 0,
          value: `${scrollEvents} events`,
          explanation: "Real users almost always scroll at least once. Bots go straight to submit.",
        },
        {
          key: "time_on_page", category: "behavior",
          label: "Instant Submission (<3s)",
          points: timeOnPage > 0 && timeOnPage < 3 ? 20 : 0, maxPoints: 20,
          triggered: timeOnPage > 0 && timeOnPage < 3,
          value: `${timeOnPage.toFixed(1)}s`,
          explanation: "Submitting within 3 seconds of page load — bots don't read the page.",
        },
        // ── Network ──
        {
          key: "datacenter", category: "network",
          label: "Datacenter IP",
          points: data.network_score, maxPoints: 30,
          triggered: data.network_score > 0,
          value: data.network_score > 0 ? "datacenter/VPN detected" : "residential IP",
          explanation: "IP belongs to a cloud provider, datacenter, or VPN service.",
        },
        // ── ML ──
        {
          key: "ml", category: "ml",
          label: "ML Model Score",
          points: data.ml_probability, maxPoints: 100,
          triggered: data.ml_probability >= 40,
          value: `${data.ml_probability.toFixed(1)}/100`,
          explanation: "Random Forest classifier trained on 6 behavioral and browser features.",
        },
      ];

      setSignals(built);
      setPageState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPageState("error");
    }
  }

  const riskColor =
    result?.bot_probability != null
      ? result.bot_probability >= 65
        ? "text-red-400"
        : result.bot_probability >= 40
        ? "text-amber-400"
        : "text-emerald-400"
      : "text-slate-400";

  const gaugeColor =
    result?.bot_probability != null
      ? result.bot_probability >= 65
        ? "bg-red-500"
        : result.bot_probability >= 40
        ? "bg-amber-500"
        : "bg-emerald-500"
      : "bg-slate-600";

  const byCategory = (cat: "browser" | "behavior" | "network" | "ml") =>
    signals.filter((s) => s.category === cat);

  const categoryScore = (cat: "browser" | "behavior" | "network" | "ml") => {
    const s = byCategory(cat);
    const earned = s.reduce((a, b) => a + b.points, 0);
    const max = s.reduce((a, b) => a + b.maxPoints, 0);
    return max ? Math.round((earned / max) * 100) : 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">📊 Module 5 — Risk Score Breakdown</h1>
        <p className="text-sm text-slate-400 mt-1">
          See exactly which signal triggers, how many points it contributes, and how the final
          score is calculated. Move your mouse around this page before running to generate
          behavioral data.
        </p>
      </div>

      {pageState === "idle" && (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-8 text-center space-y-4">
          <div className="text-5xl">🎯</div>
          <p className="text-slate-300">
            Move your mouse, type something, and scroll this page — then click Analyse to see
            your full risk score with a per-signal explanation.
          </p>
          <button
            onClick={runAnalysis}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Analyse My Browser
          </button>
        </div>
      )}

      {pageState === "collecting" && (
        <div className="flex h-32 items-center justify-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Collecting signals and running analysis…
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
          <button onClick={() => setPageState("idle")} className="ml-3 underline">
            Try again
          </button>
        </div>
      )}

      {pageState === "done" && result && (
        <div className="space-y-6">
          {/* Big risk score */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Risk Score</h2>
                <p className="text-xs text-slate-400">
                  Verdict:{" "}
                  <span className={`font-bold ${riskColor}`}>{result.verdict}</span>
                </p>
              </div>
              <div className={`text-5xl font-black tabular-nums ${riskColor}`}>
                {result.bot_probability.toFixed(0)}
                <span className="text-lg text-slate-400">/100</span>
              </div>
            </div>
            <div className="h-4 w-full rounded-full bg-slate-700 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-1000 ${gaugeColor}`}
                style={{ width: `${result.bot_probability}%` }}
              />
            </div>

            {/* Category weights */}
            <div className="mt-4 grid grid-cols-4 gap-3">
              {(["browser", "behavior", "network", "ml"] as const).map((cat) => {
                const c = CATEGORY_COLORS[cat];
                const score = categoryScore(cat);
                return (
                  <div key={cat} className={`rounded-lg border ${c.border} bg-slate-800/50 p-3`}>
                    <div className={`text-xs font-bold uppercase ${c.text} mb-1`}>{cat}</div>
                    <div className="text-lg font-black text-white tabular-nums">{score}%</div>
                    <div className="text-xs text-slate-500">weight {CATEGORY_WEIGHTS[cat]}%</div>
                    <div className="mt-2 h-1 rounded-full bg-slate-700">
                      <div
                        className={`h-1 rounded-full ${c.bg}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-signal breakdown */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Signal Breakdown
            </h2>

            {(["browser", "behavior", "network", "ml"] as const).map((cat) => (
              <div key={cat}>
                <div
                  className={`text-xs font-bold uppercase tracking-wide mb-2 ${CATEGORY_COLORS[cat].text}`}
                >
                  {cat} signals (weight: {CATEGORY_WEIGHTS[cat]}%)
                </div>
                <div className="space-y-2">
                  {byCategory(cat).map((sig) => (
                    <div
                      key={sig.key}
                      className={`rounded-xl border p-3 ${
                        sig.triggered
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-slate-700/40 bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span>{sig.triggered ? "🔴" : "🟢"}</span>
                          <span className="text-sm font-semibold text-slate-200">
                            {sig.label}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            = {sig.value}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-black tabular-nums ${
                            sig.points > 0 ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {sig.points > 0 ? `+${sig.points.toFixed(0)}` : "0"} pts
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 pl-6">{sig.explanation}</p>
                      {/* Contribution bar */}
                      <div className="mt-2 pl-6 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                          <div
                            className={`h-1.5 rounded-full ${sig.triggered ? "bg-red-500" : "bg-slate-600"}`}
                            style={{ width: sig.maxPoints ? `${(sig.points / sig.maxPoints) * 100}%` : "0%" }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 tabular-nums w-16 text-right">
                          max {sig.maxPoints} pts
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Formula */}
          <div className="rounded-xl bg-slate-800 p-4 text-xs font-mono text-slate-400 leading-loose">
            <div className="text-slate-300 font-semibold mb-2">Final Score Formula:</div>
            <div>
              score = browser × 0.35 + network × 0.15 + behavior × 0.25 + ml × 0.25
            </div>
            <div className="mt-1 text-slate-500">
              = {result.browser_score.toFixed(1)} × 0.35
              + {result.network_score.toFixed(1)} × 0.15
              + {result.behavior_score.toFixed(1)} × 0.25
              + {result.ml_probability.toFixed(1)} × 0.25
              {" "}= <span className={`font-bold ${riskColor}`}>{result.bot_probability.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => { setPageState("idle"); setSignals([]); setResult(null); }}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            Run Again
          </button>
        </div>
      )}
    </div>
  );
}
