export function StatCard({ value, label }) {
  return (
    <div
      className="bg-[var(--surface-glass-inverse)] border border-[var(--border-inverse)] rounded-md p-5
        transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)]
        hover:bg-[var(--surface-glass-inverse-hover)] hover:scale-[1.06] hover:shadow-inverse-hover"
    >
      <div className="font-sans font-bold text-[28px] text-white">{value}</div>
      <div className="font-sans text-base text-[var(--text-inverse-muted)] mt-1">{label}</div>
    </div>
  );
}
