'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentTypeList } from '@/components/admin/content/ContentTypeList';

function ContentListContent() {
  const { apiFetch } = useAdminAuth();
  const [state, setState] = useState({ loading: true, error: null, types: [] });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/content/types')
      .then((types) => {
        // 'pages/home' now has a structured editor (Website Content -> Home)
        // — hidden here so there's exactly one place to edit it, per the CMS
        // redesign's "old editor is a fallback, not a second workflow" rule.
        if (!cancelled) setState({ loading: false, error: null, types: types.filter((t) => t !== 'pages/home') });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message, types: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  return (
    <div className="mx-auto mt-10 max-w-lg px-4">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Content</h1>
      <p className="mb-4 font-sans text-xs text-charcoal/60">
        Looking for Home? It now has its own editor under Website Content → Home.
      </p>
      {state.loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {state.error && <p className="font-sans text-sm text-red-600">{state.error}</p>}
      {!state.loading && !state.error && <ContentTypeList types={state.types} />}
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <RequireAdminAuth>
      <ContentListContent />
    </RequireAdminAuth>
  );
}
