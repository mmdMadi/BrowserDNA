"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MouseTracker, TypingTracker, ClickTracker,
  canvasFingerprint, gpuInfo, staticSignals,
  checkWebRTC, countFonts, checkChromeObj, detectStealth, checkBattery,
  gpuUAConsistency, timezoneScreenConsistency,
  webrtcFingerprint, fontFingerprintHash,
  detectStealthV2, detectSeleniumV2,
} from "@/lib/fingerprint";
import { audioFingerprint, audioFingerprintV2 } from "@/lib/audio";
import { analyze, type AnalyzeResult } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
interface Signal {
  key: string; label: string;
  category: "browser" | "behavior" | "network" | "ml";
  points: number; maxPoints: number;
  triggered: boolean; explanation: string; value: string;
}

const CAT = {
  browser:  { bg: "bg-blue-500",    text: "text-blue-400",    border: "border-blue-500/30"    },
  behavior: { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30" },
  network:  { bg: "bg-purple-500",  text: "text-purple-400",  border: "border-purple-500/30"  },
  ml:       { bg: "bg-amber-500",   text: "text-amber-400",   border: "border-amber-500/30"   },
} as const;

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  tor:         { label: "Tor Exit Node",       color: "text-red-400",    bg: "bg-red-500/15 border-red-500/40"    },
  vpn:         { label: "VPN / Anonymizer",    color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/40" },
  proxy:       { label: "Proxy",               color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/40" },
  datacenter:  { label: "Datacenter / Cloud",  color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/40"  },
  residential: { label: "Residential / ISP",   color: "text-emerald-400",bg: "bg-emerald-500/15 border-emerald-500/40" },
  unknown:     { label: "Unknown",             color: "text-slate-400",  bg: "bg-slate-700/40 border-slate-600"  },
};

const PROFILE_META: Record<string, { label: string; desc: string; color: string }> = {
  automation: { label: "Automation",    color: "text-red-400",    desc: "webdriver/stealth detected — browser evidence dominates" },
  tor:        { label: "Tor Network",   color: "text-red-400",    desc: "Tor exit node — max behavior+ML weight" },
  vpn:        { label: "VPN/Proxy",     color: "text-orange-400", desc: "VPN/proxy IP — behavior+ML amplified" },
  datacenter: { label: "Datacenter",    color: "text-amber-400",  desc: "datacenter IP — behavior+ML amplified" },
  behavioral: { label: "Behavioral",    color: "text-emerald-400",desc: "strong behavioral evidence" },
  high_browser:{ label: "High Browser",color: "text-blue-400",   desc: "high rule-based confidence" },
  base:       { label: "Balanced",      color: "text-slate-300",  desc: "default balanced weights" },
};

type PageState = "idle" | "collecting" | "done" | "error";

export default function RiskModule() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mouseRef = useRef(new MouseTracker());
  const typingRef = useRef(new TypingTracker());
  const clickRef  = useRef(new ClickTracker());
  const startTime = useRef(Date.now());

  useEffect(() => {
    mouseRef.current.start(); typingRef.current.start(); clickRef.current.start();
    return () => { mouseRef.current.stop(); typingRef.current.stop(); clickRef.current.stop(); };
  }, []);

  async function runAnalysis() {
    setPageState("collecting"); setError(null);
    try {
      const gpu = gpuInfo();
      const statics = staticSignals();
      const canvasHash = await canvasFingerprint();
      const audio = await audioFingerprint();
      const audioV2 = await audioFingerprintV2();
      const timeOnPage = (Date.now() - startTime.current) / 1000;
      const fontCount = countFonts();
      const fontHash = fontFingerprintHash();
      const batteryAvail = await checkBattery();
      const webrtcAvail = checkWebRTC();
      const webrtcFp = await webrtcFingerprint();
      const audioAvail = audio.hash !== "unavailable";
      const playwrightV2 = detectStealthV2();
      const seleniumV2 = detectSeleniumV2();
      const gpuCons = gpuUAConsistency(statics.user_agent, gpu.gpu_vendor, gpu.gpu_renderer);
      const tzCons  = timezoneScreenConsistency(statics.screen_width, statics.screen_height,
                        statics.plugins_count, audioAvail);
      const mouseEntropy = mouseRef.current.entropy();
      const typingDelay  = typingRef.current.avgDelay();
      const scrollEvents = mouseRef.current.scrollEvents();
      const clickVar     = clickRef.current.variance();
      const clickCnt     = clickRef.current.count();

      const payload = {
        name: "Lab Visitor", email: "lab@botdetector.test", reason: "research" as const,
        ...statics, gpu_vendor: gpu.gpu_vendor, gpu_renderer: gpu.gpu_renderer,
        canvas_hash: canvasHash, audio_hash: audio.hash, audio_available: audioAvail,
        webrtc_available: webrtcAvail, font_count: fontCount,
        chrome_obj_missing: checkChromeObj(), stealth_detected: detectStealth(),
        battery_available: batteryAvail, gpu_consistency: gpuCons, timezone_consistency: tzCons,
        mouse_entropy: mouseEntropy, typing_delay: typingDelay,
        scroll_events: scrollEvents, time_on_page: timeOnPage,
        click_variance: clickVar, click_count: clickCnt,
        // Phase 2
        audio_stability: audioV2.techniques.triangle_compressor > 0 ? 1.0 : 0.0,
        audio_worklet: audioV2.hash !== "unavailable",
        audio_hash_2: audioV2.v2_hash,
        webrtc_ip_leak: webrtcAvail,
        webrtc_protocol: webrtcFp.ip_policy,
        webrtc_candidate_types: webrtcFp.codecs,
        webrtc_stun_blocked: false,
        font_fingerprint_hash: fontHash,
        font_list_hash: fontHash,
        font_canvas_detected: fontCount,
        playwright_detected: playwrightV2.detected,
        playwright_artifacts: playwrightV2.checks.filter((c) => c.triggered).map((c) => c.key).join(","),
        playwright_version: "",
        selenium_detected: seleniumV2.detected,
        selenium_artifacts: seleniumV2.checks.filter((c) => c.triggered).map((c) => c.key).join(","),
        selenium_driver_version: "",
      };
      const data = await analyze(payload);
      setResult(data);
      buildSignals(data, statics, gpu, canvasHash, audioAvail, webrtcAvail, fontCount,
        gpuCons, tzCons, mouseEntropy, typingDelay, scrollEvents, timeOnPage, batteryAvail,
        audioV2, webrtcFp, fontHash, playwrightV2, seleniumV2);
      setPageState("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); setPageState("error"); }
  }

  function buildSignals(
    data: AnalyzeResult,
    statics: ReturnType<typeof staticSignals>,
    gpu: ReturnType<typeof gpuInfo>,
    canvasHash: string,
    audioAvail: boolean,
    webrtcAvail: boolean,
    fontCount: number,
    gpuCons: number,
    tzCons: number,
    mouseEntropy: number,
    typingDelay: number,
    scrollEvents: number,
    timeOnPage: number,
    batteryAvail: boolean,
    audioV2?: { v2_hash: string; techniques: { triangle_compressor: number; sine_analyser: number; square_biquad: number } },
    webrtcFp?: { ip_policy: string; ice_candidate_count: number; codecs: string },
    fontHash?: string,
    playwrightV2?: { detected: boolean; checks: Array<{ key: string; triggered: boolean }> },
    seleniumV2?: { detected: boolean; checks: Array<{ key: string; triggered: boolean }> },
  ) {
    const ua = statics.user_agent.toLowerCase();
    const headless = /headless|selenium|playwright|puppeteer|phantom/.test(ua);
    const pwTriggered = playwrightV2?.checks.filter(c => c.triggered).length ?? 0;
    const seTriggered = seleniumV2?.checks.filter(c => c.triggered).length ?? 0;
    const built: Signal[] = [
      // Browser
      { key:"webdriver",   category:"browser", label:"WebDriver Flag",         points: statics.webdriver?65:0,    maxPoints:65,  triggered:statics.webdriver,   value:String(statics.webdriver),         explanation:"navigator.webdriver=true — automation framework detected" },
      { key:"headless_ua", category:"browser", label:"Headless UA Keyword",     points: headless?30:0,             maxPoints:30,  triggered:headless,             value:ua.slice(0,50),                    explanation:"Automation keyword in User-Agent string" },
      { key:"plugins",     category:"browser", label:"Zero Plugins",            points: statics.plugins_count===0?15:0, maxPoints:15, triggered:statics.plugins_count===0, value:`${statics.plugins_count} plugins`, explanation:"Headless Chrome has 0 plugins" },
      { key:"audio",       category:"browser", label:"Audio API Blocked",       points: !audioAvail?8:0,           maxPoints:8,   triggered:!audioAvail,          value:audioAvail?"available":"blocked",  explanation:"OfflineAudioContext blocked in headless" },
      { key:"webrtc",      category:"browser", label:"WebRTC Unavailable",      points: !webrtcAvail?8:0,          maxPoints:8,   triggered:!webrtcAvail,         value:webrtcAvail?"present":"absent",    explanation:"WebRTC stripped in sandboxed environments" },
      { key:"fonts",       category:"browser", label:"Zero System Fonts",       points: fontCount===0?7:fontCount<5?4:0, maxPoints:7, triggered:fontCount<5,       value:`${fontCount} fonts`,              explanation:"No system fonts = container/headless" },
      { key:"gpu_cons",    category:"browser", label:"GPU/UA Mismatch",         points: gpuCons===0?8:0,           maxPoints:8,   triggered:gpuCons===0,          value:gpuCons===0?"mismatch":"ok",       explanation:"SwiftShader renderer on desktop UA = headless" },
      { key:"tz_cons",     category:"browser", label:"Screen Resolution Suspicious", points: tzCons===0?6:0,       maxPoints:6,   triggered:tzCons===0,           value:tzCons===0?"suspicious":"normal",  explanation:"Classic headless default resolution" },
      { key:"gpu_vendor",  category:"browser", label:"Missing GPU Vendor",      points: !gpu.gpu_vendor?5:0,       maxPoints:5,   triggered:!gpu.gpu_vendor,      value:gpu.gpu_vendor||"empty",           explanation:"No WebGL vendor info" },
      { key:"canvas",      category:"browser", label:"Canvas Fingerprint Fail", points: !canvasHash?5:0,           maxPoints:5,   triggered:!canvasHash,          value:canvasHash||"empty",               explanation:"Canvas API sandboxed" },
      { key:"battery",     category:"browser", label:"Battery API Absent",      points: !batteryAvail?4:0,         maxPoints:4,   triggered:!batteryAvail,        value:batteryAvail?"ok":"absent",        explanation:"Headless Chromium disables Battery API" },
      // Phase 2: Audio
      { key:"audio_v2",    category:"browser", label:"Audio v2 Unavailable",    points: audioV2?.v2_hash==="unavailable"?6:0, maxPoints:6, triggered:audioV2?.v2_hash==="unavailable", value:audioV2?.v2_hash?.slice(0,12)||"unavailable", explanation:"3-technique audio fingerprint blocked" },
      // Phase 2: WebRTC
      { key:"webrtc_no_ip",category:"browser", label:"WebRTC No Local IP",      points: webrtcAvail&&!webrtcFp?.ice_candidate_count?5:0, maxPoints:5, triggered:webrtcAvail&&(!webrtcFp||webrtcFp.ice_candidate_count===0), value:`${webrtcFp?.ice_candidate_count??0} ICE candidates`, explanation:"No local IP leaked via ICE — sandboxed environment" },
      { key:"font_hash",   category:"browser", label:"Font Fingerprint Empty",  points: !fontHash?7:0,             maxPoints:7,   triggered:!fontHash,            value:fontHash?.slice(0,16)||"empty",    explanation:"Font set fingerprint empty — minimal container" },
      // Phase 2: Playwright
      { key:"playwright_v2",category:"browser", label:"Playwright Deep Detection", points: playwrightV2?.detected?18:0, maxPoints:18, triggered:!!playwrightV2?.detected, value:`${pwTriggered} checks flagged`, explanation:"Performance entries, prototype chain, speech synthesis, WebGL extensions, timing" },
      // Phase 2: Selenium
      { key:"selenium_v2", category:"browser", label:"Selenium Deep Detection", points: seleniumV2?.detected?18:0,  maxPoints:18, triggered:!!seleniumV2?.detected,  value:`${seTriggered} checks flagged`,  explanation:"Navigator injection, CDP wildcard, Chrome object, iframe leak" },
      // Behavior
      { key:"mouse",       category:"behavior",label:"Low Mouse Entropy",       points: mouseEntropy<1.5?30:0,     maxPoints:30,  triggered:mouseEntropy<1.5,    value:mouseEntropy.toFixed(3),           explanation:"<1.5 entropy = no natural mouse movement" },
      { key:"typing",      category:"behavior",label:"Fast Typing (<40ms)",     points: typingDelay<40?30:0,       maxPoints:30,  triggered:typingDelay<40,      value:typingDelay>0?`${typingDelay.toFixed(0)}ms`:"no input", explanation:"Automated keystroke injection" },
      { key:"scroll",      category:"behavior",label:"No Scroll Events",        points: scrollEvents===0?20:0,     maxPoints:20,  triggered:scrollEvents===0,    value:`${scrollEvents} events`,          explanation:"Bot navigated directly to submit" },
      { key:"time",        category:"behavior",label:"Instant Submission (<3s)",points: timeOnPage>0&&timeOnPage<3?20:0, maxPoints:20, triggered:timeOnPage>0&&timeOnPage<3, value:`${timeOnPage.toFixed(1)}s`, explanation:"Submitted in under 3 seconds" },
      // Network
      { key:"network",     category:"network", label:`Network: ${data.network_tier ?? "unknown"}`, points: data.network_score, maxPoints:90, triggered:data.network_score>0, value:data.network_tier??"-", explanation:(data.network_reasons??[]).join(" | ") || "IP network classification" },
      // ML
      { key:"ml",          category:"ml",      label:"ML Ensemble Score",       points: data.ml_probability,      maxPoints:100, triggered:data.ml_probability>=40, value:`${data.ml_probability.toFixed(1)}/100`, explanation:"GradientBoosting+RandomForest ensemble (21 features)" },
    ];
    setSignals(built);
  }

  const riskColor = result
    ? result.bot_probability>=65 ? "text-red-400" : result.bot_probability>=40 ? "text-amber-400" : "text-emerald-400"
    : "text-slate-400";
  const gaugeColor = result
    ? result.bot_probability>=65 ? "bg-red-500" : result.bot_probability>=40 ? "bg-amber-500" : "bg-emerald-500"
    : "bg-slate-600";

  const byCategory = (cat: Signal["category"]) => signals.filter(s => s.category === cat);
  const catScore   = (cat: Signal["category"]) => {
    const s = byCategory(cat);
    const earned = s.reduce((a,b) => a+b.points, 0);
    const max    = s.reduce((a,b) => a+b.maxPoints, 0);
    return max ? Math.round((earned/max)*100) : 0;
  };

  const tier     = result?.network_tier ?? "unknown";
  const tierMeta = TIER_META[tier] ?? TIER_META["unknown"];
  const profile  = result?.weight_profile ?? "base";
  const profMeta = PROFILE_META[profile] ?? PROFILE_META["base"];
  const weights  = result?.weights ?? { browser:0.35, behavior:0.25, network:0.15, ml:0.25 };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">← Lab</Link>
        <h1 className="mt-2 text-2xl font-black text-white">📊 Module 5 — Risk Score Breakdown</h1>
        <p className="text-sm text-slate-400 mt-1">
          Live per-signal rule engine with Bayesian weight selection. Move your mouse, type,
          scroll, then click Analyse.
        </p>
      </div>

      {pageState === "idle" && (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-8 text-center space-y-4">
          <div className="text-5xl">🎯</div>
          <p className="text-slate-300">Move your mouse, type something, and scroll — then run the analysis.</p>
          <button onClick={runAnalysis} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
            Analyse My Browser
          </button>
        </div>
      )}

      {pageState === "collecting" && (
        <div className="flex h-32 items-center justify-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Collecting signals…
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error} <button onClick={() => setPageState("idle")} className="ml-3 underline">Try again</button>
        </div>
      )}

      {pageState === "done" && result && (
        <div className="space-y-6">
          {/* Big gauge */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Risk Score</h2>
                <p className="text-xs text-slate-400">Verdict: <span className={`font-bold ${riskColor}`}>{result.verdict}</span></p>
              </div>
              <div className={`text-5xl font-black tabular-nums ${riskColor}`}>
                {result.bot_probability.toFixed(0)}<span className="text-lg text-slate-400">/100</span>
              </div>
            </div>
            <div className="h-4 w-full rounded-full bg-slate-700 overflow-hidden">
              <div className={`h-4 rounded-full transition-all duration-1000 ${gaugeColor}`} style={{width:`${result.bot_probability}%`}}/>
            </div>

            {/* Network tier badge */}
            <div className="mt-4 flex flex-wrap gap-3">
              <div className={`rounded-lg border px-3 py-2 text-xs ${tierMeta.bg}`}>
                <span className="text-slate-400 mr-1">Network:</span>
                <span className={`font-bold ${tierMeta.color}`}>{tierMeta.label}</span>
                {(result.network_reasons ?? []).length > 0 && (
                  <span className="ml-2 text-slate-500">— {result.network_reasons![0]}</span>
                )}
              </div>
              <div className={`rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-xs`}>
                <span className="text-slate-400 mr-1">Weight Profile:</span>
                <span className={`font-bold ${profMeta.color}`}>{profMeta.label}</span>
                <span className="ml-2 text-slate-500">— {profMeta.desc}</span>
              </div>
            </div>
          </div>

          {/* Category weights — LIVE (show actual Bayesian weights) */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
              Bayesian Weight Profile: <span className={profMeta.color}>{profMeta.label}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["browser","behavior","network","ml"] as const).map(cat => {
                const c = CAT[cat];
                const w = Math.round((weights[cat] ?? 0)*100);
                const base = { browser:35, behavior:25, network:15, ml:25 }[cat];
                const diff = w - base;
                return (
                  <div key={cat} className={`rounded-lg border ${c.border} bg-slate-800/50 p-3`}>
                    <div className={`text-xs font-bold uppercase ${c.text} mb-1`}>{cat}</div>
                    <div className="text-xl font-black text-white tabular-nums">{catScore(cat)}%</div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-slate-400">weight</span>
                      <span className={`text-xs font-bold ${c.text}`}>{w}%</span>
                      {diff !== 0 && (
                        <span className={`text-xs font-mono ${diff>0?"text-red-400":"text-slate-500"}`}>
                          ({diff>0?"+":""}{diff})
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-slate-700">
                      <div className={`h-1 rounded-full ${c.bg}`} style={{width:`${catScore(cat)}%`}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Numbers in brackets show deviation from base weights (browser×35% behavior×25% network×15% ml×25%).
              Active profile: <strong className={profMeta.color}>{profMeta.label}</strong>.
            </p>
          </div>

          {/* Per-signal breakdown */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Rule Engine — Signal Breakdown</h2>
            {(["browser","behavior","network","ml"] as const).map(cat => (
              <div key={cat}>
                <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${CAT[cat].text}`}>
                  {cat} signals — weight {Math.round((weights[cat]??0)*100)}%
                </div>
                <div className="space-y-2">
                  {byCategory(cat).map(sig => (
                    <div key={sig.key}
                      className={`rounded-xl border p-3 ${sig.triggered?"border-red-500/30 bg-red-500/5":"border-slate-700/40 bg-slate-900"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{sig.triggered?"🔴":"🟢"}</span>
                          <span className="text-sm font-semibold text-slate-200 truncate">{sig.label}</span>
                          <span className="font-mono text-xs text-slate-500 shrink-0">{sig.value.slice(0,30)}</span>
                        </div>
                        <span className={`shrink-0 text-sm font-black tabular-nums ${sig.points>0?"text-red-400":"text-emerald-400"}`}>
                          {sig.points>0?`+${sig.points.toFixed(0)}`:"0"} pts
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 pl-6">{sig.explanation}</p>
                      <div className="mt-2 pl-6 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                          <div className={`h-1.5 rounded-full ${sig.triggered?"bg-red-500":"bg-slate-600"}`}
                            style={{width: sig.maxPoints?`${(sig.points/sig.maxPoints)*100}%`:"0%"}}/>
                        </div>
                        <span className="text-xs text-slate-600 tabular-nums w-16 text-right">max {sig.maxPoints}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Formula box — shows actual live weights */}
          <div className="rounded-xl bg-slate-800 p-4 text-xs font-mono text-slate-400 leading-loose">
            <div className="text-slate-300 font-semibold mb-2">
              Final Score Formula (profile: <span className={profMeta.color}>{profMeta.label}</span>):
            </div>
            <div className="text-slate-400">
              score = browser × {Math.round((weights.browser??0.35)*100)}%
              + behavior × {Math.round((weights.behavior??0.25)*100)}%
              + network × {Math.round((weights.network??0.15)*100)}%
              + ml × {Math.round((weights.ml??0.25)*100)}%
            </div>
            <div className="mt-1 text-slate-500">
              = {result.browser_score.toFixed(1)} × {(weights.browser??0.35).toFixed(2)}
              + {result.behavior_score.toFixed(1)} × {(weights.behavior??0.25).toFixed(2)}
              + {result.network_score.toFixed(1)} × {(weights.network??0.15).toFixed(2)}
              + {result.ml_probability.toFixed(1)} × {(weights.ml??0.25).toFixed(2)}
              {" "}= <span className={`font-bold ${riskColor}`}>{result.bot_probability.toFixed(2)}</span>
            </div>
            <div className="mt-2 text-slate-600 text-xs">
              * A confidence modifier is applied when ≥2 independent signal groups agree on bot classification.
            </div>
          </div>

          {/* Weight profiles reference table */}
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
              All Bayesian Weight Profiles
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="py-2 pr-4 text-slate-300">Profile</th>
                    <th className="py-2 pr-3 text-blue-400">Browser</th>
                    <th className="py-2 pr-3 text-emerald-400">Behavior</th>
                    <th className="py-2 pr-3 text-purple-400">Network</th>
                    <th className="py-2 pr-3 text-amber-400">ML</th>
                    <th className="py-2 text-slate-400">Trigger condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-400">
                  {[
                    ["automation","45%","25%","10%","20%","webdriver=true or stealth detected"],
                    ["tor",       "28%","38%", "7%","27%","Tor exit node IP"],
                    ["vpn",       "28%","35%", "8%","29%","VPN/proxy ASN"],
                    ["datacenter","28%","34%","10%","28%","Cloud/datacenter ASN"],
                    ["behavioral","30%","38%","12%","20%","behavior score ≥ 60"],
                    ["high_browser","42%","25%","12%","21%","browser score ≥ 70"],
                    ["base",      "35%","25%","15%","25%","default (residential IP, no strong signals)"],
                  ].map(([p, br, bh, nw, ml, trigger]) => (
                    <tr key={p} className={profile===p?"bg-slate-800/60 font-semibold":""}>
                      <td className={`py-1.5 pr-4 ${PROFILE_META[p as string]?.color ?? "text-slate-300"}`}>
                        {p}{profile===p?" ✓":""}
                      </td>
                      <td className="py-1.5 pr-3 text-blue-400 tabular-nums">{br}</td>
                      <td className="py-1.5 pr-3 text-emerald-400 tabular-nums">{bh}</td>
                      <td className="py-1.5 pr-3 text-purple-400 tabular-nums">{nw}</td>
                      <td className="py-1.5 pr-3 text-amber-400 tabular-nums">{ml}</td>
                      <td className="py-1.5 text-slate-500">{trigger}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={() => { setPageState("idle"); setSignals([]); setResult(null); }}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Run Again
          </button>
        </div>
      )}
    </div>
  );
}
