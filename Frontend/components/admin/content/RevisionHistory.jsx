'use client';

export function RevisionHistory({ revisions, onRestore, restoring }) {
  if (!revisions.length) {
    return <p className="font-sans text-sm text-charcoal/60">No revisions yet — publish once to create the first one.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {revisions.map((r) => (
        <li
          key={r._id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5"
        >
          <div className="font-sans text-sm text-charcoal">
            <span className="font-bold">v{r.version}</span> · {r.action}
            {r.details?.restoredFromVersion != null && ` (from v${r.details.restoredFromVersion})`}
            <div className="text-xs text-charcoal/60">
              {r.publishedByEmail} · {new Date(r.createdAt).toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            disabled={restoring === r._id}
            onClick={() => onRestore(r)}
            className="rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-60"
          >
            {restoring === r._id ? 'Restoring…' : 'Restore this version'}
          </button>
        </li>
      ))}
    </ul>
  );
}
