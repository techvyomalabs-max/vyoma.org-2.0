export function Card({ index, title, children }) {
  return (
    <div
      className="bg-white border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold rounded-md p-6 px-6
        transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)]
        hover:scale-[1.04] hover:shadow-hover"
    >
      <div className="font-sans font-bold text-base text-charcoal mb-3">{index}</div>
      <div className="font-sans font-bold text-h3 text-vyoma-blue mb-2">{title}</div>
      <div className="font-sans text-base leading-normal text-charcoal">{children}</div>
    </div>
  );
}
