// Batch 2 correction: sanitizeLegalBody.js was stripping <ol>'s `start`
// attribute (each numbered section in Privacy/Terms is its own single-item
// <ol start="N">, not literal "N." text), found via post-commit read-only
// verification of the already-committed pages/privacy/pages/terms
// documents. Now that sanitizeLegalBody.js allows ol.start, this script
// re-derives BODY from the same WXR source and updates ONLY data.BODY on
// the two already-existing Content documents — TITLE/EFFECTIVE_DATE/SEO/
// status/draftData are never touched, and this script never inserts a new
// document (it aborts if either type is missing).
//
// Modes:
//   node fix-legal-body.mjs            -> dry-run (default): shows the diff,
//                                          writes nothing.
//   node fix-legal-body.mjs --commit   -> performs the real $set, only
//                                          after the same safety checks pass.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { sanitizeLegalBody } from '../../../src/modules/content/sanitizeLegalBody.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WXR_PATH = path.resolve(
  __dirname,
  '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml'
);
const LEGAL_SLUGS = ['privacy', 'terms'];
const TYPE_OF_SLUG = { privacy: 'pages/privacy', terms: 'pages/terms' };

function clean(s) {
  return s == null ? null : s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
}
function stripDiviAndGutenberg(html) {
  return (html || '').replace(/\[\/?et_pb_[a-z_]+[^\]]*\]/gi, '').replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').trim();
}
function extractBody(rawHtml) {
  const cleaned = stripDiviAndGutenberg(rawHtml);
  const h1Match = cleaned.match(/<h1>([\s\S]*?)<\/h1>/i);
  return h1Match ? cleaned.replace(h1Match[0], '').trim() : cleaned;
}

function parseCorrectedBodies(wxrPath) {
  const xml = fs.readFileSync(wxrPath, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const out = {};
  for (const item of items) {
    if (tag('wp:post_type', item) !== 'page') continue;
    const slug = tag('wp:post_name', item);
    if (!LEGAL_SLUGS.includes(slug)) continue;
    const rawContent = tag('content:encoded', item) || '';
    out[slug] = sanitizeLegalBody(extractBody(rawContent));
  }
  return out;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const wxrArgIdx = process.argv.indexOf('--wxr');
  const wxrPath = wxrArgIdx !== -1 ? process.argv[wxrArgIdx + 1] : DEFAULT_WXR_PATH;

  console.log('='.repeat(72));
  console.log(`fix-legal-body — mode: ${commit ? 'COMMIT (will write BODY only)' : 'DRY-RUN (no writes)'}`);
  console.log('='.repeat(72));

  if (!fs.existsSync(wxrPath)) {
    console.error(`\nABORT: WXR file not found at ${wxrPath}`);
    process.exitCode = 1;
    return;
  }

  const corrected = parseCorrectedBodies(wxrPath);
  if (!corrected.privacy || !corrected.terms) {
    console.error('\nABORT: could not re-derive BODY for privacy and/or terms from the WXR export.');
    process.exitCode = 1;
    return;
  }
  const olCount = { privacy: (corrected.privacy.match(/<ol start=/g) || []).length, terms: (corrected.terms.match(/<ol start=/g) || []).length };
  console.log(`[OK] Re-derived BODY: privacy ${corrected.privacy.length} chars (${olCount.privacy} <ol start> tags), terms ${corrected.terms.length} chars (${olCount.terms} <ol start> tags).`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const docs = {};
    for (const slug of LEGAL_SLUGS) {
      const type = TYPE_OF_SLUG[slug];
      const doc = await ContentModel.findOne({ type });
      if (!doc) {
        console.error(`\nABORT: Content{type: '${type}'} does not exist — this script only corrects an existing document, never creates one.`);
        process.exitCode = 1;
        return;
      }
      if (doc.status !== 'published') {
        console.error(`\nABORT: Content{type: '${type}'} is not published (status: ${doc.status}) — refusing to touch an unexpected state.`);
        process.exitCode = 1;
        return;
      }
      docs[slug] = doc;
    }
    console.log('[OK] Both pages/privacy and pages/terms exist and are published.');

    console.log('\n--- Intended operation ---');
    for (const slug of LEGAL_SLUGS) {
      const type = TYPE_OF_SLUG[slug];
      const doc = docs[slug];
      const currentBody = doc.data?.BODY || '';
      const newBody = corrected[slug];
      const currentOlCount = (currentBody.match(/<ol start=/g) || []).length;
      const identical = currentBody === newBody;
      console.log(
        `Content{type:'${type}'}.data.BODY: current ${currentBody.length} chars (${currentOlCount} <ol start> tags) ` +
          `-> corrected ${newBody.length} chars (${olCount[slug]} <ol start> tags) ${identical ? '[already identical — no-op]' : '[will change]'}`
      );
      // Only ever touches data.BODY — every other field on the document
      // (TITLE, EFFECTIVE_DATE, SEO, status, draftData, _id, timestamps
      // other than the implicit updatedAt bump) is left completely alone.
      const otherKeys = Object.keys(doc.data || {}).filter((k) => k !== 'BODY');
      console.log(`  Other data keys on this document (untouched): ${otherKeys.join(', ')}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this correction for real.');
      return;
    }

    for (const slug of LEGAL_SLUGS) {
      const type = TYPE_OF_SLUG[slug];
      await ContentModel.updateOne({ type }, { $set: { 'data.BODY': corrected[slug] } });
    }
    console.log('\n[COMMIT] Updated data.BODY on pages/privacy and pages/terms only.');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
