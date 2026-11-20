// The blue eyebrow+H1+body hero band repeats at the top of nearly every
// route in the source design system (About, Roadmap, Leadership, Our Work,
// Impact, Credibility and its sub-pages, Media and its sub-pages, Join Us
// and its sub-pages, FAQ, Contact). Extracted once here rather than
// duplicated ~25 times.
// QA Bug 9: `eyebrowSize` is an optional, explicit per-caller override (e.g.
// "text-[13px]") for this one eyebrow's font size -- never a change to the
// shared text-eyebrow token itself, which every other caller still uses
// unchanged by default. Only the specific pages whose eyebrow is one of the
// 18 headings this task was scoped to pass it.
export function PageHero({ eyebrow, eyebrowSize, pill, title, body, children, maxWidth = 'max-w-[720px]' }) {
  const paragraphs = Array.isArray(body) ? body : body ? [body] : [];
  return (
    <section className="bg-vyoma-blue px-8 py-14 text-center">
      {eyebrow && (
        <div className={`mb-3 font-sans ${eyebrowSize || 'text-eyebrow'} font-bold uppercase tracking-eyebrow text-[var(--text-inverse-muted)]`}>
          {eyebrow}
        </div>
      )}
      {pill && (
        <div className="mb-4 inline-block rounded-pill bg-amber-gold px-4 py-1.5 font-sans text-[13px] font-bold text-white">
          {pill}
        </div>
      )}
      <h1 className={`mx-auto font-sans text-h1 font-bold leading-tight text-white ${maxWidth}`}>{title}</h1>
      {paragraphs.map((p, i) => (
        <p key={i} className="mx-auto mt-4 max-w-[640px] font-sans text-lg leading-normal text-[var(--text-inverse-muted)]">
          {p}
        </p>
      ))}
      {children}
    </section>
  );
}
