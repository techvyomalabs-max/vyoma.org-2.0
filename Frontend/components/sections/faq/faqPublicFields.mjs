// The one sanctioned path from a FAQ CMS item to what the public page
// renders. Deliberately an allowlist, not a denylist: it returns only
// `q`/`a`/`active` and drops everything else, so an internal-only CMS field
// (like `note` -- see FaqGroupsForm.jsx's "Internal note (optional)" field)
// can never reach a visitor just by existing on the data, including a future
// field no one has thought to exclude yet.
export function getPublicFaqItemFields(item) {
  return {
    q: item?.q ?? '',
    a: item?.a ?? '',
    active: item?.active !== false,
  };
}
