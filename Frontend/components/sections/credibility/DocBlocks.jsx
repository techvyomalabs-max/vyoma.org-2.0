// Shared list layout for the Credibility sub-pages that present a flat list
// of documents (Collaterals, Annual Reports, Social Impact Report,
// Compliances & Registrations). Mirrors the DocBlocks pattern in
// ui_kits/vyoma-org/Credibility.jsx.
export function DocBlocks({ items }) {
  return (
    <section className="bg-white px-8 py-16">
      <div className="mx-auto flex max-w-[800px] flex-col gap-4">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex flex-wrap items-center justify-between gap-5 rounded-md border border-[var(--border-subtle)] border-l-[3px] border-l-amber-gold bg-white p-[20px_22px]"
          >
            <div>
              <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
              <div className="mt-1 font-sans text-[15px] text-charcoal">{item.body}</div>
            </div>
            <div className="flex gap-4">
              <a href="#" className="font-sans text-[15px] font-bold text-vyoma-blue">
                View
              </a>
              <a href="#" className="font-sans text-[15px] font-bold text-vyoma-blue">
                Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
