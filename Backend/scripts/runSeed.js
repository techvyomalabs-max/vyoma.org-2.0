import { ContentModel } from '../src/modules/content/content.model.js';
import { DonationSchemeModel } from '../src/modules/donations/donationScheme.model.js';
import { SiteSettingsModel } from '../src/modules/settings/setting.model.js';
import { BlogPostModel } from '../src/modules/blog/blogPost.model.js';
import { BlogCategoryModel } from '../src/modules/blog/blogCategory.model.js';

import * as home from './seedData/home.js';
import * as about from './seedData/about.js';
import * as ourWork from './seedData/ourWork.js';
import * as impact from './seedData/impact.js';
import * as credibility from './seedData/credibility.js';
import * as joinUs from './seedData/joinUs.js';
import * as donate from './seedData/donate.js';
import * as faq from './seedData/faq.js';
import * as contact from './seedData/contact.js';
import * as media from './seedData/media.js';
import * as blog from './seedData/blog.js';

// One Content document per `type` key the frontend's service layer actually
// requests (Frontend/services/pageService.js, mediaService.js). "media" and
// "pages/media" both point at the same underlying media.js dataset, exactly
// matching how the mock loader today returns the whole module namespace
// regardless of which type was asked for. Blog is no longer part of this —
// see seedBlogPosts() below; it has its own dedicated model (Phase E).
const CONTENT_SEED = {
  'pages/home': home,
  'pages/about': about,
  'pages/our-work': ourWork,
  'pages/impact': impact,
  'pages/credibility': credibility,
  'pages/join-us': joinUs,
  'pages/donate': donate,
  'pages/faq': faq,
  'pages/contact': contact,
  'pages/media': media,
  media: media,
};

function withImageUrl(people) {
  return people.map((p) => ({ ...p, imageUrl: p.imageUrl ?? '' }));
}

// BOARD/ADVISORS/COMMITTEE/CORE_TEAMS[].people all share the same
// { name, role, bio? } shape but never had a photo field — the public page
// rendered a hardcoded placeholder for every person regardless. Normalizing
// `imageUrl` onto every person here (rather than hand-editing ~80 literals in
// seedData/about.js) makes it a real, editable field: the admin Content
// editor (ContentEditor.jsx) shows a text input for any key that exists on an
// object, so this alone is what makes "add an image" possible from the admin
// UI at all.
function normalizeAbout(mod) {
  return {
    ...mod,
    BOARD: withImageUrl(mod.BOARD),
    ADVISORS: withImageUrl(mod.ADVISORS),
    COMMITTEE: withImageUrl(mod.COMMITTEE),
    CORE_TEAMS: mod.CORE_TEAMS.map((group) => ({ ...group, people: withImageUrl(group.people) })),
  };
}

// Phase D: DonationSchemeModel is now the sole source of truth for scheme
// identity/content — DONATION_SCHEMES is no longer part of the pages/donate
// Content document's data (see seedData/donate.js's header comment). Strip
// it out of the module spread before it becomes Content `data`, so nothing
// re-introduces the fork by accident.
function withoutDonationSchemes(mod) {
  const { DONATION_SCHEMES, ...pageCopy } = mod;
  return pageCopy;
}

// Phase E: seeds the dedicated BlogCategoryModel (the managed list an admin
// can rename from later) and BlogPostModel (each post upserted by slug, so
// re-seeding never duplicates or reactivates a post an admin has since
// unpublished — `status`/`publishedAt` are only ever set via $setOnInsert).
async function seedBlogCategories() {
  for (const name of blog.BLOG_CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    await BlogCategoryModel.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
  }
}

async function seedBlogPosts() {
  for (const p of blog.BLOG_POSTS) {
    const data = { title: p.title, excerpt: p.excerpt, body: p.body, featuredImage: null, author: p.author, categories: p.categories, tags: [], seo: {} };
    // eslint-disable-next-line no-await-in-loop
    await BlogPostModel.findOneAndUpdate(
      { slug: p.slug },
      { $set: { slug: p.slug, data }, $setOnInsert: { status: 'published', publishedAt: p.publishedAt, draftData: null } },
      { upsert: true, new: true }
    );
  }
}

// Shared by the CLI `npm run seed` entrypoint (always upserts, for a real
// persistent MongoDB) and the server's own startup (auto-seeds only when the
// in-memory dev fallback boots empty — see server.js).
export async function runSeed() {
  for (const [type, mod] of Object.entries(CONTENT_SEED)) {
    let data = type === 'pages/about' ? normalizeAbout(mod) : { ...mod };
    if (type === 'pages/donate') data = withoutDonationSchemes(data);
    await ContentModel.findOneAndUpdate({ type }, { type, data }, { upsert: true, new: true });
  }

  // Array index becomes each scheme's initial displayOrder — preserves the
  // exact pre-migration visible order (see donationScheme.model.js). Using
  // upsert (not insert) means existing records keep their _id/createdAt;
  // only the fields listed here are ever touched by seeding, and `status`
  // is upserted to 'active' only on first creation via $setOnInsert, so a
  // scheme an admin has since archived is never silently reactivated by a
  // reseed/restart.
  for (const [i, s] of donate.DONATION_SCHEMES.entries()) {
    await DonationSchemeModel.findOneAndUpdate(
      { slug: s.slug },
      {
        $set: { slug: s.slug, name: s.name, description: s.body, note: s.note || null, displayOrder: i },
        $setOnInsert: { status: 'active' },
      },
      { upsert: true, new: true }
    );
  }

  // Phase D: seeded ONLY on first creation ($setOnInsert), so the pages
  // don't regress to blank the moment they switch to reading Settings, but
  // an admin's later edit is never overwritten by a reseed/restart.
  // financeContactEmail (accounts@vyomalabs.in) mirrors the real, currently-
  // live bank-transfer contact previously hardcoded in donate/page.js.
  // contactInboxEmail is set per explicit instruction, not the site's
  // previous hardcoded support@vyomalabs.in. donationBankDetails' account/
  // bank names were real, live values previously hardcoded in donate/
  // page.js (only the Branch & IFSC/SWIFT lines were ever "provided on
  // request" placeholders) — seeded here so the switch to Settings doesn't
  // regress real content to a placeholder. socialLinks gets no seeded
  // values — those were always dead "#" placeholders with no real handle to
  // preserve, so null (hidden on the page) is more honest than inventing one.
  await SiteSettingsModel.findOneAndUpdate(
    {},
    {
      $setOnInsert: {
        contactInboxEmail: 'deepalakshmi.vyoma@gmail.com',
        financeContactEmail: 'accounts@vyomalabs.in',
        donationBankDetails: {
          indiaAccountName: 'Vyoma Linguistic Labs Foundation',
          indiaBankName: 'City Union Bank',
          fcraAccountName: 'Vyoma Linguistic Labs Foundation',
          fcraBankName: 'State Bank of India (FCRA)',
        },
      },
    },
    { upsert: true }
  );

  await seedBlogCategories();
  await seedBlogPosts();

  return {
    contentTypes: Object.keys(CONTENT_SEED).length,
    donationSchemes: donate.DONATION_SCHEMES.length,
    blogPosts: blog.BLOG_POSTS.length,
  };
}
