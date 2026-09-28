'use client';

// Generic admin list table — columns: [{key, label, render?(row)}], rows: array,
// rowKey(row) => unique key. Reused by every future paginated admin list
// (Users, Donations, Audit Logs, Redirects, Blog) instead of each page
// hand-rolling its own <table>.
export function Table({ columns, rows, rowKey, onRowClick }) {
  if (!rows.length) return null; // caller renders its own empty state via StateBlock

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
      <table className="w-full min-w-[600px] border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-sky-mist/50">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-charcoal/60">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-[var(--border-subtle)] last:border-0 ${
                onRowClick ? 'cursor-pointer hover:bg-sky-mist/40' : ''
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-charcoal">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
