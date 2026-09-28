// Byte-identical mirror of Backend/scripts/seedData/blog.js — see that
// file's header comment. Used by services/blogService.js's mock-mode
// fallback (NEXT_PUBLIC_API_BASE_URL unset) and by app/sitemap.js.
export const BLOG_CATEGORIES = ['Stories', 'Research', 'Teaching', 'Camps', 'Community'];

const PLACEHOLDER_BODY = '<p>Full post content is being finalized and will appear here soon.</p>';

export const BLOG_POSTS = [
  {
    slug: 'how-the-pancatantra-teaches-without-teaching',
    categories: ['Stories'],
    title: 'How the Pañcatantra Teaches Without Teaching',
    excerpt: 'How a scholar taught three careless princes everything, without teaching a single lesson.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-08-15'),
  },
  {
    slug: 'what-a-decade-of-sanskrit-camps-taught-us-about-retention',
    categories: ['Research'],
    title: 'What a Decade of Sanskrit Camps Taught Us About Retention',
    excerpt: 'Patterns across ten years of summer camps that shaped how we design new programs.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-08-02'),
  },
  {
    slug: 'grammar-as-play-rethinking-the-first-lesson',
    categories: ['Teaching'],
    title: 'Grammar as Play: Rethinking the First Lesson',
    excerpt: 'Why the first class matters more than the syllabus, and what we changed because of it.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-07-22'),
  },
  {
    slug: 'inside-a-village-sanskrit-camp-a-week-in-photos',
    categories: ['Camps'],
    title: 'Inside a Village Sanskrit Camp: A Week in Photos',
    excerpt: 'A field diary from a week-long residential camp in rural Karnataka.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-07-10'),
  },
  {
    slug: 'why-volunteers-keep-coming-back',
    categories: ['Community'],
    title: 'Why Volunteers Keep Coming Back',
    excerpt: 'Conversations with long-time volunteers about what keeps them involved year after year.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-06-28'),
  },
  {
    slug: 'the-grandmother-who-learned-sanskrit-at-71',
    categories: ['Stories'],
    title: 'The Grandmother Who Learned Sanskrit at 71',
    excerpt: 'A late-in-life learner’s reasons for starting, and what she found along the way.',
    body: PLACEHOLDER_BODY,
    author: 'Vyoma',
    publishedAt: new Date('2026-06-14'),
  },
];
