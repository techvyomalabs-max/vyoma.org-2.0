'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useToast } from '@/components/admin/ui/Toast';
import { Table } from '@/components/admin/ui/Table';
import { StateBlock } from '@/components/admin/ui/StateBlock';
import { Pagination } from '@/components/admin/ui/Pagination';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const LIMIT = 20;

function CategoriesPanel() {
  const { apiFetch } = useAdminAuth();
  const toast = useToast();
  const [categories, setCategories] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    apiFetch('/admin/blog/categories').then(setCategories).catch((err) => toast.error(err.message));
  }, [apiFetch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/admin/blog/categories', { method: 'POST', body: { name: newName.trim() } });
      setNewName('');
      toast.success('Category added.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (cat, name) => {
    if (!name.trim() || name.trim() === cat.name) return;
    setBusyId(cat._id);
    try {
      await apiFetch(`/admin/blog/categories/${cat._id}`, { method: 'PATCH', body: { name: name.trim() } });
      toast.success('Category renamed — every post using it was updated too.');
      load();
    } catch (err) {
      toast.error(err.message);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-6 rounded-md border border-[var(--border-subtle)] p-4">
      <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Categories</h2>
      <p className="mb-3 font-sans text-xs text-charcoal/60">
        Renaming a category updates every post that uses it. There is no delete — an unused category simply won&apos;t show up
        as a public filter option.
      </p>
      <StateBlock loading={!categories} empty={categories && !categories.length} emptyMessage="No categories yet.">
        <div className="mb-3 flex flex-wrap gap-2">
          {categories?.map((c) => (
            <input
              key={c._id}
              type="text"
              defaultValue={c.name}
              disabled={busyId === c._id}
              onBlur={(e) => handleRename(c, e.target.value)}
              className="w-40 rounded-md border border-[var(--border-subtle)] px-2 py-1 font-sans text-xs text-charcoal disabled:opacity-60"
            />
          ))}
        </div>
      </StateBlock>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="w-52 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-50"
        >
          {creating ? 'Adding…' : 'Add category'}
        </button>
      </form>
    </div>
  );
}

function BlogListContent() {
  const { apiFetch, apiFetchWithMeta } = useAdminAuth();
  const toast = useToast();
  const router = useRouter();
  const [posts, setPosts] = useState(null);
  const [meta, setMeta] = useState({ page: 1, limit: LIMIT, total: 0 });
  const [error, setError] = useState(null);
  const [newPost, setNewPost] = useState({ slug: '', title: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      try {
        const { data, meta: m } = await apiFetchWithMeta(`/admin/blog?page=${page}&limit=${LIMIT}`);
        setPosts(data);
        setMeta(m);
      } catch (err) {
        setError(err.message);
      }
    },
    [apiFetchWithMeta]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch('/admin/blog', { method: 'POST', body: newPost });
      toast.success('Draft created.');
      router.push(`/admin/content/blog/${created._id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Blog</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">
        Draft, preview, and publish blog posts. Each post has its own draft/publish workflow and revision history, same as
        every other structured page.
      </p>

      <CategoriesPanel />

      <StateBlock loading={!posts && !error} error={error} empty={posts && !posts.length} emptyMessage="No posts yet — create one below.">
        <Table
          columns={[
            { key: 'title', label: 'Title', render: (p) => p.draftData?.title || p.data?.title || '(untitled)' },
            { key: 'status', label: 'Status', render: (p) => (
              <span className={`rounded-pill px-2 py-0.5 font-sans text-xs font-semibold ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-charcoal/10 text-charcoal'}`}>
                {p.status}
              </span>
            ) },
            { key: 'categories', label: 'Categories', render: (p) => (p.draftData?.categories || p.data?.categories || []).join(', ') || '—' },
            { key: 'updatedAt', label: 'Updated', render: (p) => new Date(p.updatedAt).toLocaleDateString() },
          ]}
          rows={posts || []}
          rowKey={(p) => p._id}
          onRowClick={(p) => router.push(`/admin/content/blog/${p._id}`)}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPageChange={load} />
      </StateBlock>

      <form onSubmit={handleCreate} className="mt-6 rounded-md border border-vyoma-blue p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-vyoma-blue">New post</h2>
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={newPost.title}
            onChange={(e) => setNewPost((s) => ({ ...s, title: e.target.value }))}
            placeholder="Title"
            required
            className={inputClass}
          />
          <input
            type="text"
            value={newPost.slug}
            onChange={(e) => setNewPost((s) => ({ ...s, slug: e.target.value }))}
            placeholder="slug-in-kebab-case"
            required
            className={inputClass}
          />
        </div>
        <p className="mb-3 font-sans text-xs text-charcoal/60">
          The slug becomes the post&apos;s URL (/media/blog/…) and locks once this post is published for the first time.
        </p>
        <button type="submit" disabled={creating} className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60">
          {creating ? 'Creating…' : 'Create draft'}
        </button>
      </form>
    </div>
  );
}

export default function BlogListPage() {
  return (
    <RequireAdminAuth>
      <BlogListContent />
    </RequireAdminAuth>
  );
}
