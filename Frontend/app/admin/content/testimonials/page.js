'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { TestimonialsFeaturedForm } from '@/components/admin/cms/media/TestimonialsFeaturedForm';
import { TestimonialsAllForm } from '@/components/admin/cms/media/TestimonialsAllForm';

// Both 'pages/media' and its bare 'media' twin are seeded from the same
// Backend/scripts/seedData/media.js module (see CONTENT_SEED in
// Backend/scripts/runSeed.js) because Frontend/services/mediaService.js
// reads the bare 'media' type while pageService.js reads 'pages/media'.
// Passing both here keeps them permanently in sync on every save/publish —
// see the multi-type support added to Frontend/lib/useContentEditor.js.
const TYPE = ['pages/media', 'media'];

const SECTIONS = [
  { key: 'TESTIMONIALS_FEATURED', label: 'Featured', description: 'The highlighted testimonials at the top of /media/testimonials.', publicPath: '/media/testimonials', Form: TestimonialsFeaturedForm },
  { key: 'TESTIMONIALS_ALL', label: 'All testimonials', description: 'The full testimonials list further down the page.', publicPath: '/media/testimonials', Form: TestimonialsAllForm },
];

function TestimonialsCmsContent() {
  return <ContentEditorShell pageLabel="Testimonials" type={TYPE} sections={SECTIONS} />;
}

export default function TestimonialsCmsPage() {
  return (
    <RequireAdminAuth>
      <TestimonialsCmsContent />
    </RequireAdminAuth>
  );
}
