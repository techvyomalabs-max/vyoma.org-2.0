import { isMockContentSeedAllowed } from '../config/env.js';

// Extracted out of server.js (rather than left as inline logic there) so it
// can be unit-tested against a real (in-memory) MongoDB without importing
// server.js itself -- server.js's module body calls main() as a top-level
// side effect (connects to Mongo, starts listening), so importing it from a
// test file would do all of that unconditionally.
//
// Dependency-injected (ContentModel/runSeed/isAllowed/log) purely so tests
// can pass a real in-memory-backed ContentModel and a real runSeed while
// still being able to override isAllowed() for the staging/production/
// opt-in cases without mutating global env state mid-test.
export async function maybeAutoSeedMockContent({ ContentModel, runSeed, isAllowed = isMockContentSeedAllowed, log = console.log }) {
  const count = await ContentModel.countDocuments();
  if (count > 0) {
    return { seeded: false, reason: 'not_empty' };
  }

  if (!isAllowed()) {
    log(
      '[server] database is empty, but mock-content auto-seeding is not enabled for this environment -- skipping. ' +
        'Set ALLOW_MOCK_CONTENT_SEED=true to opt in, or seed real content manually.'
    );
    return { seeded: false, reason: 'not_allowed' };
  }

  log('[server] database is empty — auto-seeding from mock data...');
  const result = await runSeed();
  log(`[server] seeded ${result.contentTypes} content types, ${result.donationSchemes} donation schemes, ${result.blogPosts} blog posts`);
  return { seeded: true, result };
}
