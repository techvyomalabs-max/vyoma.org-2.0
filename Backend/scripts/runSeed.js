import { ContentModel } from '../src/modules/content/content.model.js';
import { DonationSchemeModel } from '../src/modules/donations/donationScheme.model.js';

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

// One Content document per `type` key the frontend's service layer actually
// requests (Frontend/services/pageService.js, blogService.js,
// mediaService.js). "blog", "media", and "pages/media" all point at the same
// underlying media.js dataset, exactly matching how the mock loader today
// returns the whole module namespace regardless of which type was asked for.
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
  blog: media,
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

// Shared by the CLI `npm run seed` entrypoint (always upserts, for a real
// persistent MongoDB) and the server's own startup (auto-seeds only when the
// in-memory dev fallback boots empty — see server.js).
export async function runSeed() {
  for (const [type, mod] of Object.entries(CONTENT_SEED)) {
    const data = type === 'pages/about' ? normalizeAbout(mod) : { ...mod };
    await ContentModel.findOneAndUpdate({ type }, { type, data }, { upsert: true, new: true });
  }

  for (const s of donate.DONATION_SCHEMES) {
    await DonationSchemeModel.findOneAndUpdate(
      { slug: s.slug },
      { slug: s.slug, name: s.name, description: s.body, note: s.note || null, status: 'active' },
      { upsert: true, new: true }
    );
  }

  return { contentTypes: Object.keys(CONTENT_SEED).length, donationSchemes: donate.DONATION_SCHEMES.length };
}
