import Link from 'next/link';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

export function SchemesGrid({ schemes }) {
  return (
    <section id="schemes" className="bg-sky-mist px-8 py-14">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="mb-8 text-center font-sans text-h2 font-bold text-vyoma-blue">Choose a scheme</h2>
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
          {schemes.map((s) => (
            <div
              key={s.slug}
              className="flex flex-col overflow-hidden rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white"
            >
              <div className="relative aspect-[2/1] w-full">
                <ImagePlaceholder shape="rect" caption={`${s.name} — 2:1 image`} />
              </div>
              <div className="flex flex-1 flex-col px-[22px] py-6">
                <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{s.name}</div>
                <p className="mb-[18px] flex-1 font-sans text-[15px] leading-normal text-charcoal">{s.body}</p>
                {s.note && (
                  <div className="mb-3.5 rounded-sm border border-dashed border-amber-gold bg-amber-gold/10 px-2.5 py-2 font-sans text-[13px] leading-normal text-[#9a6a00]">
                    <strong>Handoff note:</strong> {s.note}
                  </div>
                )}
                <Link
                  href={`/donate/${s.slug}`}
                  className="inline-flex items-center justify-center rounded-md border border-vyoma-blue px-[18px] py-2 font-sans text-sm font-semibold text-vyoma-blue hover:bg-vyoma-blue hover:text-white"
                >
                  Donate now
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
