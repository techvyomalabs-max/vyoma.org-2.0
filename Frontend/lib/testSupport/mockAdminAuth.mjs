// Test double for '@/lib/AdminAuthContext', substituted in via
// moduleAliasLoader.mjs so tests can exercise the real, unmodified
// useContentEditor.js/useBlogPostEditor.js hooks without pulling in the real
// AdminAuthContext.jsx (which performs real network/cookie/token-refresh
// work and -- being a .jsx file -- can't be parsed by plain Node anyway, see
// moduleAliasLoader.mjs's header comment).
//
// `apiFetch` must keep a STABLE function identity across every call to
// useAdminAuth() (mirrors the real hook's useCallback-memoized apiFetch): a
// fresh arrow function per call breaks useContentEditor's
// load = useCallback(..., [apiFetch, type]) dependency, re-triggering its
// useEffect(() => { load() }, [load]) on every render and causing an
// infinite render loop (confirmed while building this harness).
let impl = async () => ({});
const calls = [];

export function setApiFetchImpl(fn) {
  impl = fn;
}

export function getApiFetchCalls() {
  return calls;
}

export function resetApiFetchMock() {
  calls.length = 0;
  impl = async () => ({});
}

const stableApiFetch = (path, options) => {
  calls.push({ path, options });
  return impl(path, options);
};

export function useAdminAuth() {
  return { apiFetch: stableApiFetch };
}
