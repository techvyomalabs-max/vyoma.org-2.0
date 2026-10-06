// Local, AWS-independent test harness for the generated CloudFront Function.
//
// The generated handler (infra/cloudfront/redirect-function.generated.js) has
// no dependency on anything CloudFront-specific beyond reading
// event.request.uri — so it can be loaded and exercised directly in plain
// Node, with hand-built mock `event` objects, with no AWS access at all.
//
// This script does NOT touch MongoDB and does NOT touch AWS. It only reads
// the two local files generate-redirect-manifest.mjs already produced.
//
// Usage: node scripts/deploy/test-redirect-manifest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTION_PATH = path.resolve(__dirname, '../../../infra/cloudfront/redirect-function.generated.js');
const MAP_JSON_PATH = path.resolve(__dirname, '../../../infra/cloudfront/redirect-map.generated.json');

// --- Load the generated handler without `import`-ing it as an ES module ----
// The generated file is deliberately plain `var`/`function` CloudFront
// Functions syntax (no import/export statements at all, since CloudFront
// Functions doesn't support ES modules) — so it's loaded and evaluated in a
// sandboxed VM context, then its `handler` is pulled out, mirroring how
// CloudFront itself just calls a bare top-level `handler(event)`.
function loadHandler() {
  const source = fs.readFileSync(FUNCTION_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.__handler = handler;\nthis.__map = REDIRECT_MAP;', sandbox, {
    filename: FUNCTION_PATH,
  });
  return { handler: sandbox.__handler, map: sandbox.__map };
}

function mockEvent(uri, querystring) {
  return { request: { uri, querystring: querystring || '', headers: {} } };
}

let passCount = 0;
let failCount = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
  } else {
    failCount++;
    console.error(`[FAIL] ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
  }
  return ok;
}

function main() {
  console.log('='.repeat(72));
  console.log('Local CloudFront Function redirect test harness (no AWS, no MongoDB)');
  console.log('='.repeat(72));

  const { handler, map } = loadHandler();
  const ruleCount = Object.keys(map).length;
  console.log(`[OK] Loaded generated handler with ${ruleCount} embedded rule(s).`);

  // --- 1. Every live rule in the map must redirect exactly as specified ---
  for (const [fromPath, rule] of Object.entries(map)) {
    const result = handler(mockEvent(fromPath));
    check(`rule: ${fromPath}`, result, {
      statusCode: rule.statusCode,
      statusDescription: rule.statusCode === 301 ? 'Moved Permanently' : 'Found',
      headers: { location: { value: rule.toPath } },
    });
  }

  // --- 2. Named edge cases from the approved task -------------------------
  const passthroughCase = (uri, querystring) => handler(mockEvent(uri, querystring));

  // /team/ and /leadership/ are each present and distinct (not merged/aliased).
  check('/team/ -> /about/core-team', handler(mockEvent('/team/')), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/about/core-team' } },
  });
  check('/leadership/ -> /about/leadership', handler(mockEvent('/leadership/')), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/about/leadership' } },
  });

  // /privacy and /terms have no legacy fromPath rule (they're sitemap-only
  // additions, not redirects) — must pass through unchanged, not redirect.
  check('/privacy passthrough (no rule)', passthroughCase('/privacy'), mockEvent('/privacy').request);
  check('/terms passthrough (no rule)', passthroughCase('/terms'), mockEvent('/terms').request);

  // /media/ redirects to /media; a donation legacy path redirects correctly.
  check('/media/ -> /media', handler(mockEvent('/media/')), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/media' } },
  });
  check('/vidya_danam_dm/ -> /donate/vidya-danam (donation legacy)', handler(mockEvent('/vidya_danam_dm/')), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/donate/vidya-danam' } },
  });

  // One ASCII blog redirect (plain slug, no percent-encoding involved).
  check('/blog-post/guru-purnima/ -> /media/blog/guru-purnima (ASCII blog)', handler(mockEvent('/blog-post/guru-purnima/')), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/media/blog/guru-purnima' } },
  });

  // One percent-encoded Sanskrit blog redirect, matched literally (exactly
  // as CloudFront would deliver event.request.uri — no decoding performed).
  const sanskritUri = '/blog-post/how-sa%e1%b9%83sk%e1%b9%9btam/';
  check(`${sanskritUri} -> /media/blog/how-samskrtam (percent-encoded literal match)`, handler(mockEvent(sanskritUri)), {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: '/media/blog/how-samskrtam' } },
  });
  // Decoded form of the same URI must NOT match (proves no decoding happens).
  const sanskritDecoded = decodeURIComponent(sanskritUri);
  check(`decoded form of the same URI does not match (${sanskritDecoded})`, passthroughCase(sanskritDecoded), mockEvent(sanskritDecoded).request);

  // Completely unmatched path -> passthrough (request returned unchanged).
  check('/this-path-does-not-exist/ passthrough', passthroughCase('/this-path-does-not-exist/'), mockEvent('/this-path-does-not-exist/').request);

  // /team (no trailing slash) is distinct from /team/ — must NOT match.
  check('/team (no trailing slash) does not match /team/\'s rule', passthroughCase('/team'), mockEvent('/team').request);

  // Case-sensitivity: an uppercase variant of a real rule must NOT match.
  check('/TEAM/ (uppercase) does not match /team/\'s rule (case-sensitive)', passthroughCase('/TEAM/'), mockEvent('/TEAM/').request);

  // Query string present on a matched path: ignored for lookup, and never
  // forwarded into the redirect target.
  check(
    '/team/?ref=old-newsletter — query string ignored for match, not forwarded',
    handler(mockEvent('/team/', 'ref=old-newsletter')),
    {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: '/about/core-team' } },
    }
  );

  console.log('\n' + '-'.repeat(72));
  console.log(`Results: ${passCount} passed, ${failCount} failed (out of ${passCount + failCount} checks).`);
  console.log('-'.repeat(72));

  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('All checks passed. This only proves the generated handler behaves');
    console.log('as designed when run locally in Node — it has not been verified against');
    console.log('a real CloudFront distribution, which requires AWS access out of scope here.');
  }
}

main();
