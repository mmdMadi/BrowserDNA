"use client";

import { useState } from "react";
import Link from "next/link";
import ModuleCard from "@/components/ModuleCard";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

interface LogEntry {
  ts: string;
  status: number;
  body: string;
  ms: number;
}

function useAttackLog() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const add = (entry: LogEntry) =>
    setLog((prev) => [entry, ...prev].slice(0, 20));
  const clear = () => setLog([]);
  return { log, add, clear };
}

// ── Rate Limit Demo ──────────────────────────────────────────────────────────
function RateLimitDemo() {
  const { log, add, clear } = useAttackLog();
  const [running, setRunning] = useState(false);

  async function fireOne() {
    const t0 = Date.now();
    const res = await fetch(`${API}/demo/rate-limit`);
    const body = await res.json().catch(() => ({}));
    add({
      ts: new Date().toLocaleTimeString(),
      status: res.status,
      body: JSON.stringify(body),
      ms: Date.now() - t0,
    });
  }

  async function floodFire() {
    setRunning(true);
    clear();
    for (let i = 0; i < 10; i++) {
      await fireOne();
      await new Promise((r) => setTimeout(r, 250));
    }
    setRunning(false);
  }

  const allowed = log.filter((e) => e.status === 200).length;
  const blocked = log.filter((e) => e.status === 429).length;

  return (
    <ModuleCard
      title="Rate Limiting Demo"
      description="The backend allows 5 requests per 10 seconds per IP. Fire 10 rapid requests to trigger the limit."
    >
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={fireOne}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          Single Request
        </button>
        <button
          onClick={floodFire}
          disabled={running}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
        >
          {running ? "Flooding…" : "🔥 Flood ×10"}
        </button>
        <button
          onClick={clear}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>

      {log.length > 0 && (
        <div className="flex gap-4 mb-2 text-xs">
          <span className="text-emerald-400">✓ {allowed} allowed</span>
          <span className="text-red-400">✗ {blocked} blocked (429)</span>
        </div>
      )}

      <div className="space-y-1 max-h-52 overflow-y-auto font-mono text-xs">
        {log.length === 0 && (
          <div className="text-slate-600 py-4 text-center">No requests yet</div>
        )}
        {log.map((entry, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 rounded px-2 py-1 ${
              entry.status === 429
                ? "bg-red-500/10 text-red-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}
          >
            <span className="text-slate-500 shrink-0">{entry.ts}</span>
            <span className="font-bold w-10 shrink-0">{entry.status}</span>
            <span className="truncate flex-1">{entry.body}</span>
            <span className="text-slate-500 shrink-0">{entry.ms}ms</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Defense mechanism:</strong> Sliding window counter
        (5 requests / 10s) keyed by IP. Production systems use Redis with TTL keys.
        The server returns <code className="text-amber-400">HTTP 429</code> with a{" "}
        <code className="text-amber-400">Retry-After</code> header.
      </div>
    </ModuleCard>
  );
}

// ── Honeypot Demo ────────────────────────────────────────────────────────────
function HoneypotDemo() {
  const [hp, setHp] = useState("");
  const [result, setResult] = useState<{ caught: boolean; reason: string } | null>(null);

  async function submit(fillHoneypot: boolean) {
    const res = await fetch(`${API}/demo/honeypot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User", _hp: fillHoneypot ? "bot-filled-this" : hp }),
    });
    setResult(await res.json());
  }

  return (
    <ModuleCard
      title="Honeypot Field Demo"
      description="A hidden field invisible to humans. Bots that auto-fill all fields get caught."
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Visible Name Field</label>
          <input
            readOnly
            value="Test User"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300"
          />
        </div>
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
          <label className="block text-xs text-amber-400 mb-1">
            🍯 Honeypot Field{" "}
            <span className="text-slate-500">(hidden via CSS in production — visible here for demo)</span>
          </label>
          <input
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            placeholder="Leave empty (as a human would)"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => submit(false)}
            className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
          >
            Submit as Human
          </button>
          <button
            onClick={() => submit(true)}
            className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            Simulate Bot Fill
          </button>
        </div>

        {result && (
          <div
            className={`rounded-lg p-3 text-sm font-semibold ${
              result.caught
                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {result.caught ? "🚨 Bot caught!" : "✅ Looks human!"} — {result.reason}
          </div>
        )}

        <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">How it works:</strong> The field has{" "}
          <code className="text-amber-400">display:none</code> in production. Bots using{" "}
          <code className="text-amber-400">fill_form()</code> or{" "}
          <code className="text-amber-400">querySelector()</code> fill every input regardless
          of visibility. Real users never see it, so it stays empty.
        </div>
      </div>
    </ModuleCard>
  );
}

// ── API Test ─────────────────────────────────────────────────────────────────
function ApiTest() {
  const { log, add, clear } = useAttackLog();
  const [method, setMethod] = useState("GET");
  const [endpoint, setEndpoint] = useState("/demo/rate-limit");
  const [body, setBody] = useState('{"name":"test","_hp":""}');
  const [running, setRunning] = useState(false);

  const endpoints = [
    { method: "GET", path: "/demo/rate-limit" },
    { method: "GET", path: "/demo/echo" },
    { method: "POST", path: "/demo/honeypot" },
    { method: "GET", path: "/health" },
    { method: "GET", path: "/visits?page=1&page_size=5" },
  ];

  async function fire() {
    setRunning(true);
    const t0 = Date.now();
    try {
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (method === "POST") opts.body = body;
      const res = await fetch(`${API}${endpoint}`, opts);
      const data = await res.json().catch(() => ({}));
      add({
        ts: new Date().toLocaleTimeString(),
        status: res.status,
        body: JSON.stringify(data).slice(0, 200),
        ms: Date.now() - t0,
      });
    } catch (e) {
      add({
        ts: new Date().toLocaleTimeString(),
        status: 0,
        body: String(e),
        ms: Date.now() - t0,
      });
    }
    setRunning(false);
  }

  return (
    <ModuleCard
      title="API Test Console"
      description="Send live requests to the backend API and observe the response in real time."
    >
      <div className="space-y-3">
        {/* Quick select */}
        <div>
          <div className="text-xs text-slate-500 mb-1">Quick endpoints</div>
          <div className="flex flex-wrap gap-1">
            {endpoints.map((e) => (
              <button
                key={e.path}
                onClick={() => { setMethod(e.method); setEndpoint(e.path); }}
                className={`rounded px-2 py-1 text-xs font-mono transition-colors ${
                  endpoint === e.path
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {e.method} {e.path.split("?")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Custom */}
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none w-20"
          >
            <option>GET</option>
            <option>POST</option>
          </select>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
            placeholder="/endpoint"
          />
        </div>

        {method === "POST" && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono text-white focus:border-blue-500 focus:outline-none resize-none"
            placeholder='{"key": "value"}'
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={fire}
            disabled={running}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {running ? "Sending…" : "▶ Send Request"}
          </button>
          <button
            onClick={clear}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="space-y-1 max-h-44 overflow-y-auto font-mono text-xs">
          {log.length === 0 && (
            <div className="text-slate-600 py-3 text-center">Response will appear here</div>
          )}
          {log.map((entry, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded px-2 py-1.5 ${
                entry.status >= 400 || entry.status === 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              <span className="text-slate-500 shrink-0">{entry.ts}</span>
              <span className="font-bold w-10 shrink-0">{entry.status || "ERR"}</span>
              <span className="break-all flex-1">{entry.body}</span>
              <span className="text-slate-500 shrink-0">{entry.ms}ms</span>
            </div>
          ))}
        </div>
      </div>
    </ModuleCard>
  );
}

// ── Header Inspector ─────────────────────────────────────────────────────────
function HeaderInspector() {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [ip, setIp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function inspect() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/demo/echo`);
      const data = await res.json();
      setHeaders(data.headers);
      setIp(data.ip);
    } finally {
      setLoading(false);
    }
  }

  // Highlight suspicious headers
  const suspiciousKeys = ["x-forwarded-for", "via", "proxy-connection", "x-real-ip"];

  return (
    <ModuleCard
      title="Request Header Inspector"
      description="See exactly what your browser sends to the server — same view the server has."
    >
      <button
        onClick={inspect}
        disabled={loading}
        className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50 transition-colors mb-3"
      >
        {loading ? "Fetching…" : "Inspect My Request Headers"}
      </button>

      {ip && (
        <p className="text-xs text-slate-400 mb-2">
          Detected IP:{" "}
          <span className="font-mono text-slate-200">{ip}</span>
        </p>
      )}

      {headers && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {Object.entries(headers).map(([k, v]) => {
            const isSuspicious = suspiciousKeys.includes(k.toLowerCase());
            return (
              <div key={k} className={`flex gap-2 font-mono text-xs rounded px-1 ${isSuspicious ? "bg-amber-500/10" : ""}`}>
                <span className={`shrink-0 w-44 truncate ${isSuspicious ? "text-amber-400" : "text-blue-400"}`}>
                  {k}
                  {isSuspicious && " ⚠️"}
                </span>
                <span className="text-slate-300 break-all">{v}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
        <strong className="text-slate-300">What to look for:</strong>{" "}
        <span className="text-amber-400">X-Forwarded-For</span> and{" "}
        <span className="text-amber-400">Via</span> headers indicate proxy/VPN usage —
        a bot signal. The <code className="text-slate-300">User-Agent</code> header is the first
        thing servers check for automation keywords.
      </div>
    </ModuleCard>
  );
}

// ── CAPTCHA Simulation ───────────────────────────────────────────────────────
function CaptchaSimulation() {
  const [challenge, setChallenge] = useState(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  });
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  function newChallenge() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    setChallenge({ a, b, answer: a + b });
    setInput("");
    setResult(null);
  }

  function check() {
    setAttempts((n) => n + 1);
    if (parseInt(input) === challenge.answer) {
      setResult("✅ Correct! CAPTCHA passed — request would proceed.");
    } else {
      setResult("❌ Wrong answer — request blocked.");
    }
  }

  return (
    <ModuleCard
      title="CAPTCHA Defense Demo"
      description="A math challenge that blocks automated form submission."
    >
      <div className="rounded-lg bg-slate-800 p-4 text-center mb-4">
        <p className="text-4xl font-black text-white tabular-nums tracking-widest">
          {challenge.a} + {challenge.b} = ?
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Attempts this challenge: <span className="text-slate-300 font-bold">{attempts}</span>
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          placeholder="Your answer"
        />
        <button
          onClick={check}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          Submit
        </button>
        <button
          onClick={newChallenge}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          title="New challenge"
        >
          ↺
        </button>
      </div>

      {result && (
        <p className={`mt-3 text-sm font-semibold ${result.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </p>
      )}

      <div className="mt-4 rounded-lg bg-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Why bots fail:</strong> Simple math is trivial for code,
        but real CAPTCHAs (reCAPTCHA v3, hCaptcha) combine visual puzzles{" "}
        <em>with behavioral analysis</em> — they watch mouse movement, typing, and timing
        before the user even clicks submit.
      </div>
    </ModuleCard>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AttackModule() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/lab" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Lab
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white">⚔️ Module 4 — Attack Simulation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Interactive demos of common bot attack patterns and the defenses against them.
          Each scenario lets you trigger an attack and observe the system's response in real time.
        </p>
      </div>

      {/* Defense overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { attack: "Rate Flooding", defense: "Sliding Window", color: "text-red-400" },
          { attack: "Form Bots", defense: "Honeypot Fields", color: "text-amber-400" },
          { attack: "Automation", defense: "CAPTCHA Challenges", color: "text-blue-400" },
          { attack: "Proxy/VPN", defense: "Header Analysis", color: "text-purple-400" },
        ].map((item) => (
          <div key={item.attack} className="rounded-xl border border-slate-700/60 bg-slate-900 p-3 text-center">
            <div className={`text-xs font-bold ${item.color} mb-1`}>{item.attack}</div>
            <div className="text-xs text-slate-400">→</div>
            <div className="text-xs text-slate-300 font-semibold mt-1">{item.defense}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <RateLimitDemo />
        <HoneypotDemo />
        <ApiTest />
        <HeaderInspector />
        <div className="lg:col-span-2">
          <CaptchaSimulation />
        </div>
      </div>
    </div>
  );
}
