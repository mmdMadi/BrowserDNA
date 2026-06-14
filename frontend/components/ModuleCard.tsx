interface Props {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export default function ModuleCard({ title, description, children }: Props) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-5 shadow-xl">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-slate-400">{description}</p>
      <div>{children}</div>
    </div>
  );
}
