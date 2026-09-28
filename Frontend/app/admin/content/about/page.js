'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { TimelineForm } from '@/components/admin/cms/about/TimelineForm';
import { PhasesForm } from '@/components/admin/cms/about/PhasesForm';
import { PeopleForm } from '@/components/admin/cms/about/PeopleForm';
import { CoreTeamsForm } from '@/components/admin/cms/about/CoreTeamsForm';
import { PatronTiersForm } from '@/components/admin/cms/about/PatronTiersForm';
import { PatronTierRowsForm } from '@/components/admin/cms/about/PatronTierRowsForm';
import { GoldenWallForm } from '@/components/admin/cms/about/GoldenWallForm';
import { PatronTestimonialsForm } from '@/components/admin/cms/about/PatronTestimonialsForm';
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
  { key: 'PATRON_TIERS', label: 'Patrons: Tiers', description: 'The 6 patron tier cards.', publicPath: '/about/patrons', Form: PatronTiersForm },
  { key: 'PATRON_TIER_ROWS', label: 'Patrons: Named patrons', description: 'Named patrons listed per tier.', publicPath: '/about/patrons', Form: PatronTierRowsForm },
  { key: 'GOLDEN_WALL', label: 'Patrons: Golden Wall', description: 'The all-round supporters grid.', publicPath: '/about/patrons', Form: GoldenWallForm },
  { key: 'PATRON_TESTIMONIALS', label: 'Patrons: Testimonials', description: 'What our patrons have to say.', publicPath: '/about/patrons', Form: PatronTestimonialsForm },
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
