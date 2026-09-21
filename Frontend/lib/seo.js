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
