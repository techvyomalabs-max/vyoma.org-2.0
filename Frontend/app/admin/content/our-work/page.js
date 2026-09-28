'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const TYPE = 'pages/our-work';

function SchoolsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="name"
      newItemTemplate={{ name: '', tag: '', body: '', active: true }}
      fields={[
        { key: 'name', type: 'text', label: 'School name' },
        { key: 'tag', type: 'text', label: 'Short tag' },
        { key: 'body', type: 'textarea', label: 'Description' },
      ]}
    />
  );
}

function PlatformsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="t"
      newItemTemplate={{ n: '', t: '', d: '', u: '', ul: '', active: true }}
      fields={[
        { key: 'n', type: 'text', label: 'Short code (e.g. SFH)' },
        { key: 't', type: 'text', label: 'Title' },
        { key: 'd', type: 'textarea', label: 'Description' },
        { key: 'u', type: 'text', label: 'Link URL' },
        { key: 'ul', type: 'text', label: 'Link display text' },
      ]}
    />
  );
}

function ProgrammesForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="t"
      newItemTemplate={{ n: '', t: '', d: '', active: true }}
      fields={[
        { key: 'n', type: 'text', label: 'Short code' },
        { key: 't', type: 'text', label: 'Title' },
        { key: 'd', type: 'textarea', label: 'Description' },
      ]}
    />
  );
}

const SECTIONS = [
  { key: 'SCHOOLS', label: 'Seven Schools', description: 'The Seven Schools grid.', publicPath: '/our-work', Form: SchoolsForm },
  { key: 'CW_PLATFORMS', label: 'Platforms', description: 'The platform nodes in the Current Work diagram.', publicPath: '/our-work/current', Form: PlatformsForm },
  { key: 'CW_PROGRAMMES', label: 'Programmes', description: 'The programme nodes in the Current Work diagram.', publicPath: '/our-work/current', Form: ProgrammesForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/our-work', Form: SeoForm },
];

function OurWorkCmsContent() {
  return <ContentEditorShell pageLabel="Our Work" type={TYPE} sections={SECTIONS} />;
}

export default function OurWorkCmsPage() {
  return (
    <RequireAdminAuth>
      <OurWorkCmsContent />
    </RequireAdminAuth>
  );
}
