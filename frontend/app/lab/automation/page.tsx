"use client";

import { useEffect, useState } from "react";
import ModuleCard from "@/components/ModuleCard";
import LiveRow from "@/components/LiveRow";
import Link from "next/link";

interface AutomationCheck {
  label: string;
  key: string;
  result: boolean | string;
  botLike: boolean;
  explanation: string;
}

function runChecks(): AutomationCheck[] {
  const nav = navigator as Navigator & {
    __webdriver_evaluate?: unknown;
    __selenium_evaluate?: unknown;
    __webdriver_script_function?: unknown;
    __webdriver_script_func?: unknown;
    __webdriver_script_fn?: unknown;
    __fxdriver_evaluate?: unknown;
    __driver_unwrapped?: unknown;
    __webdriver_unwrapped?: unknown;
    __driver_evaluate?: unknown;
    __selenium_unwrapped?: unknown;
    __fxdriver_unwrapped?: unknown;
    _phantom?: unknown;
    __nightmare?: unknown;
    domAutomation?: unknown;
    domAutomationController?: unknown;
    _Selenium_IDE_Recorder?: unknown;
    callPhantom?: unknown;
  };
  const win = window as Window & {
    _phantom?: unknown;
    __nightmare?: unknown;
    callPhantom?: unknown;
    Buffer?: unknown;
    emit?: unknown;
    spawn?: unknown;
    webdriver?: unknown;
    domAutomation?: unknown;
    domAutomationController?: unknown;
  };

  const checks: AutomationCheck[] = [
    // WebDriver
    {
      label: "navigator.webdriver",
      key: "webdriver",
      result: String(navigator.webdriver),
      botLike: Boolean(navigator.webdriver),
      explanation: "Set to true by Selenium, Playwright, and most automation frameworks. The most reliable single signal.",
    },
    // Chrome headless UA check
    {
      label: "Headless in User-Agent",
      key: "headless_ua",
      result: /headless/i.test(navigator.userAgent) ? "Detected" : "Not found",
      botLike: /headless/i.test(navigator.userAgent),
      explanation: "Older headless Chrome versions included 'HeadlessChrome' in the User-Agent string.",
    },
    // Automation keywords in UA
    {
      label: "Automation UA Keywords",
      key: "auto_ua",
      result: /selenium|playwright|puppeteer|phantom|pyppeteer/i.test(navigator.userAgent) ? "Detected" : "Not found",
      botLike: /selenium|playwright|puppeteer|phantom|pyppeteer/i.test(navigator.userAgent),
      explanation: "Some frameworks inject their name into the User-Agent string.",
    },
    // Plugins
    {
      label: "Plugin Count",
      key: "plugins",
      result: `${navigator.plugins.length} plugins`,
      botLike: navigator.plugins.length === 0,
      explanation: "Real browsers have browser plugins/extensions. Headless Chrome typically has 0.",
    },
    // WebGL renderer
    {
      label: "WebGL Renderer",
      key: "webgl",
      result: (() => {
        try {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl") as WebGLRenderingContext | null;
          if (!gl) return "unavailable";
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          if (!ext) return "debug ext unavailable";
          return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "empty";
        } catch { return "error"; }
      })(),
      botLike: (() => {
        try {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl") as WebGLRenderingContext | null;
          if (!gl) return true;
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          if (!ext) return true;
          const r = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "") as string;
          return r === "" || r === "unavailable";
        } catch { return true; }
      })(),
      explanation: "Headless environments often lack real GPU drivers and return empty or generic WebGL renderer strings.",
    },
    // Notification permissions
    {
      label: "Notification Permission",
      key: "notification",
      result: (() => {
        try { return Notification.permission; } catch { return "unsupported"; }
      })(),
      botLike: (() => {
        try { return Notification.permission === "denied"; } catch { return false; }
      })(),
      explanation: "Automation tools often block notification prompts — a denied permission without user interaction is suspicious.",
    },
    // window.chrome presence
    {
      label: "window.chrome Object",
      key: "chrome_obj",
      result: typeof (window as Window & { chrome?: unknown }).chrome !== "undefined" ? "present" : "missing",
      botLike: typeof (window as Window & { chrome?: unknown }).chrome === "undefined",
      explanation: "Real Chrome always exposes window.chrome. Headless Chrome or impersonated browsers may lack it.",
    },
    // navigator properties that bots sometimes inject
    {
      label: "Selenium Properties",
      key: "selenium_props",
      result: [
        "__webdriver_evaluate", "__selenium_evaluate", "__webdriver_script_function",
        "_Selenium_IDE_Recorder", "domAutomation", "domAutomationController"
      ].some(p => p in nav) ? "Detected" : "Not found",
      botLike: [
        "__webdriver_evaluate", "__selenium_evaluate", "__webdriver_script_function",
        "_Selenium_IDE_Recorder", "domAutomation", "domAutomationController"
      ].some(p => p in nav),
      explanation: "Selenium and ChromeDriver inject specific properties into the navigator/window namespace.",
    },
    // Phantom/Nightmare
    {
      label: "PhantomJS / Nightmare",
      key: "phantom",
      result: ("_phantom" in win || "__nightmare" in win || "callPhantom" in win) ? "Detected" : "Not found",
      botLike: "_phantom" in win || "__nightmare" in win || "callPhantom" in win,
      explanation: "PhantomJS and NightmareJS leave window._phantom, callPhantom, or __nightmare globals.",
    },
    // Languages array
    {
      label: "Languages Array",
      key: "languages",
      result: (navigator as Navigator & { languages?: string[] }).languages?.length
        ? `${(navigator as Navigator & { languages?: string[] }).languages!.join(", ")}`
        : "empty",
      botLike: !((navigator as Navigator & { languages?: string[] }).languages?.length),
      explanation: "Real browsers always have navigator.languages populated. Bots often skip this.",
    },
  ];

  return checks;
}

export default function AutomationModule() {
  const [checks, setChecks] = useState<AutomationCheck[]>([]);
  const [botCount, setBotCount] = useState(0);

  useEffect(() => {
    const results = runChecks();
    setChecks(results);
    setBotCount(results.filter(c => c.botLike).length);
  }, []);

  const riskPct = checks.length ? Math.round((botCount / checks.length) * 100) : 0;
  const riskColor = riskPct >= 60 ? "text-red-400" : riskPct >= 30 ? "text-amber-400" : "text-emerald-400";
  const barColor = riskPct >= 60 ? "bg-red-500" : riskPct >= 30 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">🤖 Module 2 — Automation Detection</h1>
        <p className="text-sm text-slate-400 mt-1">
          These checks run instantly in your browser. Each one targets a specific artifact left by
          automation frameworks like Selenium, Playwright, and Puppeteer.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-300">Automation Risk</span>
          <span className={`text-2xl font-black tabular-nums ${riskColor}`}>{riskPct}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-700">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${riskPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {botCount} of {checks.length} checks flagged as bot-like
        </p>
      </div>

      {/* Check list */}
      <div className="space-y-3">
        {checks.map((check) => (
          <div
            key={check.key}
            className={`rounded-xl border p-4 ${
              check.botLike
                ? "border-red-500/40 bg-red-500/5"
                : "border-slate-700/40 bg-slate-900"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-base">{check.botLike ? "🚨" : "✅"}</span>
                <span className="font-mono text-sm font-semibold text-slate-200">{check.label}</span>
              </div>
              <span
                className={`text-sm font-mono font-bold shrink-0 ${
                  check.botLike ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {String(check.result)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 pl-7">{check.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
