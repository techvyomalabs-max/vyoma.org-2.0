// Read-only report builder. Consumes wp-full-extract.json (already produced
// by extract-full.cjs from the WXR export) and wp-inventory.json, and writes
// the requested mapping/decision report files under
// Backend/scripts/wordpress/reports/. No WordPress or MongoDB access here at
// all — pure local JSON in, JSON/Markdown out.
const fs = require('fs');
const path = require('path');

const full = require('./wp-full-extract.json');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// ---------------------------------------------------------------------------
// 1. PAGE-BY-PAGE MAPPING
// ---------------------------------------------------------------------------
// Known, already-built destinations on the new site (confirmed by direct
// inspection earlier in this project — not guessed).
const DIRECT_MATCH = {
  about: { dest: '/about', note: 'About page already exists.' },
  contact: { dest: '/contact', note: 'Contact page already exists.' },
  events: { dest: '/media/events', note: 'Media > Events already exists.' },
  newsletter: { dest: '/media/newsletter', note: 'Media > Newsletter already exists.' },
  volunteers: { dest: '/join-us/volunteer', note: 'Join Us > Volunteer already exists.' },
  'csr-projects': { dest: '/join-us/csr-projects', note: 'Join Us > CSR Projects already exists.' },
  corpus: { dest: '/join-us/corpus-fund', note: 'Join Us > Corpus Fund already exists.' },
  internships: { dest: '/join-us/internship', note: 'Join Us > Internship already exists.' },
  compliances_registrations: { dest: '/credibility/compliances-registrations', note: 'Already wired with 8 real registration PDFs.' },
  collaterals: { dest: '/credibility/collaterals', note: 'Already built (currently "Not uploaded yet" for all items).' },
  annual_reports: { dest: '/credibility/annual-reports', note: 'Already built (currently "Not uploaded yet" for all items).' },
  social_impact_report: { dest: '/credibility/social-impact-report', note: 'Already built.' },
  'social-impact-report': { dest: '/credibility/social-impact-report', note: 'Already built.' },
  awards: { dest: '/credibility/awards-recognition', note: 'Already built.' },
  media: { dest: '/media', note: 'Media hub already exists.' },
  vidya_danam_dm: { dest: '/donate/vidya-danam', note: 'Matches live donation scheme slug "vidya-danam".' },
  'grantha-danam-2': { dest: '/donate/grantha-danam', note: 'Matches live donation scheme slug "grantha-danam". No plain "grantha-danam" page exists in the export — only this "-2" variant.' },
  generaldonation: { dest: '/donate/general-donation', note: 'Matches live donation scheme slug "general-donation".' },
  eventscontribution: { dest: '/donate/events-and-projects', note: 'Matches live donation scheme slug "events-and-projects".' },
  samskritsabhaujjeevanam: { dest: '/donate/sabha-ujjivanam', note: 'Transliteration match to live donation scheme slug "sabha-ujjivanam".' },
};

// Duplicate-slug cluster membership (by post_name) -> cluster key
const DUP_CLUSTER = {
  gallery: 'gallery', 'gallery-2': 'gallery', 'gallery-2-2': 'gallery',
  donors: 'donors', 'donors-2-2': 'donors', 'donors-3': 'donors',
  'where-iks': 'where-iks', 'where-iks-2': 'where-iks',
  blog: 'blog', 'blog-2': 'blog', blogs: 'blog',
  'page1-2': 'homepage', 'new-landing': 'homepage',
  careers: 'careers', careers120126: 'careers', 'careers-backup': 'careers',
  'what-sanskrit': 'sanskrit-topic', 'where-sanskrit': 'sanskrit-topic', 'where-sanskrit-3': 'sanskrit-topic',
  team: 'team', 'team-1': 'team', leadership: 'team',
};

// Redirect-only / no new page needed (transactional or fully superseded by app flow)
const REDIRECT_ONLY = new Set(['payment-confirmation', 'payment-failed']);

