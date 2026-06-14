import Link from "next/link";

const modules = [
  {
    href: "/lab/fingerprint",
    emoji: "🔍",
    number: "01",
    title: "Browser Fingerprinting",
    desc: "Live display of User-Agent, Screen, Timezone, Languages, WebGL, Canvas & Audio fingerprints.",
    tags: ["User-Agent", "Canvas Hash", "Audio Hash", "WebGL", "GPU"],
    color: "border-blue-500/40 hover:border-blue-400",
    tagColor: "bg-blue-500/10 text-blue-400",
  },
  {
    href: "/lab/automation",
    emoji: "🤖",
    number: "02",
    title: "Automation Detection",
    desc: "Detect Selenium, Playwright, Puppeteer, headless mode, WebDriver flag and suspicious permissions.",
    tags: ["WebDriver", "Headless", "Plugins", "Phantom", "Selenium Props"],
    color: "border-purple-500/40 hover:border-purple-400",
    tagColor: "bg-purple-500/10 text-purple-400",
  },
  {
    href: "/lab/behavior",
    emoji: "🖱️",
    number: "03",
    title: "Behavioral Analysis",
    desc: "Live visualization of mouse movement entropy, typing speed, scroll pattern and click intervals.",
    tags: ["Mouse Entropy", "Typing Speed", "Scroll Pattern", "Click Timing"],
    color: "border-emerald-500/40 hover:border-emerald-400",
    tagColor: "bg-emerald-500/10 text-emerald-400",
  },
  {
    href: "/lab/attack",
    emoji: "⚔️",
    number: "04",
    title: "Attack Simulation",
    desc: "Interactive demos: form honeypot, API rate limiting, header inspection, and CAPTCHA defense.",
    tags: ["Rate Limit", "Honeypot", "CAPTCHA", "Header Inspect"],
    color: "border-amber-500/40 hover:border-amber-400",
    tagColor: "bg-amber-500/10 text-amber-400",
  },
  {
    href: "/lab/risk",
    emoji: "📊",
    number: "05",
    title: "Risk Score Breakdown",
    desc: "Educational risk score with per-signal contribution. See exactly which signal costs how many points.",
    tags: ["Score Formula", "Signal Weights", "Verdict", "ML Model"],
    color: "border-red-500/40 hover:border-red-400",
    tagColor: "bg-red-500/10 text-red-400",
  },
];

export default function LabPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-800 p-8">
        <div className="flex items-start gap-4">
          <span className="text-5xl">🧪</span>
          <div>
            <h1 className="text-3xl font-black text-white">Interactive Lab</h1>
            <p className="mt-2 text-slate-400 max-w-2xl leading-relaxed">
              An educational environment for understanding bot detection techniques.
              Each module isolates one technique so you can see exactly how it works
              and what impact it has on the final risk score. Ideal for university
              teaching — students can observe each signal live in their own browser.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["5 Modules", "Live Detection", "No Setup Required", "Educational"].map((t) => (
                <span key={t} className="rounded-full border border-slate-600 px-3 py-1 text-slate-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`group rounded-2xl border bg-slate-900 p-5 shadow transition-all duration-200 ${m.color}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl">{m.emoji}</span>
              <span className="font-mono text-xs text-slate-600">{m.number}</span>
            </div>
            <h2 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
              {m.title}
            </h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">{m.desc}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.tags.map((tag) => (
                <span key={tag} className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.tagColor}`}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-500 group-hover:text-blue-400 transition-colors">
              Open module →
            </div>
          </Link>
        ))}
      </div>

      {/* How it fits together */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-4">
          How All Modules Connect
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-blue-300">
            🔍 Fingerprint → browser_score
          </span>
          <span className="text-slate-600">+</span>
          <span className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-purple-300">
            🤖 Automation → browser_score
          </span>
          <span className="text-slate-600">+</span>
          <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-emerald-300">
            🖱️ Behavior → behavior_score
          </span>
          <span className="text-slate-600">+</span>
          <span className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-amber-300">
            🌐 Network → network_score
          </span>
          <span className="text-slate-600">+</span>
          <span className="rounded-lg bg-slate-700/50 border border-slate-600 px-3 py-1.5 text-slate-300">
            🧠 ML Model
          </span>
          <span className="text-slate-600">=</span>
          <span className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-red-300 font-bold">
            📊 Risk Score /100
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Final score = browser × 35% + behavior × 25% + ML × 25% + network × 15%.
          Module 5 shows the full formula with your live browser values.
        </p>
      </div>
    </div>
  );
}
