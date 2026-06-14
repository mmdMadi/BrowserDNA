"use client";

import { useEffect, useRef, useState } from "react";
import { analyze, type AnalyzeResult } from "@/lib/api";
import {
  MouseTracker,
  TypingTracker,
  canvasFingerprint,
  gpuInfo,
  staticSignals,
} from "@/lib/fingerprint";
import ScoreBar from "@/components/ScoreBar";
import VerdictBadge from "@/components/VerdictBadge";
import Link from "next/link";

type FormState = "idle" | "loading" | "done" | "error";

export default function DetectorPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("normal");
  const [message, setMessage] = useState("");

  const [state, setState] = useState<FormState>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startTime = useRef(Date.now());
  const mouseRef = useRef<MouseTracker | null>(null);
  const typingRef = useRef<TypingTracker | null>(null);

  useEffect(() => {
    const mouse = new MouseTracker();
    const typing = new TypingTracker();
    mouse.start();
    typing.start();
    mouseRef.current = mouse;
    typingRef.current = typing;
    return () => {
      mouse.stop();
      typing.stop();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError(null);

    try {
      const gpu = gpuInfo();
      const statics = staticSignals();
      const canvasHash = await canvasFingerprint();
      const timeOnPage = (Date.now() - startTime.current) / 1000;

      const payload = {
        name,
        email,
        reason,
        ...statics,
        gpu_vendor: gpu.gpu_vendor,
        gpu_renderer: gpu.gpu_renderer,
        canvas_hash: canvasHash,
        mouse_entropy: mouseRef.current?.entropy() ?? 0,
        typing_delay: typingRef.current?.avgDelay() ?? 0,
        scroll_events: mouseRef.current?.scrollEvents() ?? 0,
        time_on_page: timeOnPage,
      };

      const data = await analyze(payload);
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  const verdictEmoji =
    result?.verdict === "BOT" ? "🤖" : result?.verdict === "SUSPICIOUS" ? "⚠️" : "✅";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ── Form ── */}
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-white">Bot Detection Lab</h1>
        <p className="mb-6 text-sm text-slate-400">
          Fill in the form — we analyse your browser fingerprint, behaviour, and network in real
          time.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-300">
              Name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-slate-300">
              Reason
            </label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="normal">Normal</option>
              <option value="research">Research</option>
              <option value="testing">Testing</option>
              <option value="automation">Automation</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="mb-1 block text-sm font-medium text-slate-300">
              Message <span className="text-slate-500">(optional — helps measure typing)</span>
            </label>
            <textarea
              id="message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Type something…"
            />
          </div>

          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state === "loading" ? "Analysing…" : "Run Detection"}
          </button>
        </form>
      </section>

      {/* ── Result ── */}
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-white">Detection Result</h2>

        {state === "idle" && (
          <div className="flex h-48 items-center justify-center text-slate-500">
            Submit the form to run detection
          </div>
        )}

        {state === "loading" && (
          <div className="flex h-48 items-center justify-center gap-3 text-slate-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Analysing fingerprint…
          </div>
        )}

        {state === "error" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {state === "done" && result && (
          <div className="space-y-6">
            {/* Verdict */}
            <div className="flex items-center gap-3">
              <span className="text-4xl">{verdictEmoji}</span>
              <div>
                <VerdictBadge verdict={result.verdict} size="lg" />
                <p className="mt-1 text-2xl font-bold text-white tabular-nums">
                  {result.bot_probability.toFixed(1)}
                  <span className="ml-1 text-sm font-normal text-slate-400">% bot probability</span>
                </p>
              </div>
            </div>

            {/* Score breakdown */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Signal Breakdown
              </h3>
              <ScoreBar label="Browser Fingerprint" value={result.browser_score} />
              <ScoreBar label="Behaviour" value={result.behavior_score} />
              <ScoreBar label="Network" value={result.network_score} />
              <ScoreBar label="ML Model" value={result.ml_probability} />
            </div>

            {/* Links */}
            <div className="flex gap-3 pt-2">
              <Link
                href={`/visit/${result.visit_id}`}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
              >
                View full report →
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
              >
                Dashboard →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
