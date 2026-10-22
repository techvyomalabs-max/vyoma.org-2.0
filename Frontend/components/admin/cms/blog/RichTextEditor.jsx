'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { blogEditorExtensions } from './richTextEditorExtensions.mjs';

const btnClass = (active) =>
  `rounded-md border px-2.5 py-1 font-sans text-xs font-semibold ${
    active ? 'border-vyoma-blue bg-vyoma-blue text-white' : 'border-[var(--border-subtle)] text-charcoal hover:border-vyoma-blue'
  }`;

// Phase E Decision D-BLOG1, extended for the WordPress migration (see
// richTextEditorExtensions.mjs for the full extension list and the
// reasoning behind it). What an admin sees in the editor is meant to be
// exactly what ends up published: every extension enabled here has a
// matching allowance in the server-side sanitizer (sanitizeBody.js), so the
// toolbar never offers something the server would silently strip back out
// on save.
export function RichTextEditor({ value, onChange, label = 'Body' }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: blogEditorExtensions,
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

  // Client-side check only, for a quick "that won't save" hint -- the
  // server sanitizer (sanitizeBody.js) is the real, authoritative gate on
  // which image hosts are trusted and can't be bypassed from here.
  const looksLikeTrustedImageHost = (url) => {
    try {
      const u = new URL(url);
      return (
        /^(www\.)?vyoma\.org$/i.test(u.hostname) ||
        /\.s3\.[a-z0-9-]+\.amazonaws\.com$/i.test(u.hostname) ||
        (u.hostname === 'localhost' && u.pathname.startsWith('/local-media/'))
      );
    } catch {
      return false;
    }
  };

  const openImagePrompt = () => {
    setImageUrl('');
    setImageAlt('');
    setImageOpen(true);
  };

  const applyImage = () => {
    const url = imageUrl.trim();
    if (url) editor.chain().focus().setImage({ src: url, alt: imageAlt.trim() }).run();
    setImageOpen(false);
  };

  const insertTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();

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
          <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} className={btnClass(editor.isActive('superscript'))}>
            Sup
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btnClass(editor.isActive('highlight'))}>
            Highlight
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
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            className={btnClass(editor.isActive('heading', { level: 4 }))}
          >
            H4
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
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)}>
            Divider
          </button>
          <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({ textAlign: 'left' }))}>
            Left
          </button>
          <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({ textAlign: 'center' }))}>
            Center
          </button>
          <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editor.isActive({ textAlign: 'right' }))}>
            Right
          </button>
          <button type="button" onClick={openLinkPrompt} className={btnClass(editor.isActive('link'))}>
            Link
          </button>
          <button type="button" onClick={openImagePrompt} className={btnClass(false)}>
            Image
          </button>
          <button type="button" onClick={insertTable} className={btnClass(editor.isActive('table'))}>
            Table
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

        {imageOpen && (
          <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] bg-white p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL (vyoma.org, S3, or local-media)"
                className="flex-1 rounded-md border border-[var(--border-subtle)] px-2 py-1 font-sans text-sm text-charcoal"
              />
              <input
                type="text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Alt text"
                className="w-40 rounded-md border border-[var(--border-subtle)] px-2 py-1 font-sans text-sm text-charcoal"
              />
            </div>
            {imageUrl.trim() && !looksLikeTrustedImageHost(imageUrl.trim()) && (
              <p className="font-sans text-xs text-red-600">
                This host isn&apos;t on the trusted list — the image will be removed when the draft is saved.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={applyImage} className="rounded-md bg-vyoma-blue px-2.5 py-1 font-sans text-xs font-semibold text-white">
                Insert
              </button>
              <button type="button" onClick={() => setImageOpen(false)} className="font-sans text-xs text-charcoal/60">
                Cancel
              </button>
            </div>
          </div>
        )}

        <EditorContent editor={editor} className="prose-blog min-h-[220px] px-3 py-2.5 font-sans text-sm text-charcoal" />
      </div>
    </div>
  );
}
