// QA Bug 13 fix regression coverage: the "no internship openings" empty
// state previously told candidates "No internships open right now. Check
// back soon, or apply through Careers" directly above an unconditional
// "Apply Now" CTA for internships -- contradictory, since it redirected
// candidates away from this page's own working application flow. This is a
// server component (no 'use client', async function) with no React-
// rendering harness in this project (same established limitation as
// Header.jsx and every other JSX-returning page.js here -- see
// donate/page.heroScrollTarget.test.mjs's own header comment) -- so this
// follows that same source-text-assertion pattern. The underlying
// CMS-active-filter logic (toActiveContentArray) already has its own,
// separately maintained, genuine runtime test coverage in
// lib/contentArrays.test.mjs; this file only confirms the page's own
// wiring/content, using local fixture-free source assertions, never a real
// database or API call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

function emptyStateBlock() {
  const start = source.indexOf('INTERNSHIP_OPENINGS.length === 0');
  assert.notEqual(start, -1, 'expected to find the empty-state conditional in page.js');
  const end = source.indexOf(') : (', start);
  assert.ok(end > start, 'expected to find the ternary\'s else branch after the empty-state check');
  return source.slice(start, end);
}

test('the approved general-application message is shown in the empty state', () => {
  const block = emptyStateBlock();
  assert.match(
    block,
    /Vyoma welcomes internship applications throughout the year\. We encourage interested candidates to\s*\n\s*apply\. Our team will review your application based on suitable opportunities\./
  );
});

test('the old contradictory message and the Careers redirect are both gone', () => {
  assert.ok(!source.includes('No internships open right now'), 'the old contradictory sentence must be removed');
  assert.ok(!source.includes('apply through Careers'), 'the old Careers-redirect wording must be removed');
  assert.ok(!source.includes('/join-us/careers'), 'the empty state must no longer link to Careers');
});

test('the now-unused next/link import was removed, not left dangling', () => {
  assert.ok(!source.includes("import Link from 'next/link'"), 'Link is no longer used anywhere in this file, so its import must be gone');
  assert.ok(!source.includes('<Link'), 'no <Link> element should remain in this file');
});

test('active internship vacancies still render through the existing CMS data flow, unchanged', () => {
  assert.match(source, /const INTERNSHIP_OPENINGS = toActiveContentArray\(OPENINGS_ALL\);/);
  assert.match(source, /\{INTERNSHIP_OPENINGS\.map\(\(o, i\) => \(/);
  assert.match(source, /\{o\.role\}/);
  assert.match(source, /Skill required: \{o\.skill\}/);
  assert.match(source, /Apply →/);
});

test('INTERNSHIP_REASONS ("Why intern at Vyoma?") is untouched', () => {
  assert.match(source, /const INTERNSHIP_REASONS = toContentArray\(REASONS_ALL\);/);
  assert.match(source, /Why intern at Vyoma\?/);
});

test('Apply Now (ContactCta subject="Internships") is present exactly once, unconditionally -- outside the vacancy ternary, never hidden by vacancy count', () => {
  const matches = source.match(/<ContactCta subject="Internships">Apply Now<\/ContactCta>/g) || [];
  assert.equal(matches.length, 1, 'expected exactly one Apply Now CTA');

  const ctaIndex = source.indexOf('<ContactCta subject="Internships">Apply Now</ContactCta>');
  const openingsSectionEnd = source.indexOf('</section>', source.indexOf('Current Internship Opportunities'));
  assert.ok(ctaIndex > openingsSectionEnd, 'Apply Now must be rendered after (outside) the vacancy section, not inside the empty-state/vacancy ternary');
});

test('the existing Internships contact-modal wiring (ContactCta -> openContact) is unchanged at the shared-component level', () => {
  const ctaButtonsSource = fs.readFileSync(path.join(__dirname, '../../../../components/sections/CtaButtons.jsx'), 'utf8');
  assert.match(ctaButtonsSource, /export function ContactCta\(\{ subject, children = 'Contact our team'.*\}\) \{/);
  assert.match(ctaButtonsSource, /onClick=\{\(\) => openContact\(subject\)\}/);
});

test('the 16px hero eyebrow fix is preserved on this page', () => {
  assert.match(source, /eyebrow="Join Us"\s*\n\s*eyebrowSize="text-\[16px\]"/);
});
