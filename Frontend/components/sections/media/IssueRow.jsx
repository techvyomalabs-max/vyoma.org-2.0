export function IssueRow({ label, title }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-white p-[18px_20px]">
      <div>
        <div className="font-sans text-base font-bold text-vyoma-blue">{title}</div>
        <div className="mt-1 font-sans text-[13px] text-charcoal/70">{label}</div>
      </div>
      <a href="#" className="font-sans text-[15px] font-bold text-vyoma-blue">
        Download PDF ↓
      </a>
    </div>
  );
}