function classifyPage(p) {
  const slug = p.post_name || '';
  if (p.status === 'draft') {
    if (p.contentLength < 100) return { code: 'C', action: 'Discard candidate (empty/near-empty draft, never published)' };
    return { code: 'D', action: 'Draft — needs human review before any migration decision' };
  }
  if (REDIRECT_ONLY.has(slug)) {
    return { code: 'E', action: 'No new page needed — superseded by the new Razorpay checkout flow’s own success/fail handling' };
  }
  if (DUP_CLUSTER[slug]) {
    return { code: 'C', action: `Part of duplicate-slug cluster "${DUP_CLUSTER[slug]}" — see duplicate-review.json. No page-level decision until that cluster is resolved.` };
  }
  if (DIRECT_MATCH[slug]) {
    return { code: 'A', action: `Maps to ${DIRECT_MATCH[slug].dest}. Content still needs to be manually re-authored from the Divi source (see diviTags) — this is a destination match, not a content-ready import.` };
  }
  return { code: 'F', action: 'No confident destination identified — needs your decision before any migration work' };
}

const pageMapping = full.pages.map((p) => {
  const cls = classifyPage(p);
  return {
    title: p.title,
    oldSlug: p.post_name || '(empty — never assigned a slug)',
    oldUrl: p.link,
    status: p.status,
    classification: cls.code,
    likelyDestination: DIRECT_MATCH[p.post_name]?.dest || null,
    migrationAction: cls.action,
    notes: [
      DIRECT_MATCH[p.post_name]?.note,
      p.hasContactForm || /\[wpforms/i.test('') ? null : null, // placeholder, real form flag added below
      `Divi content length: ${p.contentLength} chars.`,
      p.diviTags.length ? `Uses Divi modules: ${p.diviTags.slice(0, 6).join(', ')}${p.diviTags.length > 6 ? '…' : ''}` : 'No Divi shortcodes detected (near-empty).',
    ].filter(Boolean).join(' '),
  };
});

fs.writeFileSync(path.join(REPORTS_DIR, 'page-mapping.json'), JSON.stringify(pageMapping, null, 2));

// ---------------------------------------------------------------------------
// 2. DUPLICATE SLUG CLUSTERS
// ---------------------------------------------------------------------------
const clusters = {};
for (const p of full.pages) {
  const key = DUP_CLUSTER[p.post_name];
  if (!key) continue;
  clusters[key] = clusters[key] || [];
  clusters[key].push(p);
}

const duplicateReview = Object.entries(clusters).map(([cluster, members]) => ({
  cluster,
  members: members.map((p) => ({
    title: p.title,
    id: p.post_id,
    status: p.status,
    date: p.post_date,
    oldUrl: p.link,
    contentLength: p.contentLength,
  })),
  contentDiffersMaterially: new Set(members.map((p) => p.contentLength)).size > 1
    ? 'Yes — content lengths differ significantly, these are not identical copies.'
    : 'Inconclusive from length alone — needs a manual side-by-side read.',
  mostLikelyCurrent: 'Not selected automatically — see decisionNeeded.',
  decisionNeeded: `Which of [${members.map((p) => p.post_name).join(', ')}] is the authoritative version to migrate (if any) — the others are candidates for discard or archival.`,
}));

fs.writeFileSync(path.join(REPORTS_DIR, 'duplicate-review.json'), JSON.stringify(duplicateReview, null, 2));

// ---------------------------------------------------------------------------
// 3. BLOG MIGRATION MAP
// ---------------------------------------------------------------------------
function cleanSlugCandidate(slug) {
  try {
    const decoded = decodeURIComponent(slug);
    return decoded !== slug ? decoded.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
  } catch {
    return null;
  }
}

const EXISTING_DEMO_BLOG_SLUGS = new Set([
  'how-the-pancatantra-teaches-without-teaching',
  'what-a-decade-of-sanskrit-camps-taught-us-about-retention',
  'grammar-as-play-rethinking-the-first-lesson',
  'inside-a-village-sanskrit-camp-a-week-in-photos',
  'why-volunteers-keep-coming-back',
  'the-grandmother-who-learned-sanskrit-at-71',
]);

const blogMapping = full.blogPosts.map((b) => {
  const proposedSlug = cleanSlugCandidate(b.post_name) || b.post_name;
  return {
    title: b.title,
    oldSlug: b.post_name,
    proposedCleanSlug: proposedSlug,
    slugNeedsCleaning: proposedSlug !== b.post_name,
    publishedDate: b.post_date,
    categories: b.categories,
    tags: b.tags,
    author: b.creator,
    featuredImageAttached: !!b.thumbnailId,
    rankMathTitle: b.rankMath.title,
    metaDescription: b.rankMath.description,
    canonical: b.rankMath.canonical,
    bodySource: 'Divi shortcode markup (content:encoded) — not clean HTML',
    diviShortcodesPresent: b.diviTags.length > 0,
    diviTags: b.diviTags,
    migrationReadiness: b.diviTags.length > 0 ? 'Needs manual rebuild from Divi content before import' : 'Content appears plain — verify then import',
    redirectRequiredFromOldSlug: true,
    note: EXISTING_DEMO_BLOG_SLUGS.has(proposedSlug)
      ? 'CAUTION: a similarly-titled/slugged post already exists in the new site’s current (demo) blog content — compare before importing to avoid a near-duplicate.'
      : null,
  };
});

fs.writeFileSync(path.join(REPORTS_DIR, 'blog-mapping.json'), JSON.stringify(blogMapping, null, 2));

// ---------------------------------------------------------------------------
// 4. TESTIMONIAL MIGRATION MAP
// ---------------------------------------------------------------------------
const testimonialMapping = full.testimonials.map((t) => {
  const isHomeSlider = t.category.includes('Home-slider');
  return {
    titleOrName: t.title,
    category: t.category,
    content: t.bodyText,
    imageAvailable: !!t.thumbnailId,
    taggedHomeSlider: isHomeSlider,
    proposedDestination: isHomeSlider ? 'Home page HOME_TESTIMONIALS' : 'No current destination — the new site does not yet have a general/"Old" testimonials archive page',
    action: isHomeSlider ? 'migrate' : 'manual review',
    note: isHomeSlider
      ? 'The new site’s current HOME_TESTIMONIALS (3 entries: Dr Jaya Tyagi, Dr Ramakrishnarao Rebbapragada, Sri Siddhartha Jayanti) are placeholder/demo content, not sourced from WordPress — these 7 real "Home-slider" testimonials are candidates to replace them, pending your approval.'
      : 'These 6 "Old"-category testimonials have no image and no clear destination in the current CMS structure — decide whether they belong on /media/testimonials (which exists as a page slug in WordPress but has no equivalent content model yet in the new CMS) or should be archived.',
  };
});

fs.writeFileSync(path.join(REPORTS_DIR, 'testimonial-mapping.json'), JSON.stringify(testimonialMapping, null, 2));

// ---------------------------------------------------------------------------
// 5. CREDIBILITY DOCUMENT INVENTORY (from the 104 PDFs)
// ---------------------------------------------------------------------------
const ALREADY_WIRED = new Map([
  ['fcra-registration.pdf', 'FCRA-Registration.pdf'],
  ['fcra-renewal-2022.pdf', 'FCRA-Renewal_2022.pdf'],
  ['80g-renewal.pdf', '80G-Renewal.pdf'],
  ['12a-renewal.pdf', '12A_Renewal_Document.pdf'],
  ['ngo-darpan.pdf', 'NGO Darpan.pdf'],
  ['msme-registration.pdf', 'MSME Registration.pdf'],
  ['certificate-of-incorporation.pdf', 'Certificate of Incorporation-071212.pdf'],
  ['csr-registration.pdf', 'CSR-Registration.pdf'],
]);
const ALREADY_WIRED_ORIGINAL_NAMES = new Set([...ALREADY_WIRED.values()].map((n) => n.toLowerCase()));

function classifyPdf(filename) {
  const f = filename.toLowerCase();
  if (/fcra|80g|12a|csr-registration|msme|ngo-darpan|incorporation|registration/.test(f)) return 'Compliances & Registrations';
  if (/annual-report/.test(f)) return 'Annual Reports';
  if (/social-impact-report/.test(f)) return 'Social Impact Reports';
  if (/financials/.test(f)) return 'Audit Reports';
  if (/brochure|catalogue|presentation|about-vyoma|flyer/.test(f)) return 'Collaterals / Brochures';
  if (/activity-report|digital-sanskrit-movement|newsletter|vyomavaartaa|bi_annual/i.test(f)) return 'Other/Unknown (recurring newsletters/activity reports — no current CMS section)';
  if (/job|jd_|position/i.test(f)) return 'Other/Unknown (job descriptions — not content for any current public page)';
  return 'Other/Unknown';
}

const pdfInventory = full.attachments
  .filter((a) => /\.pdf(\?|$)/i.test(a.attachment_url))
  .map((a) => {
    const filename = decodeURIComponent(a.attachment_url.split('/').pop());
    const category = classifyPdf(filename);
    const alreadyWired = ALREADY_WIRED_ORIGINAL_NAMES.has(filename.toLowerCase());
    return {
      attachmentId: a.post_id,
      filename,
      sourceUrl: a.attachment_url,
      linkedFromPage: a.parent ? `${a.parent.title} (${a.parent.post_name}, ${a.parent.post_type})` : 'Not discoverable via post_parent (uploaded to media library directly, not attached to a post) — a content-text search would be needed to find where it’s actually referenced',
      proposedDestination: category,
      status: alreadyWired
        ? 'ALREADY WIRED — matches a filename already used in /credibility/compliances-registrations'
        : category.startsWith('Other/Unknown') ? 'review' : 'review (candidate)',
    };
  });

fs.writeFileSync(path.join(REPORTS_DIR, 'pdf-inventory.json'), JSON.stringify(pdfInventory, null, 2));

// ---------------------------------------------------------------------------
// 10. REDIRECT PLAN (candidate only — nothing created)
// ---------------------------------------------------------------------------
const redirectCandidates = full.pages.map((p) => {
  const slug = p.post_name || '';
  const dest = DIRECT_MATCH[slug]?.dest || null;
  let confidence = 'low';
  let manualReview = true;
  if (dest) { confidence = 'high'; manualReview = false; }
  else if (DUP_CLUSTER[slug]) { confidence = 'blocked-on-duplicate-decision'; manualReview = true; }
  else if (p.status === 'draft') { confidence = 'n/a (draft, never public)'; manualReview = true; }
  return {
    oldPath: new URL(p.link).pathname,
    proposedNewPath: dest || null,
    confidence,
    manualReviewFlag: manualReview,
    isDuplicateOrObsoleteCandidate: !!DUP_CLUSTER[slug],
    isDraft: p.status === 'draft',
  };
});

// blog posts with encoded slugs get their own redirect rows
for (const b of full.blogPosts) {
  const proposed = cleanSlugCandidate(b.post_name) || b.post_name;
  redirectCandidates.push({
    oldPath: new URL(b.link).pathname,
    proposedNewPath: `/media/blog/${proposed}`,
    confidence: proposed !== b.post_name ? 'medium (slug needs de-encoding, confirm final spelling)' : 'high',
    manualReviewFlag: proposed !== b.post_name,
    isDuplicateOrObsoleteCandidate: false,
    isDraft: false,
  });
}

fs.writeFileSync(path.join(REPORTS_DIR, 'redirect-candidates.json'), JSON.stringify(redirectCandidates, null, 2));

// ---------------------------------------------------------------------------
// Console summary (for the chat report)
// ---------------------------------------------------------------------------
const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
for (const p of pageMapping) counts[p.classification]++;
console.log('Page classification counts:', counts);
console.log('Duplicate clusters:', Object.keys(clusters));
console.log('PDF category counts:', pdfInventory.reduce((acc, p) => { acc[p.proposedDestination] = (acc[p.proposedDestination] || 0) + 1; return acc; }, {}));
console.log('Already-wired PDFs matched by filename:', pdfInventory.filter((p) => p.status.startsWith('ALREADY')).length);
