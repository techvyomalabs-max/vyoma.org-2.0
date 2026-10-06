'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';

const btnClass = (active) =>
  `rounded-md border px-2.5 py-1 font-sans text-xs font-semibold ${
    active ? 'border-vyoma-blue bg-vyoma-blue text-white' : 'border-[var(--border-subtle)] text-charcoal hover:border-vyoma-blue'
  }`;

// Batch 2 (Privacy/Terms): a dedicated rich-text editor, separate from
// blog's RichTextEditor.jsx — deliberately not shared, since these two
// components are tied 1:1 to their own server-side sanitizer allowlist
// (this one to sanitizeLegalBody.js, blog's to sanitizeBody.js) and the
// two allowlists genuinely differ (h1, underline). Heading levels 1-3
// (h1 included — unlike blog, where h1 is reserved for the post's own
// title field; Privacy/Terms source content uses numbered h1/h2/h3-level
// section headings within the body itself, not just the page title,
// which is extracted separately at import time). Strike/code/codeBlock/
// horizontalRule disabled for the same reason blog's editor disables them:
// nothing in the toolbar should produce markup the sanitizer would then
// silently strip back out.
export function LegalRichTextEditor({ value, onChange, label = 'Body' }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  if (!editor) return null;

  const openLinkPrompt = () => {
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) {
      editor.chain().focus().setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };

  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{label}</label>
      <div className="rounded-md border border-[var(--border-subtle)]">
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] bg-sky-mist/40 p-2">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))}>
            Bold
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))}>
            Italic
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))}>
            Underline
          </button>
          <button type="button" onClick={() => editor.chain().focus().setParagraph().run()} className={btnClass(editor.isActive('paragraph'))}>
            Text
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={btnClass(editor.isActive('heading', { level: 1 }))}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={btnClass(editor.isActive('heading', { level: 2 }))}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={btnClass(editor.isActive('heading', { level: 3 }))}
          >
            H3
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))}>
            • List
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))}>
            1. List
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))}>
            Quote
          </button>
          <button type="button" onClick={openLinkPrompt} className={btnClass(editor.isActive('link'))}>
            Link
          </button>
        </div>

        {linkOpen && (
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-white p-2">
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https:// or mailto:… (leave blank to remove)"
              className="flex-1 rounded-md border border-[var(--border-subtle)] px-2 py-1 font-sans text-sm text-charcoal"
            />
            <button type="button" onClick={applyLink} className="rounded-md bg-vyoma-blue px-2.5 py-1 font-sans text-xs font-semibold text-white">
              Apply
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} className="font-sans text-xs text-charcoal/60">
              Cancel
            </button>
          </div>
        )}

        <EditorContent editor={editor} className="prose-blog min-h-[400px] px-3 py-2.5 font-sans text-sm text-charcoal" />
      </div>
    </div>
  );
}
