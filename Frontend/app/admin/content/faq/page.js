'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { FaqGroupsForm } from '@/components/admin/cms/faq/FaqGroupsForm';

const TYPE = 'pages/faq';

const SECTIONS = [
  { key: 'FAQ_GROUPS', label: 'FAQ groups', description: 'All FAQ groups and questions, in order.', publicPath: '/faq', Form: FaqGroupsForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/faq', Form: SeoForm },
];

function FaqCmsContent() {
  return <ContentEditorShell pageLabel="FAQ" type={TYPE} sections={SECTIONS} />;
}

export default function FaqCmsPage() {
  return (
    <RequireAdminAuth>
      <FaqCmsContent />
    </RequireAdminAuth>
  );
}
