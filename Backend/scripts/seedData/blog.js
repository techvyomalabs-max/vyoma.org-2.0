// Phase E. Previously these 6 posts lived inside seedData/media.js as
// BLOG_POSTS/BLOG_CATEGORIES, sharing the 'blog' Content type with the rest
// of the Media landing page's mock data (see runSeed.js's old CONTENT_SEED
// mapping) even though a blog post is architecturally nothing like a single
// page's copy. Blog now has its own dedicated model (BlogPostModel) — see
// runSeed.js's seedBlogPosts(). Every field below matches exactly what was
// already public. `body` is new: no real long-form content ever existed
// before this phase (the detail page only ever rendered a hardcoded
// "being finalized" placeholder — see the old media/blog/[slug]/page.js).
// Seeding that exact same honest placeholder as the body, rather than
// inventing real copy, preserves that honesty instead of quietly writing
// fake content into what is now a real, publishable field.
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
