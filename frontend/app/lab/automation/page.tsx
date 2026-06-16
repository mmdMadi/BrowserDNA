"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AutomationCheck {
  label: string;
  key: string;
  category: "webdriver" | "stealth" | "runtime" | "env" | "timing";
  result: string;
  botLike: boolean;
  severity: "critical" | "high" | "medium" | "low";
  explanation: string;
}

const CATEGORY_META = {
  webdriver: { label: "WebDriver / UA", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  stealth:   { label: "Stealth Detection", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  runtime:   { label: "Runtime Artifacts", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  env:       { label: "Environment", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  timing:    { label: "Timing Attacks", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
};

const SEVERITY_COLORS = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-slate-500",
};

// ---------------------------------------------------------------------------
// Run all checks synchronously (safe, no network)
// ---------------------------------------------------------------------------
function runChecks(): AutomationCheck[] {
  const checks: AutomationCheck[] = [];

  const nav = navigator as Navigator & {
    webdriver?: boolean;
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
    domAutomation?: unknown;
    domAutomationController?: unknown;
    _Selenium_IDE_Recorder?: unknown;
  };

  const win = window as Window & {
    chrome?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Array?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Promise?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Symbol?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Object?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_Proxy?: unknown;
    cdc_adoQpoasnfa76pfcZLmcfl_JSON?: unknown;
    __playwright?: unknown;
    __pw_manual?: unknown;
    __PW_inspect?: unknown;
    _playwrightWorkerIndex?: unknown;
    __puppeteer_evaluation_script__?: unknown;
    _phantom?: unknown;
    __nightmare?: unknown;
    callPhantom?: unknown;
    Buffer?: unknown;
    emit?: unknown;
    spawn?: unknown;
  };

  // ── 1. navigator.webdriver ────────────────────────────────────────────
  checks.push({
    label: "navigator.webdriver",
    key: "webdriver",
    category: "webdriver",
    severity: "critical",
    result: String(nav.webdriver),
    botLike: Boolean(nav.webdriver),
    explanation:
      "Set to true by Selenium, Playwright (without stealth), and all W3C WebDriver implementations. The most reliable single signal.",
  });

  // ── 2. webdriver prototype patch (stealth pattern) ───────────────────
  let stealthPatch = false;
  try {
    stealthPatch = nav.webdriver === undefined && "webdriver" in nav;
  } catch { /**/ }
  checks.push({
    label: "Webdriver Prototype Patch",
    key: "stealth_patch",
    category: "stealth",
    severity: "critical",
    result: stealthPatch ? "Detected (undefined + in nav)" : "Not found",
    botLike: stealthPatch,
    explanation:
      "playwright-stealth and puppeteer-extra-stealth delete webdriver from the prototype but leave a detectably undefined property. Checking `webdriver === undefined && 'webdriver' in nav` exposes this.",
  });

  // ── 3. CDP artifacts (ChromeDriver v2/v3) ─────────────────────────────
  const cdpKeys = [
    "cdc_adoQpoasnfa76pfcZLmcfl_Array",
    "cdc_adoQpoasnfa76pfcZLmcfl_Promise",
    "cdc_adoQpoasnfa76pfcZLmcfl_Symbol",
    "cdc_adoQpoasnfa76pfcZLmcfl_Object",
    "cdc_adoQpoasnfa76pfcZLmcfl_Proxy",
    "cdc_adoQpoasnfa76pfcZLmcfl_JSON",
  ] as const;
  const foundCDP = cdpKeys.filter((k) => win[k] !== undefined);
  checks.push({
    label: "ChromeDriver CDP Variables",
    key: "cdp_vars",
    category: "stealth",
    severity: "critical",
    result: foundCDP.length ? `Found: ${foundCDP.join(", ")}` : "None found",
    botLike: foundCDP.length > 0,
    explanation:
      "ChromeDriver injects `cdc_adoQpoasnfa76pfcZLmcfl_*` variables into the page context via CDP. These persist even when webdriver is patched by stealth plugins.",
  });

  // ── 4. Playwright globals ─────────────────────────────────────────────
  const pwGlobals = [
    "__playwright", "__pw_manual", "__PW_inspect", "_playwrightWorkerIndex",
    "__puppeteer_evaluation_script__",
  ].filter((k) => (win as Record<string, unknown>)[k] !== undefined);
  checks.push({
    label: "Playwright / Puppeteer Globals",
    key: "pw_globals",
    category: "stealth",
    severity: "high",
    result: pwGlobals.length ? `Found: ${pwGlobals.join(", ")}` : "None found",
    botLike: pwGlobals.length > 0,
    explanation:
      "Playwright and Puppeteer inject framework-specific globals (`__playwright`, `__pw_manual`, `_playwrightWorkerIndex`) that stealth plugins often miss.",
  });

  // ── 5. Function.prototype.toString integrity ──────────────────────────
  let toStringPatched = false;
  try {
    const fnStr = Function.prototype.toString.call(Function.prototype.toString);
    if (!fnStr.includes("[native code]")) toStringPatched = true;
    const desc = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
    if (desc?.value) {
      const s = String(desc.value);
      if (!s.includes("[native code]") && s.length > 200) toStringPatched = true;
    }
  } catch { /**/ }
  checks.push({
    label: "Function.prototype.toString Native",
    key: "fn_tostring",
    category: "stealth",
    severity: "high",
    result: toStringPatched ? "Patched (not native)" : "Native ✓",
    botLike: toStringPatched,
    explanation:
      "Stealth plugins override Function.prototype.toString to hide patches. Inspecting the toString descriptor itself reveals the wrapper when it does not contain '[native code]'.",
  });

  // ── 6. document $cdc_ property scan ──────────────────────────────────
  let docCDC = false;
  try {
    docCDC = Object.keys(document).some((k) =>
      k.startsWith("$cdc_") || k.startsWith("$chrome_asyncScriptInfo")
    );
  } catch { /**/ }
  checks.push({
    label: "document.$cdc_ Property Scan",
    key: "doc_cdc",
    category: "runtime",
    severity: "high",
    result: docCDC ? "CDP property found on document" : "Clean",
    botLike: docCDC,
    explanation:
      "Some ChromeDriver versions attach `$cdc_` prefixed properties directly to the document object — a reliable way to detect automation that survives most stealth patches.",
  });

  // ── 7. iframe webdriver leak ──────────────────────────────────────────
  let iframeWebdriver = false;
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframeWebdriver = iframe.contentWindow?.navigator?.webdriver === true;
    document.body.removeChild(iframe);
  } catch { /**/ }
  checks.push({
    label: "iframe contentWindow.webdriver",
    key: "iframe_wd",
    category: "stealth",
    severity: "high",
    result: iframeWebdriver ? "true ⚠️ (stealth missed iframe)" : "false ✓",
    botLike: iframeWebdriver,
    explanation:
      "playwright-stealth only patches the top-level window. Creating an iframe and checking its navigator.webdriver often reveals the true value that the stealth plugin forgot to patch.",
  });

  // ── 8. Headless / automation UA keywords ─────────────────────────────
  const headlessUA = /headless|selenium|playwright|puppeteer|phantom|pyppeteer|browserless/i.test(
    navigator.userAgent
  );
  checks.push({
    label: "Automation UA Keywords",
    key: "headless_ua",
    category: "webdriver",
    severity: "high",
    result: headlessUA ? `Detected in: ${navigator.userAgent.slice(0, 80)}` : "Not found",
    botLike: headlessUA,
    explanation:
      "Keywords like 'HeadlessChrome', 'Selenium', 'Playwright', or 'Puppeteer' in the User-Agent string indicate a bot that hasn't bothered to patch the UA.",
  });

  // ── 9. Plugin count ───────────────────────────────────────────────────
  checks.push({
    label: "Plugin Count",
    key: "plugins",
    category: "env",
    severity: "medium",
    result: `${navigator.plugins.length} plugins`,
    botLike: navigator.plugins.length === 0,
    explanation:
      "Real Chrome always has at least the Chrome PDF Viewer plugin. Headless Chrome has 0 plugins unless explicitly configured.",
  });

  // ── 10. WebGL renderer (SwiftShader = headless) ───────────────────────
  let glRenderer = "unavailable";
  let glBotLike = true;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        glRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "empty");
        glBotLike =
          glRenderer === "" ||
          /swiftshader|llvmpipe|softpipe|mesa offscreen/i.test(glRenderer);
      }
    }
  } catch { /**/ }
  checks.push({
    label: "WebGL Renderer",
    key: "webgl_renderer",
    category: "env",
    severity: "high",
    result: glRenderer,
    botLike: glBotLike,
    explanation:
      "Headless Chrome uses SwiftShader (Google's software rasterizer) instead of a real GPU driver. SwiftShader in the renderer string is a reliable headless indicator even without webdriver=true.",
  });

  // ── 11. window.chrome presence ────────────────────────────────────────
  const chromeMissing = typeof win.chrome === "undefined";
  checks.push({
    label: "window.chrome Object",
    key: "chrome_obj",
    category: "runtime",
    severity: "medium",
    result: chromeMissing ? "missing ⚠️" : "present ✓",
    botLike: chromeMissing,
    explanation:
      "Real Chrome always exposes the `window.chrome` object with `chrome.runtime`, `chrome.app`, etc. Its absence on a Chrome UA is a strong bot indicator.",
  });

  // ── 12. Selenium / ChromeDriver navigator properties ─────────────────
  const seleniumProps = [
    "__webdriver_evaluate", "__selenium_evaluate", "__webdriver_script_function",
    "__webdriver_script_func", "__webdriver_script_fn", "__fxdriver_evaluate",
    "__driver_unwrapped", "__webdriver_unwrapped", "__driver_evaluate",
    "__selenium_unwrapped", "__fxdriver_unwrapped",
    "domAutomation", "domAutomationController", "_Selenium_IDE_Recorder",
  ].filter((p) => p in nav);
  checks.push({
    label: "Selenium / ChromeDriver Navigator Props",
    key: "selenium_props",
    category: "runtime",
    severity: "high",
    result: seleniumProps.length ? `Found: ${seleniumProps.slice(0, 3).join(", ")}` : "None found",
    botLike: seleniumProps.length > 0,
    explanation:
      "Selenium and ChromeDriver inject `__webdriver_*`, `domAutomation`, and `__selenium_*` properties into the navigator. These are often not cleaned up by stealth plugins.",
  });

  // ── 13. PhantomJS / NightmareJS ───────────────────────────────────────
  const phantom =
    "_phantom" in win || "__nightmare" in win || "callPhantom" in win;
  checks.push({
    label: "PhantomJS / NightmareJS",
    key: "phantom",
    category: "runtime",
    severity: "medium",
    result: phantom ? "Detected" : "Not found",
    botLike: phantom,
    explanation:
      "PhantomJS and NightmareJS leave `window._phantom`, `callPhantom`, and `__nightmare` globals that are trivial to detect.",
  });

  // ── 14. navigator.languages empty ────────────────────────────────────
  const langs = (navigator as Navigator & { languages?: string[] }).languages;
  const langsEmpty = !langs || langs.length === 0;
  checks.push({
    label: "navigator.languages",
    key: "languages",
    category: "env",
    severity: "medium",
    result: langs?.join(", ") || "empty",
    botLike: langsEmpty,
    explanation:
      "Real browsers populate navigator.languages with at least one entry (e.g. ['en-US', 'en']). Bots that don't configure this leave it empty — an easy but often overlooked check.",
  });

  // ── 15. Notification permission pre-denied ────────────────────────────
  let notifDenied = false;
  try {
    notifDenied =
      typeof Notification !== "undefined" &&
      Notification.permission === "denied" &&
      !nav.webdriver;
  } catch { /**/ }
  checks.push({
    label: "Notification Permission Pre-Denied",
    key: "notif_denied",
    category: "stealth",
    severity: "medium",
    result: (() => {
      try { return Notification.permission; } catch { return "unsupported"; }
    })(),
    botLike: notifDenied,
    explanation:
      "Automation tools pre-deny notification permissions to block popups. When `webdriver` is patched to false but notifications are already denied, it suggests stealth mode is active.",
  });

  // ── 16. Error stack format ────────────────────────────────────────────
  let badStack = false;
  try {
    const s = new Error().stack ?? "";
    badStack = s.length > 0 && !s.includes("at ");
  } catch { /**/ }
  checks.push({
    label: "Error Stack Format",
    key: "error_stack",
    category: "timing",
    severity: "low",
    result: badStack ? "Abnormal format ⚠️" : "Normal V8 format ✓",
    botLike: badStack,
    explanation:
      "Real V8 / Chrome always produces Error().stack entries with 'at FunctionName (file:line:col)' format. Some headless environments or Node.js runtime leaks produce a different format.",
  });

  return checks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AutomationModule() {
  const [checks, setChecks] = useState<AutomationCheck[]>([]);

  useEffect(() => {
    setChecks(runChecks());
  }, []);

  const botCount = checks.filter((c) => c.botLike).length;
  const riskPct = checks.length ? Math.round((botCount / checks.length) * 100) : 0;
  const riskColor =
    riskPct >= 60 ? "text-red-400" : riskPct >= 30 ? "text-amber-400" : "text-emerald-400";
  const barColor =
    riskPct >= 60 ? "bg-red-500" : riskPct >= 30 ? "bg-amber-500" : "bg-emerald-500";

  const categories = ["webdriver", "stealth", "runtime", "env", "timing"] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">🤖 Module 2 — Automation Detection</h1>
        <p className="text-sm text-slate-400 mt-1">
          16 checks targeting specific artifacts left by Selenium, Playwright (including stealth
          mode), Puppeteer, ChromeDriver, and PhantomJS. Checks are grouped by detection category.
        </p>
      </div>

      {/* Summary bar */}
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

        {/* Category mini-badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            const catChecks = checks.filter((c) => c.category === cat);
            const flagged = catChecks.filter((c) => c.botLike).length;
            return (
              <div key={cat} className={`rounded-lg border px-3 py-1.5 text-xs ${meta.border} ${meta.bg}`}>
                <span className={`font-bold ${meta.color}`}>{meta.label}</span>
                <span className="ml-2 text-slate-400">{flagged}/{catChecks.length}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checks grouped by category */}
      {categories.map((cat) => {
        const catChecks = checks.filter((c) => c.category === cat);
        if (!catChecks.length) return null;
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat}>
            <h2 className={`text-xs font-bold uppercase tracking-wide mb-2 ${meta.color}`}>
              {meta.label}
            </h2>
            <div className="space-y-2">
              {catChecks.map((check) => (
                <div
                  key={check.key}
                  className={`rounded-xl border p-4 ${
                    check.botLike
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-slate-700/40 bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-base shrink-0">{check.botLike ? "🚨" : "✅"}</span>
                      <span className="font-mono text-sm font-semibold text-slate-200 truncate">
                        {check.label}
                      </span>
                      {/* Severity badge */}
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${SEVERITY_COLORS[check.severity]}`}
                      >
                        {check.severity}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold shrink-0 max-w-[200px] text-right truncate ${
                        check.botLike ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {String(check.result)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 pl-7 leading-relaxed">
                    {check.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Educational note on stealth evasion */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
          Why Simple Checks Aren't Enough
        </h2>
        <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
          <p>
            <strong className="text-slate-300">playwright-stealth / puppeteer-extra-stealth</strong> patch
            the most obvious signals: they set <code className="text-amber-400">navigator.webdriver = false</code>,
            fake <code className="text-amber-400">navigator.plugins</code>, and spoof
            <code className="text-amber-400"> window.chrome</code>. A basic webdriver check alone will miss these.
          </p>
          <p>
            <strong className="text-slate-300">Multi-layer detection</strong> is required:
            checks 2 (prototype leak), 3 (CDP vars), 4 (PW globals), 5 (toString patch),
            and 7 (iframe leak) all target residual artifacts that stealth plugins typically miss.
          </p>
          <p>
            <strong className="text-slate-300">The iframe trick (check 7)</strong> is particularly
            effective: stealth patches only the top-level window. A freshly created iframe inherits
            the real, unpatched <code className="text-amber-400">navigator.webdriver = true</code>.
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { bot: "Selenium/WebDriver", bypass: "webdriver=true" },
              { bot: "Playwright default", bypass: "webdriver=true + CDP vars" },
              { bot: "Playwright + stealth", bypass: "iframe leak + CDP vars + toString" },
              { bot: "Puppeteer + extra-stealth", bypass: "iframe leak + fn.toString" },
            ].map((item) => (
              <div key={item.bot} className="rounded-lg bg-slate-800 p-2">
                <div className="text-xs font-bold text-red-400 mb-1">{item.bot}</div>
                <div className="text-xs text-slate-400">Detected by: {item.bypass}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
