// The one sanctioned path from a donation-scheme object (as returned by
// GET /public/donation-schemes and /public/donation-schemes/:slug) to what
// a public donate page renders. Deliberately an allowlist, not a denylist:
// it returns only `slug`/`name`/`body`/`image`/`status` and drops
// everything else -- in particular `note`, an internal-only content-ops
// annotation (the admin CMS's own donation-scheme editor keeps this field;
// it was never meant for a public visitor) -- so a future internal-only
// field added to the scheme shape can never reach a visitor just by
// existing on the data, the same protection already applied to FAQ items
// (see Frontend/components/sections/faq/faqPublicFields.mjs).
export function getPublicSchemeFields(scheme) {
  return {
    slug: scheme?.slug ?? '',
    name: scheme?.name ?? '',
    body: scheme?.body ?? '',
    image: scheme?.image ?? null,
    status: scheme?.status,
  };
}
