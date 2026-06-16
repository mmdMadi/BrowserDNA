"use client";

import { useEffect, useState } from "react";
import {
  canvasFingerprint,
  gpuInfo,
  staticSignals,
  checkWebRTC,
  countFonts,
  checkChromeObj,
  detectStealth,
  checkBattery,
  gpuUAConsistency,
  timezoneScreenConsistency,
  webgl2Fingerprint,
  getClientHints,
  webrtcLocalIP,
} from "@/lib/fingerprint";
import { audioFingerprint } from "@/lib/audio";
import ModuleCard from "@/components/ModuleCard";
import LiveRow from "@/components/LiveRow";
import Link from "next/link";

interface FingerprintData {
  user_agent: string;
  platform: string;
  language: string;
  languages: string;
  timezone: string;
  screen: string;
  color_depth: string;
  hardware_concurrency: number;
  device_memory: string;
  touch_support: boolean;
  cookie_enabled: boolean;
  do_not_track: string;
  webdriver: boolean;
  plugins_count: number;
  gpu_vendor: string;
  gpu_renderer: string;
  canvas_hash: string;
  webgl2_hash: string;
  audio_hash: string;
  audio_value: number;
  webrtc_available: boolean;
  webrtc_local_ip: string;
  font_count: number;
  chrome_obj_missing: boolean;
  stealth_detected: boolean;
  battery_available: boolean;
  gpu_consistency: number;
  timezone_consistency: number;
  client_hints_brands: string;
  client_hints_mobile: boolean | null;
  client_hints_platform: string;
  connection_type: string;
  pdf_viewer: string;
}

