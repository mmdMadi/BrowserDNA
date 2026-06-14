interface Props {
  verdict: string | null;
  size?: "sm" | "md" | "lg";
}

const colours: Record<string, string> = {
  HUMAN: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
  SUSPICIOUS: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  BOT: "bg-red-500/20 text-red-400 border border-red-500/40",
};

const sizes = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base font-bold",
};

export default function VerdictBadge({ verdict, size = "md" }: Props) {
  const label = verdict ?? "—";
  const cls = colours[label] ?? "bg-slate-700 text-slate-300 border border-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${cls} ${sizes[size]}`}>
      {label}
    </span>
  );
}
