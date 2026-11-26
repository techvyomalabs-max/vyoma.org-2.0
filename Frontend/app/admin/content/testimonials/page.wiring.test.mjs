// QA Bug 19 Stage 5D — source-assertion coverage that the Testimonials CMS
// page actually wires the new validateTestimonialsContent() into
// ContentEditorShell's `validate` prop. This is a 'use client' JSX page with
// no loader/transform registered for plain `node --test` (same established
// limitation as every other admin page in this project -- see
// TestimonialsAllGrid.wiring.test.mjs's own header comment). The validation
// RULES themselves (format/safety, completeness, legacy-baseline diffing)
// are already covered with genuine execution in lib/testimonialCms.test.mjs;
// this file only guards that this page actually passes that real function
// through, rather than silently never validating anything or
// reimplementing the rules inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

test('imports the real validateTestimonialsContent from the shared, already-tested lib module', () => {
  assert.match(source, /import \{ validateTestimonialsContent \} from '@\/lib\/testimonialCms\.mjs';/);
});

test('ContentEditorShell is given the real validator, not reimplemented inline and not omitted', () => {
  assert.match(source, /<ContentEditorShell[^>]*\bvalidate=\{validateTestimonialsContent\}/s);
  assert.doesNotMatch(source, /function validate/i, 'must not reintroduce a second, independently-maintained validator here');
});
