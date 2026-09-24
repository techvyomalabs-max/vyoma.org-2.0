'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const TYPE = 'pages/credibility';

function CategoryGridForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="title"
      newItemTemplate={{ title: '', body: '', cta: '', href: '', active: true }}
      fields={[
        { key: 'title', type: 'text', label: 'Category title' },
        { key: 'body', type: 'textarea', label: 'Description' },
        { key: 'cta', type: 'text', label: 'Button label' },
        { key: 'href', type: 'text', label: 'Sub-page path (e.g. /credibility/collaterals)' },
      ]}
    />
  );
}

function DocListForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="title"
      newItemTemplate={{ title: '', body: '', document: null, active: true }}
      fields={[
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'body', type: 'textarea', label: 'Description' },
        { key: 'document', type: 'document', label: 'Document (PDF, Word, or Excel)' },
      ]}
    />
  );
}

function AwardsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="title"
      newItemTemplate={{ title: '', body: '', image: null, active: true }}
      fields={[
        { key: 'title', type: 'text', label: 'Award title' },
        { key: 'body', type: 'textarea', label: 'Description' },
        { key: 'image', type: 'image', label: 'Photo' },
      ]}
    />
  );
}

const SECTIONS = [
  { key: 'CREDIBILITY_SECTIONS', label: 'Category grid', description: 'The main Credibility landing page grid.', publicPath: '/credibility', Form: CategoryGridForm },
  { key: 'COLLATERALS_ITEMS', label: 'Collaterals', description: 'Downloadable brochures/presentations.', publicPath: '/credibility/collaterals', Form: DocListForm },
  { key: 'ANNUAL_REPORTS_ITEMS', label: 'Annual Reports', description: 'Downloadable annual reports.', publicPath: '/credibility/annual-reports', Form: DocListForm },
  { key: 'SOCIAL_IMPACT_ITEMS', label: 'Social Impact Report', description: 'Downloadable social impact reports.', publicPath: '/credibility/social-impact-report', Form: DocListForm },
  { key: 'COMPLIANCES_ITEMS', label: 'Compliances & Registrations', description: 'Downloadable statutory documents.', publicPath: '/credibility/compliances-registrations', Form: DocListForm },
  { key: 'AWARDS_ITEMS', label: 'Awards & Recognition', description: 'Award cards with photos.', publicPath: '/credibility/awards-recognition', Form: AwardsForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/credibility', Form: SeoForm },
];

function CredibilityCmsContent() {
  return <ContentEditorShell pageLabel="Credibility" type={TYPE} sections={SECTIONS} />;
}

export default function CredibilityCmsPage() {
  return (
    <RequireAdminAuth>
      <CredibilityCmsContent />
    </RequireAdminAuth>
  );
}
