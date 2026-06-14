interface Props {
  label: string;
  value: number | null;
  max?: number;
}

function colour(pct: number) {
  if (pct >= 65) return "bg-red-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function ScoreBar({ label, value, max = 100 }: Props) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums">{value != null ? value.toFixed(1) : "—"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-700">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${colour(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
