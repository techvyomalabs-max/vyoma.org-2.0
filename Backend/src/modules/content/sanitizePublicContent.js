// GET /api/v1/public/:type is one generic, schema-less pass-through for
// every Content document (home, about, credibility, faq, ...) -- it has no
// idea what shape any given type's `data` is in, so it can't apply a
// field-by-field allowlist the way the donation-scheme endpoint can. This
// module is the one narrow exception: a type-specific sanitizer, applied
// only to the one type known to carry an internal-only field inside its
// data, so every other content type keeps flowing through completely
// unchanged (do not add a case here speculatively -- only for a type with a
// confirmed internal-only field, same bar as the donation-scheme fix).
//
// `pages/faq`: each item inside FAQ_GROUPS[].items may carry a `note` --
// an internal-only content-ops annotation (still fully readable/editable
// via the authenticated admin FAQ screen's own "Internal note (optional)"
// field; see Frontend/components/admin/cms/faq/FaqGroupsForm.jsx). It must
// never reach a public response. Everything else on each item (`q`, `a`,
// `active`) and group (`group`, `active`) passes through unchanged, as does
// every other top-level key on the FAQ data (e.g. `SEO`).
//
// Mirrors, at the API boundary, the same allowlist already applied at the
// Frontend rendering boundary (Frontend/components/sections/faq/
// faqPublicFields.mjs) -- that one stays in place too, as a second,
// independent safeguard; this one stops the field from ever leaving the
// server in the first place. Applied identically whether the request is a
// normal public read or an admin Draft Mode preview (see
// content.controller.js) -- a preview is still "what the public will see,"
// so it must never show the note either.
export function sanitizePublicContent(type, data) {
  if (type !== 'pages/faq' || data == null || !Array.isArray(data.FAQ_GROUPS)) {
    return data;
  }

  return {
    ...data,
    FAQ_GROUPS: data.FAQ_GROUPS.map((group) => ({
      ...group,
      items: Array.isArray(group.items)
        // `active !== false` (not a raw pass-through) matches the exact
        // same "missing/undefined defaults to visible" semantics already
        // used by the Frontend allowlist (faqPublicFields.mjs) and by the
        // public FAQ page's own rendering filter, so an item with no
        // `active` field at all behaves identically at every layer.
        ? group.items.map((item) => ({ q: item?.q, a: item?.a, active: item?.active !== false }))
        : group.items,
    })),
  };
}
