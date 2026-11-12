import sanitizeHtml from 'sanitize-html';

import { env } from '../../config/env.js';

// Phase E Decision D-BLOG1: a basic rich-text editor (Tiptap StarterKit +
// Link only). This allowlist is the server-side enforcement of that
// boundary — never trust the client, even though the editor itself already
// restricts what it can produce. Every link gets a forced rel/target
// regardless of what the client sent, closing the window.opener/tabnabbing
// gap a bare `target="_blank"` would leave open.
//
// Later extended (WordPress migration) to cover every tag actually present
// across the 19 real migrated posts — img, table/tbody/tr/td, h1, h6, hr,
// sup, u, ins, mark, figure, div — audited directly against their live
// bodies. Two tags that *do* appear in real WordPress export HTML were
// deliberately left out because the current 19 posts never use them:
// `thead`/`th` (every table here uses plain `td` rows, no header row) and
// `figcaption` (no post has one). Both are easy, low-risk additions later
// if new content needs them — adding an unused tag now would just be
// untested surface area.
const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h6',
  'strong', 'b', 'em', 'i', 'u', 'ins', 'sup', 'mark',
  'a', 'ul', 'ol', 'li', 'br', 'blockquote',
  'img', 'table', 'tbody', 'tr', 'td', 'hr', 'figure', 'div',
];

// Every WordPress block-editor class the audit found (has-black-color,
// wp-block-heading, MsoNormal, has-medium-font-size, ...) references CSS
// this site never loads, so keeping them would do nothing. The one
// exception is text alignment: it's real layout intent, cheap to support,
// and the Frontend ships matching CSS for exactly these three values (see
// the blog post body stylesheet). No other class value survives on any
// tag, on any tag -- this is a closed enum, not a pattern match.
const ALIGN_CLASSES = ['has-text-align-left', 'has-text-align-center', 'has-text-align-right'];
const ALIGNABLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'td'];

const IMAGE_ALLOWED_HOSTS = new Set(['vyoma.org', 'www.vyoma.org']);
const IMAGE_S3_HOST_RE = /^[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/i;

function isSafeImageSrc(src) {
  if (typeof src !== 'string' || !src) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false; // not an absolute http(s) URL -- reject rather than guess a base
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const isLocalDevHost =
    env.nodeEnv !== 'production' &&
    url.hostname === 'localhost' &&
    String(url.port || '') === String(env.port) &&
    url.pathname.startsWith('/local-media/');

  return isLocalDevHost || IMAGE_ALLOWED_HOSTS.has(url.hostname) || IMAGE_S3_HOST_RE.test(url.hostname);
}

export function sanitizeBlogBody(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'rel', 'target'],
      img: ['src', 'alt'],
      ol: ['start', 'type'], // numbering continuation/style (e.g. start="5", type="i") -- part of the content's actual meaning, not cosmetic
    },
    // Closed-enum class allowlist (see ALIGN_CLASSES above) -- sanitize-html
    // permits the `class` attribute itself automatically wherever this is
    // set, and strips any class token not in the list, never passing
    // through an arbitrary class value. No `style` attribute is permitted
    // anywhere in this document, on any tag, at any point -- CSS is a real
    // injection/exfiltration surface (e.g. background-image: url(...)) and
    // the only thing it would buy here is cosmetic (mark's custom highlight
    // color, hr's custom divider color), not content.
    allowedClasses: Object.fromEntries(ALIGNABLE_TAGS.map((tag) => [tag, ALIGN_CLASSES])),
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
      // WordPress represents table-cell alignment as `data-align` instead
      // of a class. Normalized here to the same has-text-align-* family
      // used everywhere else, so the Frontend only needs one set of CSS
      // rules and `allowedClasses` is still the single point that decides
      // what survives -- an unrecognized data-align value is simply
      // dropped, never passed through.
      td: (tagName, attribs) => {
        const next = { ...attribs };
        const align = next['data-align'];
        const existingClasses = (next.class || '').split(/\s+/).filter(Boolean);
        // Some real cells carry both `class="has-text-align-center"` AND
        // `data-align="center"` at once -- append only if the target class
        // isn't already there, or this would produce a duplicate token
        // (e.g. "has-text-align-center has-text-align-center").
        if ((align === 'left' || align === 'center' || align === 'right') && !existingClasses.includes(`has-text-align-${align}`)) {
          next.class = [...existingClasses, `has-text-align-${align}`].join(' ');
        }
        delete next['data-align'];
        return { tagName, attribs: next };
      },
    },
    // img and hr are void elements, so an unlisted/unsafe tag would
    // normally just vanish with no trace -- that's fine for scripts/
    // iframes, but for img specifically we want a single, explicit host
    // check rather than relying on scheme filtering alone (which stops
    // javascript:/data: but not an untrusted https:// domain).
    // exclusiveFilter drops only the offending <img> itself; every other
    // tag and all surrounding text is untouched.
    exclusiveFilter: (frame) => frame.tag === 'img' && !isSafeImageSrc(frame.attribs.src),
  });
}
