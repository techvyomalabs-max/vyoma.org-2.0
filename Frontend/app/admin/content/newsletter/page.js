'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { NewsletterLatestForm } from '@/components/admin/cms/media/NewsletterLatestForm';
import { NewsletterArchiveForm } from '@/components/admin/cms/media/NewsletterArchiveForm';
import { NewsletterSpecialForm } from '@/components/admin/cms/media/NewsletterSpecialForm';

// Kept in sync with its bare 'media' twin — see the Testimonials page's
// comment (same seeding convention, same reason).
const TYPE = ['pages/media', 'media'];

const SECTIONS = [
  { key: 'NEWSLETTER_LATEST', label: 'Latest issue', description: 'The most recent issue, highlighted on /media/newsletter.', publicPath: '/media/newsletter', Form: NewsletterLatestForm },
  { key: 'NEWSLETTER_ARCHIVE', label: 'Archive', description: 'Past issues, grouped by year.', publicPath: '/media/newsletter', Form: NewsletterArchiveForm },
  { key: 'NEWSLETTER_SPECIAL', label: 'Special issues', description: 'One-off special issues.', publicPath: '/media/newsletter', Form: NewsletterSpecialForm },
];

function NewsletterCmsContent() {
  return <ContentEditorShell pageLabel="Newsletter" type={TYPE} sections={SECTIONS} />;
}

export default function NewsletterCmsPage() {
  return (
    <RequireAdminAuth>
      <NewsletterCmsContent />
    </RequireAdminAuth>
  );
}
