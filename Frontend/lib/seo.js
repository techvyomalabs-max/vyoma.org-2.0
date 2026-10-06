// Shared helper so every page sets a canonical URL consistently (HLD Section
// 11: "Generate per-page title, description, canonical URL... from CMS
// data"). Next.js does not auto-derive canonical from metadataBase + route —
// it must be supplied per page, so this centralizes the shape.
export function pageMetadata({ path, title, description }) {
  return {
    title,
    description,
    alternates: { canonical: path },
  };
}

// --- JSON-LD -----------------------------------------------------------
// Matches root layout's metadataBase (app/layout.js) — not re-read from
// there to avoid a layout->lib import cycle; both are the site's one real
// public origin.
const SITE_URL = 'https://vyoma.org';
const SITE_NAME = 'Vyoma Linguistic Labs Foundation';

// Same slug set/order Footer.jsx already renders from Settings.socialLinks —
// `socialLinks` is whatever services/settingsService.js's getPublicSettings()
// returned (real data, or {} in USE_MOCK/offline mode); a platform with no
// configured URL (e.g. LinkedIn while null) is simply omitted, never
// fabricated, exactly like the Footer's own existing behavior.
const SOCIAL_SLUGS = ['facebook', 'youtube', 'instagram', 'x', 'linkedin'];

// Site-wide identity — only verified, already-public values: the real site
// name (used elsewhere as the root <title>/openGraph siteName), the real
// origin, the one logo file that exists in the repo, and whichever social
// links are currently configured (never all five — only the ones actually
// set). No address/telephone/identifier is included: none is verified as
// intended for public structured data.
export function organizationJsonLd(socialLinks = {}) {
  const sameAs = SOCIAL_SLUGS.map((slug) => socialLinks?.[slug]).filter(Boolean);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/images/logo-white.png`,
  };
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}

// No `potentialAction`/SearchAction — the header's search box has no
// functioning backend yet, so claiming one in structured data would be
// false, not just premature.
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  };
}

// `items`: [{name, path}], root-first. Purely derived from the page's own
// real route — no invented labels.
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

// One BlogPosting per published post. Every optional field is included only
// when a real value exists — never written as null/undefined/empty string,
// matching the same "absent means absent" rule already applied to the
// Newsletter migration's `url` field.
export function articleJsonLd({ title, description, canonicalPath, imageUrl, author, publishedAt }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    mainEntityOfPage: `${SITE_URL}${canonicalPath}`,
  };
  if (description) data.description = description;
  if (imageUrl) data.image = imageUrl;
  if (author) data.author = { '@type': 'Person', name: author };
  if (publishedAt) data.datePublished = new Date(publishedAt).toISOString();
  return data;
}

// Renders a JSON-LD object as <script> props. Escapes `<` so embedded
// content (e.g. a post title containing "</script>") can never break out of
// the script tag — standard practice for dangerouslySetInnerHTML'd JSON,
// not a sign any current content is untrusted (blog body/title are already
// sanitized/admin-authored).
export function jsonLdScriptProps(data) {
  return { dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') } };
}
