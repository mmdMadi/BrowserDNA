interface Props {
  label: string;
  value: React.ReactNode;
}

export default function InfoRow({ label, value }: Props) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span className="text-sm text-slate-200 break-all">
        {value ?? <span className="text-slate-500 italic">—</span>}
      </span>
    </div>
  );
}
