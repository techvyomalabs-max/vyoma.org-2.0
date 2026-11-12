'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { TimelineForm } from '@/components/admin/cms/about/TimelineForm';
import { PhasesForm } from '@/components/admin/cms/about/PhasesForm';
import { PeopleForm } from '@/components/admin/cms/about/PeopleForm';
import { CoreTeamsForm } from '@/components/admin/cms/about/CoreTeamsForm';
import { PatronCategoriesForm } from '@/components/admin/cms/about/PatronCategoriesForm';
import { GoldenWallForm } from '@/components/admin/cms/about/GoldenWallForm';
import { PatronTestimonialGalleryForm } from '@/components/admin/cms/about/PatronTestimonialGalleryForm';
import { PatronMatchingPartnersForm } from '@/components/admin/cms/about/PatronMatchingPartnersForm';
import { ExploreMoreLinksForm } from '@/components/admin/cms/about/ExploreMoreLinksForm';

const TYPE = 'pages/about';

const SECTIONS = [
  { key: 'EXPLORE_MORE_LINKS', label: 'About: Explore more', description: 'The card grid on the About landing page.', publicPath: '/about', Form: ExploreMoreLinksForm },
  { key: 'TIMELINE_FULL', label: 'Our Story: Timeline', description: 'The year-by-year timeline.', publicPath: '/about/our-story', Form: TimelineForm },
  { key: 'PHASES', label: 'Roadmap: Phases', description: 'The phased-journey cards.', publicPath: '/about/roadmap', Form: PhasesForm },
  { key: 'BOARD', label: 'Leadership: Board', description: 'Company Management Board.', publicPath: '/about/leadership', Form: PeopleForm },
  { key: 'ADVISORS', label: 'Leadership: Advisors', description: 'Advisory Board.', publicPath: '/about/leadership', Form: PeopleForm },
  { key: 'COMMITTEE', label: 'Leadership: Committee', description: 'Executive Working Committee.', publicPath: '/about/leadership', Form: PeopleForm },
  { key: 'CORE_TEAMS', label: 'Core Team', description: 'All 14 core team groups and their people.', publicPath: '/about/core-team', Form: CoreTeamsForm },
  {
    key: 'PATRON_CATEGORIES',
    label: 'Patrons: Categories & Patrons',
    description: 'Create, rename, and reorder patron categories, and manage the named patrons within each.',
    publicPath: '/about/patrons',
    Form: PatronCategoriesForm,
  },
  { key: 'GOLDEN_WALL', label: 'Patrons: Golden Wall', description: 'The all-round supporters grid.', publicPath: '/about/patrons', Form: GoldenWallForm },
  {
    key: 'PATRON_TESTIMONIAL_GALLERY',
    label: 'Patrons: Testimonials',
    description: 'Real donor testimonial photos — "What our Patrons have to say".',
    publicPath: '/about/patrons',
    Form: PatronTestimonialGalleryForm,
  },
  {
    key: 'PATRON_MATCHING_PARTNERS',
    label: 'Patrons: Matching Patrons',
    description: 'Companies whose employee matching-gift programmes multiply donations.',
    publicPath: '/about/patrons',
    Form: PatronMatchingPartnersForm,
  },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image — applies to /about.', publicPath: '/about', Form: SeoForm },
];

function AboutCmsContent() {
  return <ContentEditorShell pageLabel="About" type={TYPE} sections={SECTIONS} />;
}

export default function AboutCmsPage() {
  return (
    <RequireAdminAuth>
      <AboutCmsContent />
    </RequireAdminAuth>
  );
}
