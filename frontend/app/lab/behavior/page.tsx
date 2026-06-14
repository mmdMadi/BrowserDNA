"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ModuleCard from "@/components/ModuleCard";

interface BehaviorStats {
  mousePoints: number;
  mouseEntropy: number;
  avgTypingDelay: number;
  minTypingDelay: number;
  maxTypingDelay: number;
  typingVariance: number;
  scrollEvents: number;
  scrollDepthPct: number;
  clickCount: number;
  lastClickInterval: number;
  avgClickInterval: number;
  clickVariance: number;
  timeOnPage: number;
}

// Mini bar chart for click intervals
function MiniBarChart({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-slate-600">
        {label}
      </div>
    );
  }
  const max = Math.max(...values, 1);
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="flex items-end gap-px h-14 overflow-hidden">
        {values.slice(-40).map((v, i) => (
          <div
            key={i}
            className="flex-1 min-w-[4px] rounded-sm bg-blue-500/70 transition-all duration-100"
            style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
            title={`${v.toFixed(0)} ms`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>oldest</span>
        <span>newest</span>
      </div>
    </div>
  );
}

// Typing delay distribution
function TypingHistogram({ delays }: { delays: number[] }) {
  if (delays.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-slate-600">
        Type to see distribution
      </div>
    );
  }
  // Bucket into 0-50, 50-150, 150-300, 300-600, 600+
  const buckets = [0, 0, 0, 0, 0];
  delays.forEach((d) => {
    if (d < 50) buckets[0]++;
    else if (d < 150) buckets[1]++;
    else if (d < 300) buckets[2]++;
    else if (d < 600) buckets[3]++;
    else buckets[4]++;
  });
  const bucketLabels = ["<50ms", "50-150", "150-300", "300-600", "600+"];
  const bucketColors = ["bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-400", "bg-slate-500"];
  const max = Math.max(...buckets, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-1 h-14">
        {buckets.map((count, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div
              className={`w-full rounded-sm ${bucketColors[i]} transition-all duration-300`}
              style={{ height: `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {bucketLabels.map((l, i) => (
          <div key={i} className="flex-1 text-center text-xs text-slate-600">{l}</div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-1">
        🟢 150-300ms = human normal · 🔴 &lt;50ms = automation
      </p>
    </div>
  );
}

export default function BehaviorModule() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<BehaviorStats>({
    mousePoints: 0,
    mouseEntropy: 0,
    avgTypingDelay: 0,
    minTypingDelay: 0,
    maxTypingDelay: 0,
    typingVariance: 0,
    scrollEvents: 0,
    scrollDepthPct: 0,
    clickCount: 0,
    lastClickInterval: 0,
    avgClickInterval: 0,
    clickVariance: 0,
    timeOnPage: 0,
  });
  const [recentKeyDelays, setRecentKeyDelays] = useState<number[]>([]);
  const [recentClickIntervals, setRecentClickIntervals] = useState<number[]>([]);

  const mouseMoves = useRef<[number, number, number][]>([]);
  const keyDelays = useRef<number[]>([]);
  const lastKey = useRef<number | null>(null);
  const scrollCount = useRef(0);
  const maxScrollDepth = useRef(0);
  const clicks = useRef<number[]>([]);
  const startTime = useRef(Date.now());
  const animFrame = useRef<number>(0);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const moves = mouseMoves.current;
    if (moves.length < 2) return;

    for (let i = 1; i < moves.length; i++) {
      const dx = moves[i][0] - moves[i - 1][0];
      const dy = moves[i][1] - moves[i - 1][1];
      const dt = Math.max(moves[i][2] - moves[i - 1][2], 1);
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      const alpha = Math.min(0.1 + (i / moves.length) * 0.9, 1);
      const hue = Math.max(0, 220 - speed * 60);
      ctx.strokeStyle = `hsla(${hue}, 90%, 60%, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(moves[i - 1][0], moves[i - 1][1]);
      ctx.lineTo(moves[i][0], moves[i][1]);
      ctx.stroke();
    }

    // Current position dot
    const last = moves[moves.length - 1];
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.arc(last[0], last[1], 5, 0, Math.PI * 2);
    ctx.fill();

    // Click markers
    // (just a pulsing ring at last click — we track global clicks via state)
  }, []);

  const computeEntropy = useCallback(() => {
    const moves = mouseMoves.current;
    if (moves.length < 5) return 0;
    const deltas: number[] = [];
    for (let i = 1; i < moves.length; i++) {
      const dx = moves[i][0] - moves[i - 1][0];
      const dy = moves[i][1] - moves[i - 1][1];
      const dt = Math.max(moves[i][2] - moves[i - 1][2], 1);
      deltas.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
    return Math.sqrt(variance);
  }, []);

  const computeVariance = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  };

  const updateStats = useCallback(() => {
    const delays = keyDelays.current;
    const clickTimes = clicks.current;
    const clickIntervals: number[] = [];
    for (let i = 1; i < clickTimes.length; i++) {
      clickIntervals.push(clickTimes[i] - clickTimes[i - 1]);
    }

    // Scroll depth %
    const docH = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      1
    );
    const viewH = window.innerHeight;
    const scrollY = window.scrollY;
    const depth = Math.min(((scrollY + viewH) / docH) * 100, 100);
    if (depth > maxScrollDepth.current) maxScrollDepth.current = depth;

    setStats({
      mousePoints: mouseMoves.current.length,
      mouseEntropy: computeEntropy(),
      avgTypingDelay: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0,
      minTypingDelay: delays.length ? Math.min(...delays) : 0,
      maxTypingDelay: delays.length ? Math.max(...delays) : 0,
      typingVariance: computeVariance(delays),
      scrollEvents: scrollCount.current,
      scrollDepthPct: maxScrollDepth.current,
      clickCount: clicks.current.length,
      lastClickInterval: clickIntervals.length ? clickIntervals[clickIntervals.length - 1] : 0,
      avgClickInterval: clickIntervals.length
        ? clickIntervals.reduce((a, b) => a + b, 0) / clickIntervals.length
        : 0,
      clickVariance: computeVariance(clickIntervals),
      timeOnPage: (Date.now() - startTime.current) / 1000,
    });

    setRecentKeyDelays([...delays]);
    setRecentClickIntervals([...clickIntervals]);

    drawCanvas();
    animFrame.current = requestAnimationFrame(updateStats);
  }, [computeEntropy, drawCanvas]);

  useEffect(() => {
    const onGlobalMove = (e: MouseEvent) => {
      mouseMoves.current.push([e.clientX, e.clientY, Date.now()]);
      if (mouseMoves.current.length > 400) mouseMoves.current.shift();
    };
    const onKey = () => {
      const now = Date.now();
      if (lastKey.current !== null) {
        keyDelays.current.push(now - lastKey.current);
        if (keyDelays.current.length > 100) keyDelays.current.shift();
      }
      lastKey.current = now;
    };
    const onScroll = () => { scrollCount.current++; };
    const onClick = () => { clicks.current.push(Date.now()); };

    window.addEventListener("mousemove", onGlobalMove, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick, { passive: true });

    animFrame.current = requestAnimationFrame(updateStats);

    return () => {
      window.removeEventListener("mousemove", onGlobalMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click", onClick);
      cancelAnimationFrame(animFrame.current);
    };
  }, [updateStats]);

  const entropyColor =
    stats.mouseEntropy < 1.5 ? "text-red-400"
    : stats.mouseEntropy < 3 ? "text-amber-400"
    : "text-emerald-400";
  const typingColor =
    stats.avgTypingDelay === 0 ? "text-slate-500"
    : stats.avgTypingDelay < 40 ? "text-red-400"
    : stats.avgTypingDelay < 80 ? "text-amber-400"
    : "text-emerald-400";
  const entropyBarColor =
    stats.mouseEntropy < 1.5 ? "bg-red-500"
    : stats.mouseEntropy < 3 ? "bg-amber-500"
    : "bg-emerald-500";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">🖱️ Module 3 — Behavioral Analysis</h1>
        <p className="text-sm text-slate-400 mt-1">
          Move your mouse, type in the text area, scroll, and click to see your behavioral signals update in real time.
          Bots have very different patterns — zero entropy, instant typing, no scrolling.
        </p>
      </div>

      {/* Live status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Mouse Entropy",
            value: stats.mouseEntropy.toFixed(2),
            verdict: stats.mouseEntropy < 1.5 ? "BOT" : stats.mouseEntropy < 3 ? "SUSP" : "HUMAN",
            color: entropyColor,
          },
          {
            label: "Avg Typing Delay",
            value: stats.avgTypingDelay > 0 ? `${stats.avgTypingDelay.toFixed(0)}ms` : "—",
            verdict: stats.avgTypingDelay === 0 ? "—" : stats.avgTypingDelay < 40 ? "BOT" : "HUMAN",
            color: typingColor,
          },
          {
            label: "Scroll Events",
            value: String(stats.scrollEvents),
            verdict: stats.scrollEvents === 0 ? "BOT" : "HUMAN",
            color: stats.scrollEvents === 0 ? "text-red-400" : "text-emerald-400",
          },
          {
            label: "Time on Page",
            value: `${stats.timeOnPage.toFixed(1)}s`,
            verdict: stats.timeOnPage < 3 ? "SUSP" : "HUMAN",
            color: stats.timeOnPage < 3 ? "text-amber-400" : "text-emerald-400",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-700/60 bg-slate-900 p-3">
            <div className="text-xs text-slate-500 mb-1">{item.label}</div>
            <div className={`text-xl font-black tabular-nums ${item.color}`}>{item.value}</div>
            <div className={`text-xs font-bold mt-0.5 ${item.color}`}>{item.verdict}</div>
          </div>
        ))}
      </div>

      {/* Mouse canvas */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Mouse Movement Trail</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1.5 rounded bg-blue-400"></span> slow
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1.5 rounded bg-red-400"></span> fast
            </span>
            <span>Move your mouse over the canvas</span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={860}
          height={240}
          className="w-full rounded-xl bg-slate-950"
          style={{ cursor: "crosshair" }}
        />

        {/* Entropy meter */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Entropy (2D velocity variance) —
              <span className="ml-1 text-slate-500">&lt;1.5 = bot · 1.5-3 = suspicious · &gt;3 = human</span>
            </span>
            <span className={`font-black tabular-nums ${entropyColor}`}>
              {stats.mouseEntropy.toFixed(3)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${entropyBarColor}`}
              style={{ width: `${Math.min(stats.mouseEntropy * 10, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">

        {/* Typing analysis */}
        <ModuleCard title="Typing Analysis" description="Type in the box to measure your keystroke timing">
          <textarea
            placeholder="Type here to generate keystroke data…"
            className="w-full h-20 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none mb-4"
          />

          <TypingHistogram delays={recentKeyDelays} />

          <div className="mt-4 space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Average keystroke delay</span>
              <span className={`tabular-nums font-bold ${typingColor}`}>
                {stats.avgTypingDelay > 0 ? `${stats.avgTypingDelay.toFixed(0)} ms` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Std deviation (variance)</span>
              <span className="tabular-nums text-slate-200">
                {stats.typingVariance > 0 ? `±${stats.typingVariance.toFixed(0)} ms` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Min / Max</span>
              <span className="tabular-nums text-slate-200">
                {stats.minTypingDelay > 0 ? `${stats.minTypingDelay}ms / ${stats.maxTypingDelay}ms` : "—"}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Bot pattern:</strong> avg &lt;5ms, variance ≈0 (perfectly uniform).
            <br />
            <strong className="text-slate-300">Human pattern:</strong> avg 150-300ms, high variance.
          </div>
        </ModuleCard>

        {/* Click pattern */}
        <ModuleCard title="Click Pattern Analysis" description="Inter-click timing — bots click at fixed intervals">
          <div className="mb-4">
            <button
              onClick={() => {}}
              className="w-full rounded-lg border border-dashed border-slate-600 py-4 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-400 transition-colors"
            >
              Click me repeatedly to generate click data
            </button>
          </div>

          <MiniBarChart values={recentClickIntervals} label="Click intervals over time (ms)" />

          <div className="mt-4 space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Total clicks</span>
              <span className="tabular-nums text-slate-200">{stats.clickCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg click interval</span>
              <span className="tabular-nums text-slate-200">
                {stats.avgClickInterval > 0 ? `${stats.avgClickInterval.toFixed(0)} ms` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Click variance (std dev)</span>
              <span className={`tabular-nums font-bold ${stats.clickVariance < 5 && stats.clickCount > 3 ? "text-red-400" : "text-emerald-400"}`}>
                {stats.clickVariance > 0 ? `±${stats.clickVariance.toFixed(0)} ms` : "—"}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Bot pattern:</strong> fixed 100ms intervals, near-zero variance.
            <br />
            <strong className="text-slate-300">Human pattern:</strong> irregular intervals, high variance.
          </div>
        </ModuleCard>

        {/* Scroll analysis */}
        <ModuleCard title="Scroll Behavior" description="Scroll depth and event count — bots skip scrolling">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Max scroll depth reached</span>
                <span className={`font-bold tabular-nums ${stats.scrollDepthPct < 10 ? "text-red-400" : "text-emerald-400"}`}>
                  {stats.scrollDepthPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${stats.scrollDepthPct < 10 ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${stats.scrollDepthPct}%` }}
                />
              </div>
            </div>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Total scroll events</span>
                <span className={`tabular-nums font-bold ${stats.scrollEvents === 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {stats.scrollEvents}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-300">Why it matters:</strong> Real users almost always scroll
              at least once while reading a page. Bots navigate directly to the submit target.
              Zero scroll events adds +20 points to behavior_score.
            </div>
          </div>
        </ModuleCard>

        {/* Educational card */}
        <ModuleCard title="How Behavioral Scoring Works" description="Score contribution of each signal">
          <div className="space-y-3">
            {[
              {
                signal: "Mouse Entropy",
                threshold: "< 1.5",
                points: "+30",
                desc: "Variance in 2D velocity. Human movement is chaotic — bots move in straight lines or not at all.",
                color: "border-blue-500/30",
              },
              {
                signal: "Typing Delay",
                threshold: "< 40ms avg",
                points: "+30",
                desc: "Time between keydown events. Automated input fires at <1ms — physically impossible for humans.",
                color: "border-purple-500/30",
              },
              {
                signal: "Scroll Events",
                threshold: "= 0",
                points: "+20",
                desc: "Real users scroll while reading. Zero scroll events means the page was never read.",
                color: "border-emerald-500/30",
              },
              {
                signal: "Time on Page",
                threshold: "< 3s",
                points: "+20",
                desc: "Submitting within 3 seconds — bots hit the form immediately without reading.",
                color: "border-amber-500/30",
              },
            ].map((item) => (
              <div key={item.signal} className={`rounded-lg border ${item.color} bg-slate-800/50 p-3 text-xs`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-200">{item.signal}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500">{item.threshold}</span>
                    <span className="font-bold text-red-400">{item.points} pts</span>
                  </div>
                </div>
                <p className="text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            behavior_score (0–100) has weight <strong className="text-slate-400">25%</strong> in the final risk score.
          </p>
        </ModuleCard>

      </div>
    </div>
  );
}
