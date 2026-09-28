'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useBlogPostEditor } from '@/lib/useBlogPostEditor';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { Tabs } from '@/components/admin/ui/Tabs';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';
import { ImageField } from '@/components/admin/ui/ImageField';
import { SimpleTextListForm } from '@/components/admin/ui/SimpleTextListForm';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { RichTextEditor } from '@/components/admin/cms/blog/RichTextEditor';
import { CategoryMultiSelect } from '@/components/admin/cms/blog/CategoryMultiSelect';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

function validatePost() {
  return null; // publish itself enforces title/body server-side with field-level errors surfaced via toast
}

function SlugField({ doc, busy, onChange }) {
  const locked = !!doc?.publishedAt;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc?.slug || '');

  if (locked) {
    return (
      <p className="font-sans text-xs text-charcoal/60">
        Slug: <strong>{doc.slug}</strong> — locked, this post has been published before.
      </p>
    );
  }

  if (!editing) {
    return (
      <p className="font-sans text-xs text-charcoal/60">
        Slug: <strong>{doc.slug}</strong>{' '}
        <button type="button" onClick={() => { setValue(doc.slug); setEditing(true); }} className="font-semibold text-vyoma-blue">
          Change
        </button>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input type="text" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} max-w-[280px]`} />
      <button
        type="button"
        disabled={busy === 'slug'}
        onClick={() => { onChange(value.trim()); setEditing(false); }}
        className="rounded-md bg-vyoma-blue px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-60"
      >
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="font-sans text-xs text-charcoal/60">
        Cancel
      </button>
    </div>
  );
}

function BlogEditorContent() {
  const { id } = useParams();
  const { enablePreview } = useAdminAuth();
  const { doc, draftValue, setFieldValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore, changeSlug } =
    useBlogPostEditor(id);
  const [activeTab, setActiveTab] = useState('post');
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const handlePreview = async () => {
    setPreviewError(null);
    try {
      const redirect = await enablePreview(`/media/blog/${doc.slug}`);
      window.open(redirect, '_blank');
    } catch (err) {
      setPreviewError(err.message);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-sans text-h2 font-bold text-vyoma-blue">Blog Post</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === 'draft'}
            onClick={() => saveDraft(validatePost)}
            className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          {doc?.slug && (
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-md border border-[var(--border-subtle)] px-4 py-2 font-sans text-sm font-semibold text-charcoal"
            >
              Preview draft
            </button>
          )}
          <button
            type="button"
            disabled={busy === 'publish'}
            onClick={() => publish(validatePost)}
            className="rounded-md border border-green-700 px-4 py-2 font-sans text-sm font-semibold text-green-700 disabled:opacity-60"
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
          <button
            type="button"
            disabled={busy === 'unpublish'}
            onClick={() => setConfirmUnpublish(true)}
            className="rounded-md border border-red-400 px-4 py-2 font-sans text-sm font-semibold text-red-600 disabled:opacity-60"
          >
            {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </div>
      </div>

      {doc && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="font-sans text-sm text-charcoal/60">
            Status: <strong>{doc.status}</strong>
            {doc.draftData != null && ' · unpublished draft changes pending'}
          </p>
          <SlugField doc={doc} busy={busy} onChange={changeSlug} />
        </div>
      )}
      {previewError && <p className="mb-3 font-sans text-xs text-red-600">{previewError}</p>}

      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      {!loading && draftValue && (
        <>
          <Tabs tabs={[{ key: 'post', label: 'Post' }, { key: 'seo', label: 'SEO' }]} active={activeTab} onChange={setActiveTab} />

          {activeTab === 'post' && (
            <div className="mb-8 space-y-4">
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Title</label>
                <input
                  type="text"
                  value={draftValue.title}
                  onChange={(e) => setFieldValue('title', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Excerpt</label>
                <textarea
                  value={draftValue.excerpt}
                  onChange={(e) => setFieldValue('excerpt', e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>
              <RichTextEditor value={draftValue.body} onChange={(body) => setFieldValue('body', body)} />
              <ImageField label="Featured image" value={draftValue.featuredImage} onChange={(img) => setFieldValue('featuredImage', img)} />
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Author</label>
                <input
                  type="text"
                  value={draftValue.author}
                  onChange={(e) => setFieldValue('author', e.target.value)}
                  className={`${inputClass} max-w-xs`}
                />
              </div>
              <CategoryMultiSelect value={draftValue.categories} onChange={(categories) => setFieldValue('categories', categories)} />
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Tags</label>
                <SimpleTextListForm
                  value={draftValue.tags}
                  onChange={(tags) => setFieldValue('tags', tags)}
                  placeholder="Tag"
                />
              </div>
            </div>
          )}

          {activeTab === 'seo' && (
            <div className="mb-8">
              <SeoForm value={draftValue.seo} onChange={(seo) => setFieldValue('seo', seo)} />
            </div>
          )}

          <div className="rounded-md border border-[var(--border-subtle)] p-4">
            <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Revision history</h2>
            {!revisions.length && <p className="font-sans text-sm text-charcoal/60">No revisions yet — publish once to create the first one.</p>}
            <ul className="flex flex-col gap-2">
              {revisions.map((r) => (
                <li key={r._id} className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] px-3 py-2">
                  <span className="font-sans text-sm text-charcoal">
                    v{r.version} · {r.action} · {new Date(r.createdAt).toLocaleString()} · {r.publishedByEmail}
                  </span>
                  <button
                    type="button"
                    disabled={busy === r._id}
                    onClick={() => setConfirmRestore(r)}
                    className="font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-60"
                  >
                    {busy === r._id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this post?"
        message="It will stop appearing on the public site immediately. Its content is kept and can be republished later."
        confirmLabel="Unpublish"
        onConfirm={() => {
          setConfirmUnpublish(false);
          unpublish();
        }}
        onCancel={() => setConfirmUnpublish(false)}
      />
      <ConfirmDialog
        open={!!confirmRestore}
        title={confirmRestore ? `Restore version ${confirmRestore.version}?` : ''}
        message="This immediately replaces the live published post and any unsaved draft edits will be lost."
        confirmLabel="Restore"
        onConfirm={() => {
          restore(confirmRestore);
          setConfirmRestore(null);
        }}
        onCancel={() => setConfirmRestore(null)}
      />
    </div>
  );
}

export default function BlogEditorPage() {
  return (
    <RequireAdminAuth>
      <BlogEditorContent />
    </RequireAdminAuth>
  );
}
