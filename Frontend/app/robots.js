// LLD Section 11 / HLD SEO section: robots configuration + sitemap
// reference. The future Admin Portal (not built yet, see app/admin/README.md)
// is disallowed pre-emptively since it must never be indexed.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin'],
    },
    sitemap: 'https://vyoma.org/sitemap.xml',
  };
}
