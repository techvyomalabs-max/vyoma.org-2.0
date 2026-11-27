// QA Bug 19 Stage 5D — source-assertion coverage that the Home CMS page's
// own validateHomeContent() actually wires in the new
// validateHomeTestimonialsContent() for HOME_TESTIMONIALS, and that both
// Save Draft and Publish forward the already-published `doc.data` as the
// legacy-diffing baseline. Same established JSX-page limitation as
// page.validateInternship.test.mjs (join-us) -- this file does not
// re-extract/re-execute validateHomeContent's pre-existing HERO_SLIDES/
// HOME_ACTIVITIES link checks (untouched, out of this task's scope); the
// testimonial validation RULES themselves are already covered with genuine
// execution in lib/testimonialCms.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

test('imports the real validateHomeTestimonialsContent from the shared, already-tested lib module', () => {
  assert.match(source, /import \{ validateHomeTestimonialsContent \} from '@\/lib\/testimonialCms\.mjs';/);
});

test('validateHomeContent calls validateHomeTestimonialsContent with (data, baselineData) and returns its error', () => {
  assert.match(source, /function validateHomeContent\(data, baselineData\) \{/);
  assert.match(source, /const testimonialsError = validateHomeTestimonialsContent\(data, baselineData\);/);
  assert.match(source, /if \(testimonialsError\) return testimonialsError;/);
});

test('both Save Draft and Publish pass the already-published doc.data as the baseline, never the in-progress draftValue', () => {
  assert.match(source, /const handleSaveDraft = \(\) => \{\s*const validationError = validateHomeContent\(draftValue, doc\?\.data \?\? null\);/);
  assert.match(source, /const handlePublish = \(\) => \{\s*const validationError = validateHomeContent\(draftValue, doc\?\.data \?\? null\);/);
});
