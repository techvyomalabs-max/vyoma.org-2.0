// Task 7L — minimal test double for 'next/headers', used only to make
// contentService.js/blogService.js importable under plain `node --test` --
// 'next/headers' cannot be resolved there at all outside Next's own runtime
// (confirmed empirically: ERR_MODULE_NOT_FOUND even for the exact subpath).
//
// Returns { isEnabled: false } unconditionally -- the exact same "not
// previewing" outcome contentService.js's/blogService.js's own try/catch
// already falls back to when the real draftMode() throws for the identical
// reason (no real request context) at actual Next.js build time. This
// double doesn't change either file's behavior or add a new code path; it
// just lets that already-written, already-safe fallback run deterministically
// in a test instead of only incidentally whenever a try/catch happens to
// catch a real Next.js internal error.
export async function draftMode() {
  return {
    isEnabled: false,
    // app/api/draft/route.js calls this after a verified admin session --
    // a no-op here is fine, since no test exercising that call cares about
    // any real cookie being set, only about what gets returned/logged.
    enable() {},
    disable() {},
  };
}
