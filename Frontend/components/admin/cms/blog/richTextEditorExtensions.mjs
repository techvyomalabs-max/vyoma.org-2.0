// The Tiptap extension list for the blog post body editor, factored out of
// RichTextEditor.jsx so it can be imported, unmodified, by both the real
// React component and the Node-based round-trip fidelity test
// (RichTextEditor.roundtrip.test.mjs) -- the test must exercise the exact
// same schema the admin actually edits with, not a hand-copied approximation
// that could silently drift out of sync with it.
//
// Phase E Decision D-BLOG1, extended for the WordPress migration: covers
// every tag the server sanitizer (Backend/src/modules/blog/sanitizeBody.js)
// now allows, so nothing an admin opens gets silently dropped by the
// editor's own schema before the server even sees it. One tag the sanitizer
// allows is deliberately NOT given a dedicated extension here: `ins` (one
// post, two occurrences, no official Tiptap extension exists for it, and it
// is visually near-identical to the already-supported `u`). This is a
// documented, narrow gap -- see the compatibility report -- not an
// oversight. `figcaption` has zero occurrences in any real post, so it
// isn't declared as a Figure child type below; adding it is a one-line
// change whenever real content needs it.
import { Node, mergeAttributes } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { Superscript } from '@tiptap/extension-superscript';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextAlign } from '@tiptap/extension-text-align';

// Neither Tiptap nor its official extension set ships a plain structural
// `<div>` or `<figure>` wrapper -- both are needed here only because real
// WordPress content uses them to group an image (or image+text) together
// (15 posts use <figure>, 5 use <div>). No attributes are declared on
// either: the sanitizer never allows any (every WP class like
// "wp-block-media-text" is presentational noise with no matching CSS on
// this site), so there is nothing for the editor to carry that the server
// would keep anyway.
const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'block+',
  parseHTML: () => [{ tag: 'figure' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes), 0],
});

const Div = Node.create({
  name: 'div',
  group: 'block',
  content: 'block+',
  parseHTML: () => [{ tag: 'div' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes), 0],
});

// @tiptap/extension-text-align's own default only reads/writes an inline
// `style="text-align: ..."` -- it never recognizes WordPress's
// `class="has-text-align-*"` convention, so opening any real post (504
// occurrences of that class across the corpus) and saving it would
// silently drop the alignment. Worse, even after a fix to recognize it on
// parse, the default renderHTML would re-serialize it back out as
// `style`, which the sanitizer unconditionally strips (no `style`
// attribute is permitted anywhere, by design -- see sanitizeBody.js) --
// so the alignment would still be lost one step later, just at the server
// instead of the editor. This override makes both ends agree on one
// representation: the same closed set of `has-text-align-{left,center,
// right}` classes the sanitizer's `allowedClasses` enum already enforces.
// No `style` attribute is read, written, or round-tripped by this
// extension at any point.
const WordPressTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: (element) => {
              const fromClass = this.options.alignments.find((a) => element.classList.contains(`has-text-align-${a}`));
              if (fromClass) return fromClass;
              return this.options.defaultAlignment;
            },
            renderHTML: (attributes) => {
              if (!attributes.textAlign || !this.options.alignments.includes(attributes.textAlign)) return {};
              return { class: `has-text-align-${attributes.textAlign}` };
            },
          },
        },
      },
    ];
  },
});

export const blogEditorExtensions = [
  StarterKit.configure({
    // Level 1 preserves the 3 real posts that use <h1> in their body (the
    // post's own title field is separate and unaffected). Level 6
    // preserves the one real post using <h6> as a small in-table label.
    // 5 is skipped -- no real post uses it, and there's no security reason
    // to include an unused level.
    heading: { levels: [1, 2, 3, 4, 6] },
    strike: false,
    code: false,
    codeBlock: false,
    // horizontalRule: left at StarterKit's default (enabled) -- 5 real
    // posts use <hr> as a section divider.
  }),
  Link.configure({ openOnClick: false, autolink: false }),
  Underline,
  Superscript,
  Highlight, // renders <mark> by default; no custom colors (the sanitizer never allows a style/class value for it)
  // inline: true -- several real posts wrap an image in a link
  // (<a href="..."><img ...></a>, a WordPress "click thumbnail for
  // full-size" pattern). A block-level image can't sit inside an inline
  // link mark, so ProseMirror would silently drop the entire link (and
  // empty the surrounding paragraph) wherever that pattern occurs.
  Image.configure({ inline: true, allowBase64: false }),
  Figure,
  Div,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  WordPressTextAlign.configure({
    types: ['paragraph', 'heading', 'tableCell'],
    alignments: ['left', 'center', 'right'], // matches the sanitizer's closed class enum exactly -- no 'justify'
  }),
];
