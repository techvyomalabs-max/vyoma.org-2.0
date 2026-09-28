'use client';

import Link from 'next/link';

export function ContentTypeList({ types }) {
  if (!types.length) {
    return <p className="font-sans text-sm text-charcoal/60">No content types found.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {types.map((type) => (
        <li key={type}>
          <Link
            href={`/admin/content/${type}`}
            className="block rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5 font-sans text-sm text-vyoma-blue hover:bg-sky-mist"
          >
            {type}
          </Link>
        </li>
      ))}
    </ul>
  );
}
