// Shared list layout for the Credibility sub-pages that present a flat list
// of documents (Collaterals, Annual Reports, Social Impact Report,
// Compliances & Registrations). Mirrors the DocBlocks pattern in
// ui_kits/vyoma-org/Credibility.jsx.
export function DocBlocks({ items }) {
  const active = items.filter((item) => item.active !== false);
  return (
    <section className="bg-white px-8 py-16">
      <div className="mx-auto flex max-w-[800px] flex-col gap-4">
        {active.map((item) => (
          <div
            key={item.title}
            className="flex flex-wrap items-center justify-between gap-5 rounded-md border border-[var(--border-subtle)] border-l-[3px] border-l-amber-gold bg-white p-[20px_22px]"
          >
            <div>
              <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
              <div className="mt-1 font-sans text-[15px] text-charcoal">{item.body}</div>
            </div>
            {item.document?.url ? (
              <div className="flex gap-4">
                <a href={item.document.url} target="_blank" rel="noreferrer" className="font-sans text-[15px] font-bold text-vyoma-blue">
                  View
                </a>
                <a href={item.document.url} download className="font-sans text-[15px] font-bold text-vyoma-blue">
                  Download
                </a>
              </div>
            ) : (
              <span className="font-sans text-[13px] italic text-charcoal/50">Not uploaded yet</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
