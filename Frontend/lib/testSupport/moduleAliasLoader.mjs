// A Node module customization hook (built-in `node:module` API, stable
// since Node 20.6 -- no new package), registered via `register()` from a
// test file before it dynamically imports the real hook under test.
//
// Why this exists: useContentEditor.js/useBlogPostEditor.js import
// '@/lib/AdminAuthContext' and '@/components/admin/ui/Toast' using Next.js's
// jsconfig.json path alias (@/* -> ./*), which plain `node --test` cannot
// resolve at all (confirmed empirically: ERR_MODULE_NOT_FOUND). Even if the
// alias were resolved, both real target files are .jsx files containing
// genuine JSX syntax, which Node's native ESM loader cannot parse either
// (confirmed empirically: "Unknown file extension .jsx" -- there is no
// Babel/SWC/esbuild register hook anywhere in this project for standalone
// Node execution outside Next.js's own bundler).
//
// Rather than installing a JSX transform (a new dependency, not approved)
// or hand-rolling one (far outside this task's scope), this hook narrowly
// redirects ONLY these two exact import specifiers to lightweight,
// framework-free test doubles (mockAdminAuth.mjs/mockToast.mjs) that need no
// JSX at all -- every other import resolves completely normally. The two
// hook files under test are otherwise imported completely unmodified.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const REDIRECTS = new Map([
  ['@/lib/AdminAuthContext', pathToFileURL(path.join(here, 'mockAdminAuth.mjs')).href],
  ['@/components/admin/ui/Toast', pathToFileURL(path.join(here, 'mockToast.mjs')).href],
]);

export async function resolve(specifier, context, nextResolve) {
  const redirect = REDIRECTS.get(specifier);
  if (redirect) return { url: redirect, shortCircuit: true };
  return nextResolve(specifier, context);
}
