'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { GalleryAlbumsForm } from '@/components/admin/cms/media/GalleryAlbumsForm';

// Kept in sync with its bare 'media' twin — see the Testimonials page's
// comment (same seeding convention, same reason).
const TYPE = ['pages/media', 'media'];

const SECTIONS = [
  { key: 'GALLERY_ALBUMS', label: 'Albums', description: 'The album list on /media/gallery.', publicPath: '/media/gallery', Form: GalleryAlbumsForm },
];

function GalleryCmsContent() {
  return <ContentEditorShell pageLabel="Gallery" type={TYPE} sections={SECTIONS} />;
}

export default function GalleryCmsPage() {
  return (
    <RequireAdminAuth>
      <GalleryCmsContent />
    </RequireAdminAuth>
  );
}
