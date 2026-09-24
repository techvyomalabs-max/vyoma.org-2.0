'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useToast } from '@/components/admin/ui/Toast';
import { Tabs } from '@/components/admin/ui/Tabs';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';
import { SectionEditorHeader } from '@/components/admin/cms/SectionEditorHeader';
import { HeroSlidesForm } from '@/components/admin/cms/home/HeroSlidesForm';
import { StatsForm } from '@/components/admin/cms/home/StatsForm';
import { TopicsForm } from '@/components/admin/cms/home/TopicsForm';
import { RegistrationsForm } from '@/components/admin/cms/home/RegistrationsForm';
import { ActivitiesForm } from '@/components/admin/cms/home/ActivitiesForm';
import { TestimonialsForm } from '@/components/admin/cms/home/TestimonialsForm';
import { CsrForm } from '@/components/admin/cms/home/CsrForm';
import { SponsorsForm } from '@/components/admin/cms/home/SponsorsForm';
import { SeoForm } from '@/components/admin/cms/home/SeoForm';

const TYPE = 'pages/home';

// Minimal, targeted validation — every link/CTA field must have a
// destination shaped correctly for its internal/external flag. Empty
// links (no label and no href) are fine — that means "no link," not an
// error. Returns the first problem found, or null.
function findLinkError(link, where) {
  if (!link) return null;
  const hasContent = link.label?.trim() || link.href?.trim();
  if (!hasContent) return null;
  if (!link.href?.trim()) return `${where}: a link needs a destination.`;
  if (link.external && !/^https?:\/\//i.test(link.href)) {
    return `${where}: an external link must start with http:// or https://.`;
  }
  if (!link.external && !link.href.startsWith('/')) {
    return `${where}: an internal link must start with "/".`;
  }
  return null;
}

function validateHomeContent(data) {
  for (const slide of data.HERO_SLIDES || []) {
    const err = findLinkError(slide.cta, `Hero Carousel "${slide.heading || 'Untitled'}"`);
    if (err) return err;
  }
  for (const r of data.REGISTRATIONS || []) {
    const err = findLinkError(r.link, `Registered and Recognized "${r.title || 'Untitled'}"`);
    if (err) return err;
  }
  for (const a of data.HOME_ACTIVITIES || []) {
    const err = findLinkError(a.link, `Vyoma's Activities "${a.title || 'Untitled'}"`);
    if (err) return err;
  }
  return null;
}

// Preserves the exact approved public Home order (see components/sections/
// PageHero etc. and app/(public)/page.js) as the tab order — this is a
// navigation aid within one editor, not a reordering of the public page.
const SECTIONS = [
  { key: 'HERO_SLIDES', label: 'Hero Carousel', Form: HeroSlidesForm, description: 'The rotating banner at the top of the homepage.' },
  { key: 'STATS', label: 'Statistics', Form: StatsForm, description: 'The blue strip of impact numbers.' },
  { key: 'TOPICS', label: 'Topics', Form: TopicsForm, description: 'The row of topic pills below the statistics.' },
  { key: 'REGISTRATIONS', label: 'Registered and Recognized', Form: RegistrationsForm, description: '"Registered and Recognized" section.' },
  { key: 'HOME_ACTIVITIES', label: "Vyoma's Activities", Form: ActivitiesForm, description: 'The four-card "What/Why/How/Where SSS" grid.' },
  { key: 'HOME_TESTIMONIALS', label: 'Testimonials', Form: TestimonialsForm, description: '"What People Are Saying" section.' },
  { key: 'CSR', label: 'CSR', Form: CsrForm, description: 'The CSR partnership banner.' },
  { key: 'SPONSORS', label: 'Co-Sponsors', Form: SponsorsForm, description: 'The sponsor logo strip at the bottom.' },
  { key: 'SEO', label: 'SEO', Form: SeoForm, description: 'Page title, meta description, canonical URL, and social image.' },
];

function HomeCmsContent() {
  const { apiFetch } = useAdminAuth();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [draftValue, setDraftValue] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [activeTab, setActiveTab] = useState(SECTIONS[0].key);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentDoc, revisionList] = await Promise.all([
        apiFetch(`/admin/content?type=${encodeURIComponent(TYPE)}`),
        apiFetch(`/admin/content/revisions?type=${encodeURIComponent(TYPE)}`),
      ]);
      setDoc(contentDoc);
      setDraftValue(contentDoc.draftData ?? contentDoc.data ?? null);
      setRevisions(revisionList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const setSectionValue = (key, value) => setDraftValue((prev) => ({ ...prev, [key]: value }));

  const runAction = async (key, fn, successMessage) => {
    setBusy(key);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = () => {
    const validationError = validateHomeContent(draftValue);
    if (validationError) return toast.error(validationError);
    return runAction(
      'draft',
      async () => {
        await apiFetch('/admin/content', { method: 'PUT', body: { type: TYPE, data: draftValue } });
        await load();
      },
      'Draft saved. The public Home page is unchanged.'
    );
  };

  const handlePublish = () => {
    const validationError = validateHomeContent(draftValue);
    if (validationError) return toast.error(validationError);
    return runAction(
      'publish',
      async () => {
        await apiFetch('/admin/content/publish', { method: 'POST', body: { type: TYPE } });
        await load();
      },
      'Published — now live on the real homepage.'
    );
  };

  const handleUnpublish = () => {
    setConfirmUnpublish(false);
    runAction(
      'unpublish',
      async () => {
        await apiFetch('/admin/content/unpublish', { method: 'POST', body: { type: TYPE } });
        await load();
      },
      'Unpublished — hidden from the public site.'
    );
  };

  const handleRestore = (revision) => {
    setConfirmRestore(null);
    runAction(
      revision._id,
      async () => {
        await apiFetch('/admin/content/revisions/restore', { method: 'POST', body: { type: TYPE, revisionId: revision._id } });
        await load();
      },
      `Restored version ${revision.version}.`
    );
  };

  const section = SECTIONS.find((s) => s.key === activeTab);

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-sans text-h2 font-bold text-vyoma-blue">Home</h1>
          {doc && (
            <p className="font-sans text-sm text-charcoal/60">
              Status: <strong>{doc.status}</strong>
              {doc.draftData != null && ' · unpublished draft changes pending'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === 'draft'}
            onClick={handleSaveDraft}
            className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={busy === 'publish'}
            onClick={handlePublish}
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

      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      {!loading && draftValue && (
        <>
          <Tabs tabs={SECTIONS.map((s) => ({ key: s.key, label: s.label }))} active={activeTab} onChange={setActiveTab} />

          <SectionEditorHeader
            pageName="Home"
            sectionName={section.label}
            description={section.description}
            publicPath="/"
          />

          <div className="mb-8">
            <section.Form value={draftValue[section.key]} onChange={(v) => setSectionValue(section.key, v)} />
          </div>

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
        title="Unpublish the Home page?"
        message="It will stop appearing on the public site immediately. Its content is kept and can be republished later."
        confirmLabel="Unpublish"
        onConfirm={handleUnpublish}
        onCancel={() => setConfirmUnpublish(false)}
      />
      <ConfirmDialog
        open={!!confirmRestore}
        title={confirmRestore ? `Restore version ${confirmRestore.version}?` : ''}
        message="This immediately replaces the live published content and any unsaved draft edits will be lost."
        confirmLabel="Restore"
        onConfirm={() => handleRestore(confirmRestore)}
        onCancel={() => setConfirmRestore(null)}
      />
    </div>
  );
}

export default function HomeCmsPage() {
  return (
    <RequireAdminAuth>
      <HomeCmsContent />
    </RequireAdminAuth>
  );
}
