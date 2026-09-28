'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const TYPE = 'pages/impact';

const FIELDS = [
  { key: 'value', type: 'text', label: 'Value (e.g. 124,193)' },
  { key: 'label', type: 'text', label: 'Label' },
];

function MetricsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="label"
      newItemTemplate={{ value: '', label: '', active: true }}
      fields={FIELDS}
    />
  );
}

const SECTIONS = [
  { key: 'IMPACT', label: 'Reach at scale', description: 'The top-line impact metrics.', publicPath: '/impact', Form: MetricsForm },
  { key: 'INPUT', label: 'What we invest', description: 'Input metrics.', publicPath: '/impact', Form: MetricsForm },
  { key: 'OUTPUT', label: "What we've built", description: 'Output metrics.', publicPath: '/impact', Form: MetricsForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/impact', Form: SeoForm },
];

function ImpactCmsContent() {
  return <ContentEditorShell pageLabel="Impact" type={TYPE} sections={SECTIONS} />;
}

export default function ImpactCmsPage() {
  return (
    <RequireAdminAuth>
      <ImpactCmsContent />
    </RequireAdminAuth>
  );
}
