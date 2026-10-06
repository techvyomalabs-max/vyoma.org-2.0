// `url` is optional — absent/blank means this issue has no known PDF or
// flipbook destination (e.g. the one legacy issue with only a cover image,
// no readable document at all), so no action renders rather than a dead
// "#" link.
export function IssueRow({ label, title, url }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-white p-[18px_20px]">
      <div>
        <div className="font-sans text-base font-bold text-vyoma-blue">{title}</div>
        <div className="mt-1 font-sans text-[13px] text-charcoal/70">{label}</div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-sans text-[15px] font-bold text-vyoma-blue">
          Download PDF ↓
        </a>
      )}
    </div>
  );
}
