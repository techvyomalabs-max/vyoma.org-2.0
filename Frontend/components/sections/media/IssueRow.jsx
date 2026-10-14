import { isPdfUrl, downloadUrlFor } from '@/lib/documentLinks';

// `url` is optional — absent/blank means this issue has no known PDF or
// flipbook destination (e.g. the one legacy issue with only a cover image,
// no readable document at all), so no action renders rather than a dead
// "#" link.
//
// Not every issue's `url` is a real PDF — 2 of the 12 migrated issues are
// external CDN flipbook viewer pages (index.html), which this previously
// unconditionally labeled "Download PDF ↓" even though there's no PDF to
// download. A flipbook now shows "Read online" only; a genuine PDF shows
// "Read online" (opens it) + "Download" (forced save-as, via the
// download-proxy — a plain cross-origin `download` attribute is silently
// ignored by every browser, which was the other half of this bug: even the
// 10 genuine PDFs never actually downloaded, they just reopened in a tab).
// `cover` is optional — only one legacy issue (Vol. 1, Dec 2011) has a
// verified original cover image; every other issue renders without a
// thumbnail rather than a fabricated placeholder.
export function IssueRow({ label, title, url, cover }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-white p-[18px_20px]">
      <div className="flex items-center gap-4">
        {cover?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={title} className="h-16 w-12 flex-none rounded-sm border border-[var(--border-subtle)] object-cover" />
        )}
        <div>
          <div className="font-sans text-base font-bold text-vyoma-blue">{title}</div>
          <div className="mt-1 font-sans text-[13px] text-charcoal/70">{label}</div>
        </div>
      </div>
      {url && (
        <div className="flex gap-4">
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-sans text-[15px] font-bold text-vyoma-blue">
            Read online
          </a>
          {isPdfUrl(url) && (
            <a href={downloadUrlFor(url)} className="font-sans text-[15px] font-bold text-vyoma-blue">
              Download ↓
            </a>
          )}
        </div>
      )}
    </div>
  );
}
