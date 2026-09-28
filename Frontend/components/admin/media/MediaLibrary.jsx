'use client';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A deleted item's storageKey may already be gone from S3 (or S3 may not be
// configured at all yet) — the row disappearing from this list is still the
// correct signal either way, since it always reflects the metadata record.
export function MediaLibrary({ items, onDelete }) {
  if (!items.length) {
    return <p className="font-sans text-sm text-charcoal/60">No media uploaded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((m) => (
        <div key={m._id} className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] p-3">
          <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-sky-mist">
            {m.kind === 'image' && m.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.altText || m.filename} className="h-full w-full object-cover" />
            ) : (
              <span className="font-sans text-xs font-semibold uppercase text-vyoma-blue">{m.kind}</span>
            )}
          </div>
          <p className="truncate font-sans text-xs font-semibold text-charcoal" title={m.filename}>
            {m.filename}
          </p>
          <p className="font-sans text-xs text-charcoal/60">{formatSize(m.size)}</p>
          <button
            onClick={() => onDelete(m._id)}
            className="rounded-md border border-red-300 px-2 py-1 font-sans text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
