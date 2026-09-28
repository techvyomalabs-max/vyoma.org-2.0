export function TopicPill({ children }) {
  return (
    <span
      className="inline-flex px-5 py-2.5 rounded-md text-base font-semibold font-sans cursor-default
        border border-vyoma-blue/20 bg-white text-vyoma-blue
        transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)]
        hover:scale-[1.08] hover:bg-vyoma-blue hover:text-white hover:shadow-card"
    >
      {children}
    </span>
  );
}
