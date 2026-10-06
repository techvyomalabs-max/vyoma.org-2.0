'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { EventCategoriesForm } from '@/components/admin/cms/media/EventCategoriesForm';
import { EventListForm } from '@/components/admin/cms/media/EventListForm';

// Kept in sync with its bare 'media' twin — see the Testimonials page's
// comment (same seeding convention, same reason).
const TYPE = ['pages/media', 'media'];

const SECTIONS = [
  { key: 'EVENT_CATEGORIES', label: 'Categories', description: 'The filter chips on /media/events.', publicPath: '/media/events', Form: EventCategoriesForm },
  { key: 'UPCOMING_EVENTS', label: 'Upcoming', description: 'Events not yet held.', publicPath: '/media/events', Form: EventListForm },
  { key: 'PAST_EVENTS', label: 'Past', description: 'Events already held.', publicPath: '/media/events', Form: EventListForm },
];

function EventsCmsContent() {
  return <ContentEditorShell pageLabel="Events" type={TYPE} sections={SECTIONS} />;
}

export default function EventsCmsPage() {
  return (
    <RequireAdminAuth>
      <EventsCmsContent />
    </RequireAdminAuth>
  );
}