function ImpactBadge({ level }: { level: "high" | "medium" | "low" }) {
  const map = {
    high: "bg-red-500/15 text-red-400 border-red-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-slate-700 text-slate-400 border-slate-600",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${map[level]}`}>
      {level === "high" ? "⚡ High impact" : level === "medium" ? "~ Medium" : "· Low"}
    </span>
  );
}

export default function FingerprintModule() {
  const [data, setData] = useState<Partial<FingerprintData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function collect() {
      const statics = staticSignals();
      const gpu = gpuInfo();
      const canvas = await canvasFingerprint();
      const webgl2 = await webgl2Fingerprint();
      const audio = await audioFingerprint();
      const webrtcAvail = checkWebRTC();
      const webrtcIP = await webrtcLocalIP();
      const fontCount = countFonts();
      const chromeObjMissing = checkChromeObj();
      const stealthDetected = detectStealth();
      const batteryAvail = await checkBattery();
      const hints = getClientHints();
      const audioAvail = audio.hash !== "unavailable";

      const gpuCons = gpuUAConsistency(statics.user_agent, gpu.gpu_vendor, gpu.gpu_renderer);
      const tzCons = timezoneScreenConsistency(
        statics.screen_width, statics.screen_height,
        statics.plugins_count, audioAvail,
      );

      const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
      const connectionType = conn?.effectiveType ?? "unknown";

      let pdfViewer = "unknown";
      try {
        pdfViewer = navigator.pdfViewerEnabled ? "enabled" : "disabled";
      } catch { /* not supported */ }

      const languages = (navigator as Navigator & { languages?: string[] }).languages?.join(", ") ?? statics.language;

      setData({
        user_agent: statics.user_agent,
        platform: statics.platform,
        language: statics.language,
        languages,
        timezone: statics.timezone,
        screen: `${statics.screen_width} × ${statics.screen_height}`,
        color_depth: `${statics.color_depth}-bit`,
        hardware_concurrency: statics.hardware_concurrency,
        device_memory: statics.device_memory ? `${statics.device_memory} GB` : "not reported",
        touch_support: statics.touch_support,
        cookie_enabled: statics.cookie_enabled,
        do_not_track: statics.do_not_track ?? "unspecified",
        webdriver: statics.webdriver,
        plugins_count: statics.plugins_count,
        gpu_vendor: gpu.gpu_vendor || "unavailable",
        gpu_renderer: gpu.gpu_renderer || "unavailable",
        canvas_hash: canvas || "failed",
        webgl2_hash: webgl2,
        audio_hash: audio.hash,
        audio_value: audio.value,
        webrtc_available: webrtcAvail,
        webrtc_local_ip: webrtcIP,
        font_count: fontCount,
        chrome_obj_missing: chromeObjMissing,
        stealth_detected: stealthDetected,
        battery_available: batteryAvail,
        gpu_consistency: gpuCons,
        timezone_consistency: tzCons,
        client_hints_brands: hints.brands,
        client_hints_mobile: hints.mobile,
        client_hints_platform: hints.platform,
        connection_type: connectionType,
        pdf_viewer: pdfViewer,
      });
      setLoading(false);
    }
    collect();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-slate-500">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Collecting fingerprint data…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">🔍 Module 1 — Browser Fingerprinting</h1>
        <p className="text-sm text-slate-400 mt-1">
          Every value below is collected from your browser right now — no form submission required.
          This is exactly what a bot detection system sees the moment you load a page.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "WebDriver", value: data.webdriver ? "⚠️ TRUE" : "✓ false", bad: data.webdriver },
          { label: "Plugins", value: `${data.plugins_count ?? "?"}`, bad: data.plugins_count === 0 },
          { label: "Canvas Hash", value: data.canvas_hash?.slice(0, 8) + "…", bad: data.canvas_hash === "failed" },
          { label: "Audio Hash", value: data.audio_hash ?? "…", bad: data.audio_hash === "unavailable" },
          { label: "Stealth", value: data.stealth_detected ? "⚠️ Detected" : "✓ Clean", bad: data.stealth_detected },
          { label: "GPU OK", value: data.gpu_consistency === 0 ? "⚠️ Mismatch" : "✓ Match", bad: data.gpu_consistency === 0 },
          { label: "TZ/Screen", value: data.timezone_consistency === 0 ? "⚠️ Suspicious" : "✓ Normal", bad: data.timezone_consistency === 0 },
          { label: "Battery API", value: data.battery_available === false ? "⚠️ Absent" : "✓ Present", bad: data.battery_available === false },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border p-3 text-center ${
              item.bad ? "border-red-500/40 bg-red-500/5" : "border-slate-700/60 bg-slate-900"
            }`}
          >
            <div className="text-xs text-slate-500 mb-1">{item.label}</div>
            <div className={`text-sm font-bold font-mono ${item.bad ? "text-red-400" : "text-emerald-400"}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">

        {/* Navigator Signals */}
        <ModuleCard title="Navigator Signals" description="Properties from window.navigator — collected without permission">
          <LiveRow label="User-Agent" value={<span className="text-xs break-all">{data.user_agent}</span>} flag="neutral" />
          <LiveRow label="Platform" value={data.platform} flag="neutral" />
          <LiveRow label="Language" value={data.language} flag="neutral" />
          <LiveRow label="All Languages" value={data.languages} flag="neutral" />
          <LiveRow label="Timezone" value={data.timezone} flag="neutral" />
          <LiveRow label="Cookie Enabled" value={data.cookie_enabled ? "Yes" : "No"} flag={data.cookie_enabled ? "good" : "warn"} />
          <LiveRow label="Do Not Track" value={data.do_not_track} flag="neutral" />
          <LiveRow label="PDF Viewer" value={data.pdf_viewer} flag="neutral" />
          <LiveRow label="Connection" value={data.connection_type} flag="neutral" />
          <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Why it matters:</strong> Even without permissions, the browser
            exposes locale, timezone, and User-Agent. These form a rough geolocation and device fingerprint
            that is stable across sessions.
          </div>
        </ModuleCard>

        {/* Hardware */}
        <ModuleCard title="Hardware Signals" description="Screen, CPU, memory and input — highly device-specific">
          <LiveRow label="Screen Resolution" value={data.screen} flag="neutral" />
          <LiveRow label="Color Depth" value={data.color_depth} flag="neutral" />
          <LiveRow
            label="CPU Threads"
            value={`${data.hardware_concurrency} logical cores`}
            flag={data.hardware_concurrency === 0 ? "bad" : "good"}
          />
          <LiveRow label="Device Memory" value={data.device_memory} flag="neutral" />
          <LiveRow label="Touch Support" value={data.touch_support ? "Yes" : "No"} flag="neutral" />
          <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Why it matters:</strong> The combination of resolution,
            CPU thread count, and device memory is rare enough to uniquely identify most devices.
            Headless browsers typically report 0 or 1 CPU threads and no device memory.
          </div>
        </ModuleCard>

        {/* Bot Signals */}
        <ModuleCard title="Bot Detection Signals" description="Signals that strongly indicate automation — highest scoring">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">WebDriver Flag</span>
            <ImpactBadge level="high" />
          </div>
          <LiveRow
            label="navigator.webdriver"
            value={data.webdriver ? "TRUE ⚠️ — automation detected!" : "false ✓"}
            flag={data.webdriver ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            +45 pts to browser_score when true. The single strongest signal in the system.
          </div>

          <div className="mt-3 flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Plugin Count</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="navigator.plugins.length"
            value={`${data.plugins_count} plugins`}
            flag={data.plugins_count === 0 ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            +10 pts when 0. Real Chrome has ≥1 plugin; headless Chrome has 0.
          </div>

          <div className="mt-3 flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">GPU via WebGL</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="GPU Vendor"
            value={data.gpu_vendor}
            flag={data.gpu_vendor === "unavailable" ? "warn" : "good"}
          />
          <LiveRow
            label="GPU Renderer"
            value={<span className="text-xs break-all">{data.gpu_renderer}</span>}
            flag={data.gpu_renderer === "unavailable" ? "warn" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            +5 pts each when missing. Headless environments lack real GPU drivers.
          </div>
        </ModuleCard>

        {/* Cryptographic Fingerprints */}
        <ModuleCard title="Cryptographic Fingerprints" description="Unique per-device hashes stable across sessions">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Canvas Fingerprint</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="Canvas SHA-256 (16 chars)"
            value={<span className="font-mono">{data.canvas_hash}</span>}
            flag={data.canvas_hash === "failed" ? "warn" : "neutral"}
          />
          <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed mt-2 mb-4">
            <strong className="text-slate-300">How it works:</strong> Draws text + shapes off-screen.
            Subtle GPU rendering differences produce a unique pixel buffer. The SHA-256 of that
            buffer identifies the device/browser combination.
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Audio Fingerprint</span>
            <ImpactBadge level="low" />
          </div>
          <LiveRow
            label="Audio Hash"
            value={<span className="font-mono">{data.audio_hash}</span>}
            flag={data.audio_hash === "unavailable" ? "warn" : "neutral"}
          />
          <LiveRow
            label="Audio Sum Value"
            value={data.audio_value?.toFixed(8)}
            flag="neutral"
          />
          <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed mt-2">
            <strong className="text-slate-300">How it works:</strong> Processes a triangle wave
            oscillator through a DynamicsCompressor via OfflineAudioContext. The summed absolute
            values of the output buffer differ across audio hardware and OS. Blocked in headless environments.
          </div>
        </ModuleCard>

        {/* Advanced Bot-Detection Signals */}
        <ModuleCard title="Advanced Bot-Detection Signals" description="Signals that defeat even stealth bots — harder to fake">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">WebRTC Availability</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="WebRTC Available"
            value={data.webrtc_available === undefined ? "checking…" : data.webrtc_available ? "Yes ✓" : "No ⚠️"}
            flag={data.webrtc_available === false ? "warn" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">+8 pts when absent. Headless/sandboxed environments strip WebRTC.</div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Font Count</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="System Fonts Detected"
            value={data.font_count !== undefined ? `${data.font_count} fonts` : "counting…"}
            flag={data.font_count === 0 ? "bad" : (data.font_count ?? 999) < 5 ? "warn" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">+7 pts when 0, +4 pts when &lt;5. Headless containers have no system fonts.</div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">window.chrome Object</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="chrome obj present"
            value={data.chrome_obj_missing === undefined ? "checking…" : data.chrome_obj_missing ? "Missing ⚠️" : "Present ✓"}
            flag={data.chrome_obj_missing ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">+6 pts when missing. Authentic Chrome always exposes window.chrome.</div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Stealth CDP Detection</span>
            <ImpactBadge level="high" />
          </div>
          <LiveRow
            label="Stealth artifacts found"
            value={data.stealth_detected === undefined ? "checking…" : data.stealth_detected ? "Detected ⚠️" : "Clean ✓"}
            flag={data.stealth_detected ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">+12 pts when detected. Finds CDP variable artifacts and Playwright globals even after stealth patching.</div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Battery API</span>
            <ImpactBadge level="low" />
          </div>
          <LiveRow
            label="Battery Status API"
            value={data.battery_available === undefined ? "checking…" : data.battery_available ? "Available ✓" : "Unavailable ⚠️"}
            flag={data.battery_available === false ? "warn" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">+4 pts when unavailable. Headless Chromium disables the Battery Status API by default.</div>
        </ModuleCard>

        {/* Consistency & Client Hints */}
        <ModuleCard title="Consistency & Client Hints" description="Cross-signal consistency checks + navigator.userAgentData (Chrome 90+)">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">GPU / UA Consistency</span>
            <ImpactBadge level="high" />
          </div>
          <LiveRow
            label="GPU matches UA"
            value={data.gpu_consistency === 0 ? "Mismatch ⚠️ (SwiftShader / no GPU)" : "Consistent ✓"}
            flag={data.gpu_consistency === 0 ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            +8 pts on mismatch. SwiftShader renderer on a desktop UA = headless Chromium.
          </div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Timezone / Screen Consistency</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="Screen resolution normal"
            value={data.timezone_consistency === 0 ? "Suspicious (800×600 or 1280×720 default) ⚠️" : "Normal ✓"}
            flag={data.timezone_consistency === 0 ? "bad" : "good"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            +6 pts. Classic headless Chromium default resolutions combined with 0 plugins.
          </div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">WebRTC Local IP</span>
            <ImpactBadge level="medium" />
          </div>
          <LiveRow
            label="Local IP (via ICE)"
            value={data.webrtc_local_ip || "not extracted"}
            flag={data.webrtc_local_ip ? "neutral" : "warn"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            Real browsers leak a local RFC-1918 IP via ICE candidates. Headless sandboxes often return nothing.
          </div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">WebGL2 Fingerprint</span>
            <ImpactBadge level="low" />
          </div>
          <LiveRow
            label="WebGL2 param hash"
            value={<span className="font-mono">{data.webgl2_hash || "no-webgl2"}</span>}
            flag={data.webgl2_hash === "no-webgl2" ? "warn" : "neutral"}
          />
          <div className="my-2 text-xs text-slate-500 pl-1">
            Hashes key WebGL2 parameters (MAX_TEXTURE_SIZE, MAX_VERTEX_ATTRIBS…). More discriminating than WebGL1.
          </div>

          <div className="mt-3 flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Client Hints (navigator.userAgentData)</span>
            <ImpactBadge level="low" />
          </div>
          <LiveRow label="CH Brands" value={data.client_hints_brands || "not available"} flag="neutral" />
          <LiveRow label="CH Mobile" value={data.client_hints_mobile !== null ? String(data.client_hints_mobile) : "not available"} flag="neutral" />
          <LiveRow label="CH Platform" value={data.client_hints_platform || "not available"} flag="neutral" />
          <div className="mt-2 text-xs text-slate-500 pl-1">
            navigator.userAgentData (Chrome 90+) provides structured brand/platform info. Bots often lack or mispopulate it.
          </div>
        </ModuleCard>

      </div>

      {/* Educational summary */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">
          Score Impact Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-400">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 pr-4 font-semibold text-slate-300">Signal</th>
                <th className="text-left py-2 pr-4 font-semibold text-slate-300">Your Value</th>
                <th className="text-left py-2 pr-4 font-semibold text-slate-300">Bot Threshold</th>
                <th className="text-right py-2 font-semibold text-slate-300">Points (+)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="py-2 pr-4">navigator.webdriver</td>
                <td className={`py-2 pr-4 font-mono ${data.webdriver ? "text-red-400" : "text-emerald-400"}`}>{String(data.webdriver)}</td>
                <td className="py-2 pr-4 text-slate-500">true</td>
                <td className="py-2 text-right font-bold text-slate-200">65</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Headless UA keyword</td>
                <td className={`py-2 pr-4 font-mono ${/headless|selenium|playwright|puppeteer|phantom/.test((data.user_agent ?? "").toLowerCase()) ? "text-red-400" : "text-emerald-400"}`}>
                  {/headless|selenium|playwright|puppeteer|phantom/.test((data.user_agent ?? "").toLowerCase()) ? "detected" : "clean"}
                </td>
                <td className="py-2 pr-4 text-slate-500">headless/selenium/…</td>
                <td className="py-2 text-right font-bold text-slate-200">30</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Plugin count</td>
                <td className={`py-2 pr-4 font-mono ${data.plugins_count === 0 ? "text-red-400" : "text-emerald-400"}`}>{data.plugins_count}</td>
                <td className="py-2 pr-4 text-slate-500">0</td>
                <td className="py-2 text-right font-bold text-slate-200">15</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Stealth CDP artifacts</td>
                <td className={`py-2 pr-4 font-mono ${data.stealth_detected ? "text-red-400" : "text-emerald-400"}`}>{data.stealth_detected ? "detected" : "clean"}</td>
                <td className="py-2 pr-4 text-slate-500">CDP vars / Playwright globals</td>
                <td className="py-2 text-right font-bold text-slate-200">12</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Audio fingerprint</td>
                <td className={`py-2 pr-4 font-mono ${data.audio_hash === "unavailable" ? "text-red-400" : "text-emerald-400"}`}>{data.audio_hash === "unavailable" ? "blocked" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">unavailable</td>
                <td className="py-2 text-right font-bold text-slate-200">8</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">WebRTC available</td>
                <td className={`py-2 pr-4 font-mono ${data.webrtc_available === false ? "text-red-400" : "text-emerald-400"}`}>{data.webrtc_available === false ? "absent" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">absent</td>
                <td className="py-2 text-right font-bold text-slate-200">8</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Font count</td>
                <td className={`py-2 pr-4 font-mono ${(data.font_count ?? 999) === 0 ? "text-red-400" : (data.font_count ?? 999) < 5 ? "text-amber-400" : "text-emerald-400"}`}>{data.font_count ?? "?"}</td>
                <td className="py-2 pr-4 text-slate-500">0 fonts</td>
                <td className="py-2 text-right font-bold text-slate-200">7</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">window.chrome missing</td>
                <td className={`py-2 pr-4 font-mono ${data.chrome_obj_missing ? "text-red-400" : "text-emerald-400"}`}>{data.chrome_obj_missing ? "missing" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">missing</td>
                <td className="py-2 text-right font-bold text-slate-200">6</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">GPU vendor</td>
                <td className={`py-2 pr-4 font-mono ${!data.gpu_vendor || data.gpu_vendor === "unavailable" ? "text-red-400" : "text-emerald-400"}`}>{data.gpu_vendor === "unavailable" ? "missing" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">empty</td>
                <td className="py-2 text-right font-bold text-slate-200">5</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Canvas hash</td>
                <td className={`py-2 pr-4 font-mono ${data.canvas_hash === "failed" ? "text-red-400" : "text-emerald-400"}`}>{data.canvas_hash === "failed" ? "failed" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">empty/failed</td>
                <td className="py-2 text-right font-bold text-slate-200">5</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Battery API</td>
                <td className={`py-2 pr-4 font-mono ${data.battery_available === false ? "text-red-400" : "text-emerald-400"}`}>{data.battery_available === false ? "absent" : "present"}</td>
                <td className="py-2 pr-4 text-slate-500">absent</td>
                <td className="py-2 text-right font-bold text-slate-200">4</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          These signals contribute to <strong className="text-slate-400">browser_score</strong> (weight: 35% of final risk score).
          Max browser score = 100 pts.
        </p>
      </div>
    </div>
  );
}
