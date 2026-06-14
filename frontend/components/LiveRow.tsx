interface Props {
  label: string;
  value: React.ReactNode;
  flag?: "good" | "warn" | "bad" | "neutral";
}

const flagStyles = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  neutral: "text-slate-200",
};

export default function LiveRow({ label, value, flag = "neutral" }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-700/40 py-2 last:border-0">
      <span className="shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-right text-sm font-mono break-all ${flagStyles[flag]}`}>
        {value ?? <span className="text-slate-600 italic">—</span>}
      </span>
    </div>
  );
}
