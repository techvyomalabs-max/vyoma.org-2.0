// The one sanctioned path from a DonationScheme MongoDB document to what
// either public endpoint (GET /public/donation-schemes and
// /public/donation-schemes/:slug) sends over the wire. Deliberately an
// allowlist, not a denylist: it returns only `slug`/`name`/`body`/`image`/
// `status` and drops everything else on the document -- in particular
// `note` (an internal-only content-ops annotation, still fully readable
// and editable via the authenticated admin donation-schemes screen), plus
// `_id`, `__v`, `createdAt`, `updatedAt`, `paymentMode`, `amountOptions`,
// and `displayOrder`, none of which any public Frontend component reads --
// so a future internal-only field added to the scheme schema can never
// reach a visitor just by existing on the document.
//
// Mirrors, at the API boundary, the same allowlist already applied at the
// Frontend rendering boundary (Frontend/components/sections/donate/
// donationSchemePublicFields.mjs) -- that one stays in place too, as a
// second, independent safeguard; this one stops the field from ever
// leaving the server in the first place.
export function shapePublicScheme(scheme) {
  return {
    slug: scheme?.slug ?? '',
    name: scheme?.name ?? '',
    body: scheme?.description ?? '',
    image: scheme?.image || undefined,
    status: scheme?.status,
  };
}
