// Task 7L — a generic Node module customization hook (same mechanism as
// moduleAliasLoader.mjs, built entirely from the built-in `node:module` API,
// no new dependency) resolving Next.js's jsconfig.json `@/*` path alias to a
// real file under the Frontend project root, for any specifier -- unlike
// moduleAliasLoader.mjs, which narrowly redirects two EXACT specifiers to
// test doubles, this one is a plain alias resolver with no mocking.
//
// Needed because several service files (donationService.js, blogService.js,
// contentService.js) load their mock-data fallback via a dynamic
// `import('@/lib/mockData/...')` -- plain `node --test` has no knowledge of
// the `@/*` alias at all (confirmed empirically: ERR_MODULE_NOT_FOUND), so
// exercising the real, unmodified "explicit development mock mode" code
// path in a regression test requires resolving it. Register via
// `register('./testSupport/aliasResolver.mjs', import.meta.url)` before
// dynamically importing the real service module under test.
//
// Only handles plain `.js` targets (every current `@/lib/mockData/*`
// target) -- a `.jsx` target would need the same JSX-transform problem
// moduleAliasLoader.mjs's own header comment already documents as out of
// scope for this project's standalone Node test execution.
//
// Also redirects the exact specifier 'next/headers' to mockNextHeaders.mjs
// -- that package subpath cannot be resolved under plain `node --test` at
// all outside Next's own runtime (confirmed empirically:
// ERR_MODULE_NOT_FOUND), which otherwise makes contentService.js/
// blogService.js entirely unimportable here. Kept in this file (rather than
// added to moduleAliasLoader.mjs's own REDIRECTS map) so that loader's
// existing, already-passing consumers (useContentEditor.test.mjs,
// useBlogPostEditor.test.mjs) are completely unaffected by this change.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '..', '..');
const NEXT_HEADERS_MOCK = pathToFileURL(path.join(here, 'mockNextHeaders.mjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/headers') {
    return { url: NEXT_HEADERS_MOCK, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    let target = path.join(PROJECT_ROOT, specifier.slice(2));
    if (!path.extname(target)) target += '.js';
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
